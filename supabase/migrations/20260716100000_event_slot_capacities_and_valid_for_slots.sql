-- =====================================================
-- Event-level slot capacity pools + ticket type multi-slot selection
-- =====================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS slot_capacities JSONB;

COMMENT ON COLUMN events.slot_capacities IS
  'Per time slot venue capacity. Keys: day_1..day_4. Shared pool across ticket types.';

ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS valid_for_slots TEXT[];

COMMENT ON COLUMN ticket_types.valid_for_slots IS
  'Time slots this ticket applies to (buyer picks one at checkout). NULL for all-access (all/both).';

COMMENT ON COLUMN ticket_types.slot_quotas IS
  'Per-slot allocation caps from the event pool. Keys: day_1..day_4.';

-- Count sold tickets for an event time slot (all ticket types)
CREATE OR REPLACE FUNCTION count_paid_tickets_for_event_slot(
  p_event_id UUID,
  p_time_slot TEXT
)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM tickets t
  JOIN orders o ON o.id = t.order_id
  JOIN ticket_types tt ON tt.id = t.ticket_type_id
  WHERE tt.event_id = p_event_id
    AND t.time_slot = p_time_slot
    AND t.status IN ('valid', 'scanned')
    AND o.payment_status IN ('paid', 'submitted')
    AND (o.fulfillment_status IS NULL OR o.fulfillment_status != 'cancelled');
$$;

-- Whether ticket type uses pick-one slot inventory (not all-access)
CREATE OR REPLACE FUNCTION ticket_type_uses_pick_one_slots(
  p_valid_for_days TEXT,
  p_valid_for_slots TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_valid_for_days IN ('all', 'both') THEN false
    WHEN p_valid_for_slots IS NOT NULL AND array_length(p_valid_for_slots, 1) > 0 THEN true
    WHEN p_valid_for_days = 'each' THEN true
    WHEN p_valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4') THEN true
    ELSE false
  END;
$$;

-- Resolve time_slot for an order line
CREATE OR REPLACE FUNCTION resolve_order_line_time_slot(
  p_line JSONB,
  p_event_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_valid_for_days TEXT;
  v_valid_for_slots TEXT[];
  v_slot_quotas JSONB;
  v_time_slot TEXT;
BEGIN
  SELECT tt.valid_for_days, tt.valid_for_slots, tt.slot_quotas
  INTO v_valid_for_days, v_valid_for_slots, v_slot_quotas
  FROM ticket_types tt
  WHERE tt.id = ((p_line->>'ticket_type_id')::UUID)
    AND tt.event_id = p_event_id
    AND tt.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket type not found or inactive: %', (p_line->>'ticket_type_id');
  END IF;

  IF v_valid_for_days IN ('all', 'both') THEN
    RETURN NULL;
  END IF;

  IF v_valid_for_slots IS NOT NULL AND array_length(v_valid_for_slots, 1) > 0 THEN
    v_time_slot := NULLIF(TRIM(p_line->>'time_slot'), '');
    IF v_time_slot IS NULL THEN
      IF array_length(v_valid_for_slots, 1) = 1 THEN
        RETURN v_valid_for_slots[1];
      END IF;
      RAISE EXCEPTION 'time_slot is required for ticket type with multiple slot options';
    END IF;
    IF NOT (v_time_slot = ANY(v_valid_for_slots)) THEN
      RAISE EXCEPTION 'Invalid time_slot % for ticket type', v_time_slot;
    END IF;
    IF v_slot_quotas IS NOT NULL AND NOT (v_slot_quotas ? v_time_slot) THEN
      RAISE EXCEPTION 'No allocation configured for time slot %', v_time_slot;
    END IF;
    RETURN v_time_slot;
  END IF;

  IF v_valid_for_days = 'each' THEN
    v_time_slot := NULLIF(TRIM(p_line->>'time_slot'), '');
    IF v_time_slot IS NULL THEN
      RAISE EXCEPTION 'time_slot is required for ticket type with per-slot inventory';
    END IF;
    IF v_slot_quotas IS NULL OR NOT (v_slot_quotas ? v_time_slot) THEN
      RAISE EXCEPTION 'Invalid time_slot % for ticket type', v_time_slot;
    END IF;
    RETURN v_time_slot;
  ELSIF v_valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4') THEN
    RETURN v_valid_for_days;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

-- Validate ticket inventory (type allocation + event pool)
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
BEGIN
  SELECT e.slot_capacities INTO v_slot_capacities
  FROM events e WHERE e.id = p_event_id;

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
      -- Event+slot lock first (cross-type pool), then type+slot lock
      PERFORM pg_advisory_xact_lock(
        hashtext('event_slot:' || p_event_id::text || ':' || v_time_slot)
      );
      PERFORM pg_advisory_xact_lock(
        hashtext('ticket_slot:' || v_ticket_type_id::text || ':' || v_time_slot)
      );

      v_has_pool := v_slot_capacities IS NOT NULL
        AND v_slot_capacities != '{}'::jsonb
        AND (v_slot_capacities ? v_time_slot);

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
      IF v_sold + v_qty > v_slot_quota THEN
        RAISE EXCEPTION 'Insufficient tickets remaining for the selected time slot';
      END IF;

      IF v_has_pool THEN
        v_pool_capacity := (v_slot_capacities->>v_time_slot)::INTEGER;
        IF v_pool_capacity IS NULL OR v_pool_capacity < 1 THEN
          RAISE EXCEPTION 'No venue capacity configured for time slot %', v_time_slot;
        END IF;
        v_pool_sold := count_paid_tickets_for_event_slot(p_event_id, v_time_slot);
        IF v_pool_sold + v_qty > v_pool_capacity THEN
          RAISE EXCEPTION 'Insufficient venue capacity for the selected time slot';
        END IF;
      END IF;
    ELSE
      -- Aggregate quota for all-access and legacy
      PERFORM pg_advisory_xact_lock(
        hashtext('ticket_agg:' || v_ticket_type_id::text)
      );
      v_sold := count_paid_tickets_for_inventory(v_ticket_type_id, NULL);
      IF v_sold + v_qty > v_quota THEN
        RAISE EXCEPTION 'Insufficient tickets remaining';
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- get_ticket_types_with_remaining: pool-aware slot_remaining + valid_for_slots
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
      WHEN tt.valid_for_days = 'each'
        AND tt.slot_quotas IS NOT NULL AND tt.slot_quotas != '{}'::jsonb THEN
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
          FROM jsonb_each_text(tt.slot_quotas) AS sq(key, value)
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
GRANT EXECUTE ON FUNCTION count_paid_tickets_for_event_slot(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION count_paid_tickets_for_event_slot(UUID, TEXT) TO anon;

COMMENT ON FUNCTION get_ticket_types_with_remaining(UUID) IS
  'Returns ticket types with remaining_count, slot_remaining (min of type allocation and event pool), slot_pool_remaining, and valid_for_slots.';

-- Backfill valid_for_slots from legacy each / single day modes
UPDATE ticket_types tt
SET valid_for_slots = (
  SELECT ARRAY_AGG(k ORDER BY k)
  FROM jsonb_object_keys(tt.slot_quotas) AS k
)
WHERE tt.valid_for_days = 'each'
  AND tt.slot_quotas IS NOT NULL
  AND tt.slot_quotas != '{}'::jsonb
  AND (tt.valid_for_slots IS NULL OR array_length(tt.valid_for_slots, 1) IS NULL);

UPDATE ticket_types tt
SET valid_for_slots = ARRAY[tt.valid_for_days]
WHERE tt.valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4')
  AND (tt.valid_for_slots IS NULL OR array_length(tt.valid_for_slots, 1) IS NULL);
