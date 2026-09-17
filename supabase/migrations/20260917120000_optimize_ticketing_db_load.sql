-- Ticketing read-path optimizations: grouped inventory counts, scan lookup RPC, index.
-- Write-path helpers (count_paid_tickets_for_inventory, validate_ticket_order_lines) unchanged.

-- ============================================================================
-- 1. Index for inventory counting and host ticket filters
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_type_slot_active
  ON public.tickets (ticket_type_id, time_slot, status)
  WHERE refunded_at IS NULL;

-- ============================================================================
-- 2. get_ticket_types_with_remaining — single grouped pass over sold tickets
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_ticket_types_with_remaining(UUID);

CREATE FUNCTION public.get_ticket_types_with_remaining(p_event_id UUID)
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
  FROM public.events e
  WHERE e.id = p_event_id;

  RETURN QUERY
  WITH sold AS (
    SELECT
      t.ticket_type_id,
      t.time_slot,
      COUNT(*)::bigint AS cnt
    FROM public.tickets t
    JOIN public.orders o ON o.id = t.order_id
    JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = p_event_id
      AND t.refunded_at IS NULL
      AND t.status IN ('valid', 'scanned')
      AND o.payment_status IN ('paid', 'submitted')
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'cancelled')
    GROUP BY t.ticket_type_id, t.time_slot
  ),
  type_totals AS (
    SELECT ticket_type_id, SUM(cnt)::bigint AS total
    FROM sold
    GROUP BY ticket_type_id
  ),
  pool_by_slot AS (
    SELECT time_slot, SUM(cnt)::bigint AS cnt
    FROM sold
    WHERE time_slot IS NOT NULL
    GROUP BY time_slot
  ),
  pool_remaining_json AS (
    SELECT
      CASE
        WHEN v_slot_capacities IS NOT NULL AND v_slot_capacities <> '{}'::jsonb THEN
          (
            SELECT COALESCE(
              jsonb_object_agg(
                cap.key,
                GREATEST(0, cap.value::integer - COALESCE(pbs.cnt, 0))
              ),
              '{}'::jsonb
            )
            FROM jsonb_each_text(v_slot_capacities) AS cap(key, value)
            LEFT JOIN pool_by_slot pbs ON pbs.time_slot = cap.key
          )
        ELSE NULL
      END AS j
  )
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
          (tt.slot_quotas IS NOT NULL AND tt.slot_quotas <> '{}'::jsonb)
          OR (tt.valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4'))
          OR (tt.valid_for_days = 'each')
        ) THEN
        (
          SELECT COALESCE(
            jsonb_object_agg(
              sq.key,
              GREATEST(0, LEAST(
                sq.value::integer - COALESCE(
                  (SELECT s.cnt FROM sold s
                   WHERE s.ticket_type_id = tt.id AND s.time_slot = sq.key),
                  0
                ),
                CASE
                  WHEN v_slot_capacities IS NOT NULL AND (v_slot_capacities ? sq.key) THEN
                    GREATEST(0, (v_slot_capacities->>sq.key)::integer - COALESCE(
                      (SELECT pbs.cnt FROM pool_by_slot pbs WHERE pbs.time_slot = sq.key),
                      0
                    ))
                  ELSE sq.value::integer - COALESCE(
                    (SELECT s.cnt FROM sold s
                     WHERE s.ticket_type_id = tt.id AND s.time_slot = sq.key),
                    0
                  )
                END
              ))
            ),
            '{}'::jsonb
          )
          FROM (
            SELECT sq2.key, sq2.value
            FROM jsonb_each_text(
              CASE
                WHEN tt.slot_quotas IS NOT NULL AND tt.slot_quotas <> '{}'::jsonb THEN tt.slot_quotas
                WHEN tt.valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4') THEN
                  jsonb_build_object(tt.valid_for_days, tt.quota::text)
                ELSE '{}'::jsonb
              END
            ) AS sq2(key, value)
          ) sq
        )
      ELSE NULL
    END AS slot_remaining,
    (SELECT pr.j FROM pool_remaining_json pr) AS slot_pool_remaining,
    tt.created_at,
    tt.updated_at,
    GREATEST(0, tt.quota - COALESCE(
      (SELECT tot.total FROM type_totals tot WHERE tot.ticket_type_id = tt.id),
      0
    )) AS remaining_count
  FROM public.ticket_types tt
  WHERE tt.event_id = p_event_id
  ORDER BY tt.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ticket_types_with_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket_types_with_remaining(UUID) TO anon;

-- ============================================================================
-- 3. get_variant_remaining_counts — grouped by variant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_variant_remaining_counts(p_event_id UUID)
RETURNS TABLE (
  variant_id UUID,
  sold_count BIGINT,
  quota INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH sold AS (
    SELECT
      oi.ticket_type_access_variant_id AS variant_id,
      COUNT(*)::bigint AS sold_count
    FROM public.tickets t
    JOIN public.orders o ON o.id = t.order_id
    JOIN public.order_items oi ON oi.id = t.order_item_id
    JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = p_event_id
      AND t.refunded_at IS NULL
      AND t.status IN ('valid', 'scanned')
      AND o.payment_status IN ('paid', 'submitted')
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'cancelled')
      AND oi.ticket_type_access_variant_id IS NOT NULL
    GROUP BY oi.ticket_type_access_variant_id
  )
  SELECT
    v.id AS variant_id,
    COALESCE(s.sold_count, 0) AS sold_count,
    v.quota
  FROM public.ticket_type_access_variants v
  JOIN public.ticket_types tt ON tt.id = v.ticket_type_id
  LEFT JOIN sold s ON s.variant_id = v.id
  WHERE tt.event_id = p_event_id
    AND v.quota IS NOT NULL
    AND v.is_active = true;
END;
$$;

-- ============================================================================
-- 4. get_event_slot_sold_counts — one sold snapshot
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_event_slot_sold_counts(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_slot TEXT;
  v_slots TEXT[];
BEGIN
  SELECT ARRAY_AGG(slot_key ORDER BY slot_key)
  INTO v_slots
  FROM (
    SELECT 'day_1'::text AS slot_key
    WHERE EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id AND e.start_at IS NOT NULL AND e.end_at IS NOT NULL
    )
    UNION ALL
    SELECT 'day_2' WHERE EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id AND e.day_2_start_at IS NOT NULL AND e.day_2_end_at IS NOT NULL
    )
    UNION ALL
    SELECT 'day_3' WHERE EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id AND e.day_3_start_at IS NOT NULL AND e.day_3_end_at IS NOT NULL
    )
    UNION ALL
    SELECT 'day_4' WHERE EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id AND e.day_4_start_at IS NOT NULL AND e.day_4_end_at IS NOT NULL
    )
  ) s;

  IF v_slots IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  FOREACH v_slot IN ARRAY v_slots
  LOOP
    v_result := v_result || jsonb_build_object(
      v_slot,
      jsonb_build_object(
        'pool_sold', (
          SELECT COUNT(*)::bigint
          FROM public.tickets t
          JOIN public.orders o ON o.id = t.order_id
          JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
          WHERE tt.event_id = p_event_id
            AND t.time_slot = v_slot
            AND t.refunded_at IS NULL
            AND t.status IN ('valid', 'scanned')
            AND o.payment_status IN ('paid', 'submitted')
            AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'cancelled')
        ),
        'by_ticket_type', COALESCE((
          SELECT jsonb_object_agg(tt.id::text, type_cnt.cnt)
          FROM public.ticket_types tt
          JOIN LATERAL (
            SELECT COUNT(*)::bigint AS cnt
            FROM public.tickets t
            JOIN public.orders o ON o.id = t.order_id
            WHERE t.ticket_type_id = tt.id
              AND t.time_slot = v_slot
              AND t.refunded_at IS NULL
              AND t.status IN ('valid', 'scanned')
              AND o.payment_status IN ('paid', 'submitted')
              AND (o.fulfillment_status IS NULL OR o.fulfillment_status <> 'cancelled')
          ) type_cnt ON true
          WHERE tt.event_id = p_event_id
            AND ticket_type_uses_pick_one_slots(tt.valid_for_days, tt.valid_for_slots)
            AND (
              (tt.valid_for_slots IS NOT NULL AND v_slot = ANY(tt.valid_for_slots))
              OR (tt.valid_for_days = v_slot)
              OR (tt.valid_for_days = 'each' AND tt.slot_quotas IS NOT NULL AND (tt.slot_quotas ? v_slot))
            )
        ), '{}'::jsonb)
      )
    );
  END LOOP;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 5. lookup_ticket_for_scan — host authz + single lookup (qr then uuid id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.lookup_ticket_for_scan(p_event_id UUID, p_identifier TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_ticket_id UUID;
  v_identifier TEXT;
  v_row RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.org_members om ON om.org_id = e.org_id
    WHERE e.id = p_event_id
      AND om.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not have access to scan tickets for this event';
  END IF;

  v_identifier := TRIM(p_identifier);
  IF v_identifier = '' THEN
    RETURN NULL;
  END IF;

  SELECT t.id INTO v_ticket_id
  FROM public.tickets t
  JOIN public.orders o ON o.id = t.order_id
  WHERE o.event_id = p_event_id
    AND t.qr_code = v_identifier
  LIMIT 1;

  IF v_ticket_id IS NULL AND v_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT t.id INTO v_ticket_id
    FROM public.tickets t
    JOIN public.orders o ON o.id = t.order_id
    WHERE o.event_id = p_event_id
      AND t.id = v_identifier::uuid
    LIMIT 1;
  END IF;

  IF v_ticket_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    t.id,
    t.qr_code,
    t.status,
    t.refunded_at,
    t.scanned_at,
    t.first_name,
    t.last_name,
    t.email,
    t.phone,
    t.remark,
    t.order_id,
    t.time_slot,
    o.id AS order_pk,
    o.event_id,
    o.buyer_first_name,
    o.buyer_last_name,
    o.buyer_email,
    o.buyer_phone,
    o.metadata AS order_metadata,
    tt.name AS ticket_type_name,
    tt.valid_for_days
  INTO v_row
  FROM public.tickets t
  JOIN public.orders o ON o.id = t.order_id
  LEFT JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
  WHERE t.id = v_ticket_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'qr_code', v_row.qr_code,
    'status', v_row.status,
    'refunded_at', v_row.refunded_at,
    'scanned_at', v_row.scanned_at,
    'first_name', v_row.first_name,
    'last_name', v_row.last_name,
    'email', v_row.email,
    'phone', v_row.phone,
    'remark', v_row.remark,
    'order_id', v_row.order_id,
    'time_slot', v_row.time_slot,
    'order', jsonb_build_object(
      'id', v_row.order_pk,
      'event_id', v_row.event_id,
      'buyer_first_name', v_row.buyer_first_name,
      'buyer_last_name', v_row.buyer_last_name,
      'buyer_email', v_row.buyer_email,
      'buyer_phone', v_row.buyer_phone,
      'metadata', COALESCE(v_row.order_metadata, '{}'::jsonb),
      'order_addon_items', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'order_id', oai.order_id,
            'ticket_id', oai.ticket_id,
            'label', oai.label,
            'variant_label', oai.variant_label,
            'quantity', oai.quantity
          )
        )
        FROM public.order_addon_items oai
        WHERE oai.order_id = v_row.order_id
      ), '[]'::jsonb)
    ),
    'ticket_type', CASE
      WHEN v_row.ticket_type_name IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', v_row.ticket_type_name,
        'valid_for_days', v_row.valid_for_days
      )
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_ticket_for_scan(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.lookup_ticket_for_scan(UUID, TEXT) IS
  'Host-only ticket lookup for scan UI (by qr_code or ticket id). Returns ticket + order embed JSON.';
