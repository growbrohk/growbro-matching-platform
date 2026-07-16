-- =====================================================
-- Fix slot pool: backfill capacities, aggregate order qty,
-- sorted locks, sold-count RPC, simplify remaining RPC
-- =====================================================

-- Backfill events.slot_capacities as max(type allocations) per slot (not sum)
WITH event_slots AS (
  SELECT
    e.id AS event_id,
    slot_key
  FROM events e
  CROSS JOIN LATERAL (
    SELECT unnest(ARRAY['day_1', 'day_2', 'day_3', 'day_4']) AS slot_key
  ) slots
  WHERE
    (slot_key = 'day_1' AND e.start_at IS NOT NULL AND e.end_at IS NOT NULL)
    OR (slot_key = 'day_2' AND e.day_2_start_at IS NOT NULL AND e.day_2_end_at IS NOT NULL)
    OR (slot_key = 'day_3' AND e.day_3_start_at IS NOT NULL AND e.day_3_end_at IS NOT NULL)
    OR (slot_key = 'day_4' AND e.day_4_start_at IS NOT NULL AND e.day_4_end_at IS NOT NULL)
),
slot_max_alloc AS (
  SELECT
    es.event_id,
    es.slot_key,
    COALESCE(
      MAX(
        CASE
          WHEN tt.valid_for_days IN ('all', 'both') THEN NULL
          WHEN tt.slot_quotas IS NOT NULL AND (tt.slot_quotas ? es.slot_key)
            THEN (tt.slot_quotas->>es.slot_key)::integer
          WHEN tt.valid_for_slots IS NOT NULL AND es.slot_key = ANY(tt.valid_for_slots)
            THEN tt.quota
          WHEN tt.valid_for_days = es.slot_key
            THEN tt.quota
          ELSE NULL
        END
      ),
      100
    ) AS max_alloc
  FROM event_slots es
  LEFT JOIN ticket_types tt ON tt.event_id = es.event_id
  GROUP BY es.event_id, es.slot_key
),
event_caps AS (
  SELECT
    event_id,
    jsonb_object_agg(slot_key, max_alloc) AS computed_caps
  FROM slot_max_alloc
  GROUP BY event_id
  HAVING COUNT(*) > 1  -- multi-slot events only
)
UPDATE events e
SET slot_capacities = COALESCE(e.slot_capacities, '{}'::jsonb) || COALESCE((
  SELECT jsonb_object_agg(k, v)
  FROM jsonb_each(ec.computed_caps) AS x(k, v)
  WHERE e.slot_capacities IS NULL
     OR e.slot_capacities = '{}'::jsonb
     OR NOT (e.slot_capacities ? k)
), '{}'::jsonb)
FROM event_caps ec
WHERE e.id = ec.event_id
  AND (
    e.slot_capacities IS NULL
    OR e.slot_capacities = '{}'::jsonb
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(ec.computed_caps) k
      WHERE NOT (e.slot_capacities ? k)
    )
  );

-- RPC: per-slot sold counts for host form sold-floor validation
CREATE OR REPLACE FUNCTION get_event_slot_sold_counts(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_slot TEXT;
  v_pool_sold BIGINT;
  v_by_type JSONB;
  v_slots TEXT[];
BEGIN
  SELECT ARRAY_AGG(slot_key ORDER BY slot_key)
  INTO v_slots
  FROM (
    SELECT 'day_1'::text AS slot_key
    WHERE EXISTS (
      SELECT 1 FROM events e WHERE e.id = p_event_id AND e.start_at IS NOT NULL AND e.end_at IS NOT NULL
    )
    UNION ALL
    SELECT 'day_2' WHERE EXISTS (
      SELECT 1 FROM events e WHERE e.id = p_event_id AND e.day_2_start_at IS NOT NULL AND e.day_2_end_at IS NOT NULL
    )
    UNION ALL
    SELECT 'day_3' WHERE EXISTS (
      SELECT 1 FROM events e WHERE e.id = p_event_id AND e.day_3_start_at IS NOT NULL AND e.day_3_end_at IS NOT NULL
    )
    UNION ALL
    SELECT 'day_4' WHERE EXISTS (
      SELECT 1 FROM events e WHERE e.id = p_event_id AND e.day_4_start_at IS NOT NULL AND e.day_4_end_at IS NOT NULL
    )
  ) s;

  IF v_slots IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  FOREACH v_slot IN ARRAY v_slots
  LOOP
    v_pool_sold := count_paid_tickets_for_event_slot(p_event_id, v_slot);

    SELECT COALESCE(
      jsonb_object_agg(tt.id::text, count_paid_tickets_for_inventory(tt.id, v_slot)),
      '{}'::jsonb
    )
    INTO v_by_type
    FROM ticket_types tt
    WHERE tt.event_id = p_event_id
      AND ticket_type_uses_pick_one_slots(tt.valid_for_days, tt.valid_for_slots)
      AND (
        (tt.valid_for_slots IS NOT NULL AND v_slot = ANY(tt.valid_for_slots))
        OR (tt.valid_for_days = v_slot)
        OR (tt.valid_for_days = 'each' AND tt.slot_quotas IS NOT NULL AND (tt.slot_quotas ? v_slot))
      );

    v_result := v_result || jsonb_build_object(
      v_slot,
      jsonb_build_object(
        'pool_sold', v_pool_sold,
        'by_ticket_type', v_by_type
      )
    );
  END LOOP;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_event_slot_sold_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_slot_sold_counts(UUID) TO anon;

COMMENT ON FUNCTION get_event_slot_sold_counts(UUID) IS
  'Returns per-slot pool_sold and per-ticket-type sold counts for host form sold-floor validation.';

-- validate_ticket_order_lines: sorted locks + aggregate same-slot qty within order
CREATE OR REPLACE FUNCTION validate_ticket_order_lines(
  p_event_id UUID,
  p_order_lines JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_line JSONB;
  v_ticket_type_id UUID;
  v_valid_for_days TEXT;
  v_valid_for_slots TEXT[];
  v_slot_quotas JSONB;
  v_quota INTEGER;
  v_time_slot TEXT;
  v_qty INTEGER;
  v_sold BIGINT;
  v_pool_sold BIGINT;
  v_slot_quota INTEGER;
  v_pool_capacity INTEGER;
  v_slot_capacities JSONB;
  v_uses_pick_one BOOLEAN;
  v_has_pool BOOLEAN;
  v_lock_key TEXT;
  v_type_slot_key TEXT;
  v_agg_key TEXT;
  v_type_slot_qty JSONB := '{}'::jsonb;
  v_pool_slot_qty JSONB := '{}'::jsonb;
  v_agg_type_qty JSONB := '{}'::jsonb;
  v_req_qty INTEGER;
BEGIN
  SELECT e.slot_capacities INTO v_slot_capacities
  FROM events e WHERE e.id = p_event_id;

  -- Pass 1: resolve lines and aggregate requested qty
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    IF (v_line->>'ticket_type_id') IS NULL THEN
      RAISE EXCEPTION 'Order line must have ticket_type_id';
    END IF;

    v_ticket_type_id := (v_line->>'ticket_type_id')::UUID;
    v_qty := COALESCE((v_line->>'quantity')::INTEGER, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Order line quantity must be positive';
    END IF;

    SELECT tt.valid_for_days, tt.valid_for_slots, tt.slot_quotas, tt.quota
    INTO v_valid_for_days, v_valid_for_slots, v_slot_quotas, v_quota
    FROM ticket_types tt
    WHERE tt.id = v_ticket_type_id
      AND tt.event_id = p_event_id
      AND tt.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ticket type not found or inactive: %', v_ticket_type_id;
    END IF;

    v_uses_pick_one := ticket_type_uses_pick_one_slots(v_valid_for_days, v_valid_for_slots);
    v_time_slot := resolve_order_line_time_slot(v_line, p_event_id);

    IF v_uses_pick_one AND v_time_slot IS NOT NULL THEN
      v_type_slot_key := v_ticket_type_id::text || ':' || v_time_slot;
      v_type_slot_qty := jsonb_set(
        v_type_slot_qty,
        ARRAY[v_type_slot_key],
        to_jsonb(COALESCE((v_type_slot_qty->>v_type_slot_key)::integer, 0) + v_qty)
      );
      v_pool_slot_qty := jsonb_set(
        v_pool_slot_qty,
        ARRAY[v_time_slot],
        to_jsonb(COALESCE((v_pool_slot_qty->>v_time_slot)::integer, 0) + v_qty)
      );
    ELSE
      v_agg_key := v_ticket_type_id::text;
      v_agg_type_qty := jsonb_set(
        v_agg_type_qty,
        ARRAY[v_agg_key],
        to_jsonb(COALESCE((v_agg_type_qty->>v_agg_key)::integer, 0) + v_qty)
      );
    END IF;
  END LOOP;

  -- Pass 2: acquire locks in sorted order (event_slot first, then ticket_slot, then aggregate)
  FOR v_lock_key IN
    SELECT lock_key FROM (
      SELECT DISTINCT 'event_slot:' || p_event_id::text || ':' || key AS lock_key, 1 AS ord, key AS sort_k
      FROM jsonb_object_keys(v_pool_slot_qty) AS key
      UNION ALL
      SELECT DISTINCT 'ticket_slot:' || split_part(key, ':', 1) || ':' || split_part(key, ':', 2), 2, key
      FROM jsonb_object_keys(v_type_slot_qty) AS key
      UNION ALL
      SELECT DISTINCT 'ticket_agg:' || key, 3, key
      FROM jsonb_object_keys(v_agg_type_qty) AS key
    ) locks
    ORDER BY ord, sort_k
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));
  END LOOP;

  -- Pass 3: validate aggregated qty against sold + capacity
  FOR v_type_slot_key, v_req_qty IN
    SELECT key, value::integer FROM jsonb_each_text(v_type_slot_qty)
  LOOP
    v_ticket_type_id := split_part(v_type_slot_key, ':', 1)::UUID;
    v_time_slot := split_part(v_type_slot_key, ':', 2);

    SELECT tt.valid_for_days, tt.slot_quotas, tt.quota
    INTO v_valid_for_days, v_slot_quotas, v_quota
    FROM ticket_types tt
    WHERE tt.id = v_ticket_type_id;

    IF v_slot_quotas IS NOT NULL AND (v_slot_quotas ? v_time_slot) THEN
      v_slot_quota := (v_slot_quotas->>v_time_slot)::INTEGER;
    ELSIF v_valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4') AND v_valid_for_days = v_time_slot THEN
      v_slot_quota := v_quota;
    ELSE
      v_slot_quota := NULL;
    END IF;

    IF v_slot_quota IS NULL OR v_slot_quota < 1 THEN
      RAISE EXCEPTION 'No inventory configured for time slot %', v_time_slot;
    END IF;

    v_sold := count_paid_tickets_for_inventory(v_ticket_type_id, v_time_slot);
    IF v_sold + v_req_qty > v_slot_quota THEN
      RAISE EXCEPTION 'Insufficient tickets remaining for the selected time slot';
    END IF;
  END LOOP;

  FOR v_time_slot, v_req_qty IN
    SELECT key, value::integer FROM jsonb_each_text(v_pool_slot_qty)
  LOOP
    v_has_pool := v_slot_capacities IS NOT NULL
      AND v_slot_capacities != '{}'::jsonb
      AND (v_slot_capacities ? v_time_slot);

    IF v_has_pool THEN
      v_pool_capacity := (v_slot_capacities->>v_time_slot)::INTEGER;
      IF v_pool_capacity IS NULL OR v_pool_capacity < 1 THEN
        RAISE EXCEPTION 'No venue capacity configured for time slot %', v_time_slot;
      END IF;
      v_pool_sold := count_paid_tickets_for_event_slot(p_event_id, v_time_slot);
      IF v_pool_sold + v_req_qty > v_pool_capacity THEN
        RAISE EXCEPTION 'Insufficient venue capacity for the selected time slot';
      END IF;
    END IF;
  END LOOP;

  FOR v_agg_key, v_req_qty IN
    SELECT key, value::integer FROM jsonb_each_text(v_agg_type_qty)
  LOOP
    v_ticket_type_id := v_agg_key::UUID;
    SELECT tt.quota INTO v_quota FROM ticket_types tt WHERE tt.id = v_ticket_type_id;
    v_sold := count_paid_tickets_for_inventory(v_ticket_type_id, NULL);
    IF v_sold + v_req_qty > v_quota THEN
      RAISE EXCEPTION 'Insufficient tickets remaining';
    END IF;
  END LOOP;
END;
$$;

-- Simplify get_ticket_types_with_remaining: drop dead each-only branch
DROP FUNCTION IF EXISTS get_ticket_types_with_remaining(UUID);

CREATE FUNCTION get_ticket_types_with_remaining(p_event_id UUID)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  name TEXT,
  price DECIMAL(10,2),
  quota INTEGER,
  metadata JSONB,
  visibility_mode TEXT,
  access_code TEXT,
  allowed_affiliates TEXT[],
  is_active BOOLEAN,
  availability_mode TEXT,
  available_start_at TIMESTAMPTZ,
  available_end_at TIMESTAMPTZ,
  show_remaining_count BOOLEAN,
  threshold_to_show INTEGER,
  valid_for_days TEXT,
  valid_for_slots TEXT[],
  description TEXT,
  slot_quotas JSONB,
  slot_remaining JSONB,
  slot_pool_remaining JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  remaining_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_capacities JSONB;
BEGIN
  SELECT e.slot_capacities INTO v_slot_capacities
  FROM events e WHERE e.id = p_event_id;

  RETURN QUERY
  SELECT
    tt.id,
    tt.event_id,
    tt.name,
    tt.price,
    tt.quota,
    tt.metadata,
    tt.visibility_mode,
    tt.access_code,
    tt.allowed_affiliates,
    tt.is_active,
    tt.availability_mode,
    tt.available_start_at,
    tt.available_end_at,
    tt.show_remaining_count,
    tt.threshold_to_show,
    tt.valid_for_days,
    tt.valid_for_slots,
    tt.description,
    tt.slot_quotas,
    CASE
      WHEN ticket_type_uses_pick_one_slots(tt.valid_for_days, tt.valid_for_slots)
        AND (
          (tt.slot_quotas IS NOT NULL AND tt.slot_quotas != '{}'::jsonb)
          OR (tt.valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4'))
          OR (tt.valid_for_days = 'each')
        ) THEN
        (
          SELECT COALESCE(
            jsonb_object_agg(
              sq.key,
              GREATEST(0, LEAST(
                sq.value::integer - COALESCE(sc.cnt, 0),
                CASE
                  WHEN v_slot_capacities IS NOT NULL AND (v_slot_capacities ? sq.key) THEN
                    GREATEST(0, (v_slot_capacities->>sq.key)::integer - COALESCE(pc.cnt, 0))
                  ELSE sq.value::integer - COALESCE(sc.cnt, 0)
                END
              ))
            ),
            '{}'::jsonb
          )
          FROM (
            SELECT sq2.key, sq2.value
            FROM jsonb_each_text(
              CASE
                WHEN tt.slot_quotas IS NOT NULL AND tt.slot_quotas != '{}'::jsonb THEN tt.slot_quotas
                WHEN tt.valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4') THEN
                  jsonb_build_object(tt.valid_for_days, tt.quota::text)
                ELSE '{}'::jsonb
              END
            ) AS sq2(key, value)
          ) sq
          LEFT JOIN LATERAL (
            SELECT count_paid_tickets_for_inventory(tt.id, sq.key) AS cnt
          ) sc ON true
          LEFT JOIN LATERAL (
            SELECT count_paid_tickets_for_event_slot(p_event_id, sq.key) AS cnt
          ) pc ON true
        )
      ELSE NULL
    END AS slot_remaining,
    CASE
      WHEN v_slot_capacities IS NOT NULL AND v_slot_capacities != '{}'::jsonb THEN
        (
          SELECT COALESCE(
            jsonb_object_agg(
              cap.key,
              GREATEST(0, cap.value::integer - COALESCE(pc.cnt, 0))
            ),
            '{}'::jsonb
          )
          FROM jsonb_each_text(v_slot_capacities) AS cap(key, value)
          LEFT JOIN LATERAL (
            SELECT count_paid_tickets_for_event_slot(p_event_id, cap.key) AS cnt
          ) pc ON true
        )
      ELSE NULL
    END AS slot_pool_remaining,
    tt.created_at,
    tt.updated_at,
    GREATEST(0, tt.quota - count_paid_tickets_for_inventory(tt.id, NULL)) AS remaining_count
  FROM ticket_types tt
  WHERE tt.event_id = p_event_id
  ORDER BY tt.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_ticket_types_with_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ticket_types_with_remaining(UUID) TO anon;
