-- =====================================================
-- Optional time slots 5–10
-- Widen single-slot checks that previously stopped at day_4
-- =====================================================

DO $$
DECLARE
  n integer;
BEGIN
  FOR n IN 5..10 LOOP
    EXECUTE format(
      'ALTER TABLE public.events ADD COLUMN IF NOT EXISTS day_%s_start_at timestamptz',
      n
    );
    EXECUTE format(
      'ALTER TABLE public.events ADD COLUMN IF NOT EXISTS day_%s_end_at timestamptz',
      n
    );
    EXECUTE format(
      'ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_day_%s_times_check',
      n
    );
    EXECUTE format(
      'ALTER TABLE public.events ADD CONSTRAINT events_day_%s_times_check CHECK (
         (day_%s_start_at IS NULL AND day_%s_end_at IS NULL)
         OR
         (day_%s_start_at IS NOT NULL AND day_%s_end_at IS NOT NULL AND day_%s_end_at > day_%s_start_at)
       )',
      n, n, n, n, n, n, n
    );
    EXECUTE format(
      'COMMENT ON COLUMN public.events.day_%s_start_at IS %L',
      n,
      format('Optional Time Slot %s start time. When set, day_%s_end_at must also be set.', n, n)
    );
    EXECUTE format(
      'COMMENT ON COLUMN public.events.day_%s_end_at IS %L',
      n,
      format('Optional Time Slot %s end time. When set, day_%s_start_at must also be set.', n, n)
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_single_time_slot(p_slot TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT p_slot ~ '^day_([1-9]|10)$';
$$;

COMMENT ON FUNCTION public.is_single_time_slot(TEXT) IS
  'True for a single event time slot key day_1 through day_10.';

ALTER TABLE public.ticket_types
  DROP CONSTRAINT IF EXISTS ticket_types_valid_for_days_check;

ALTER TABLE public.ticket_types
  ADD CONSTRAINT ticket_types_valid_for_days_check
  CHECK (
    valid_for_days IN ('both', 'all', 'each')
    OR public.is_single_time_slot(valid_for_days)
  );

COMMENT ON COLUMN public.ticket_types.valid_for_days IS
  'Which time slot(s) this ticket grants access: day_1..day_10, both (legacy), all, or each (separate per-slot inventory).';

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_time_slot_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_time_slot_check
  CHECK (time_slot IS NULL OR public.is_single_time_slot(time_slot));

COMMENT ON COLUMN public.tickets.time_slot IS
  'Purchased time slot for this ticket (day_1..day_10). NULL for legacy all-slots tickets.';

CREATE OR REPLACE FUNCTION public.ticket_type_uses_pick_one_slots(
  p_valid_for_days TEXT,
  p_valid_for_slots TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_valid_for_days IN ('all', 'both') THEN false
    WHEN p_valid_for_slots IS NOT NULL AND array_length(p_valid_for_slots, 1) > 0 THEN true
    WHEN p_valid_for_days = 'each' THEN true
    WHEN public.is_single_time_slot(p_valid_for_days) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_order_line_time_slot(
  p_line JSONB,
  p_event_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
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
  ELSIF public.is_single_time_slot(v_valid_for_days) THEN
    RETURN v_valid_for_days;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_ticket_order_lines(
  p_event_id UUID,
  p_order_lines JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
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
    ELSIF public.is_single_time_slot(v_valid_for_days) AND v_valid_for_days = v_time_slot THEN
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

CREATE OR REPLACE FUNCTION public.get_ticket_types_with_remaining(p_event_id UUID)
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
          OR (public.is_single_time_slot(tt.valid_for_days))
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
                WHEN public.is_single_time_slot(tt.valid_for_days) THEN
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
  SELECT ARRAY_AGG(slot_key ORDER BY slot_num)
  INTO v_slots
  FROM (
    SELECT v.slot_num, v.slot_key
    FROM public.events e
    CROSS JOIN LATERAL (
      VALUES
        (1, 'day_1'::text, e.start_at, e.end_at),
        (2, 'day_2', e.day_2_start_at, e.day_2_end_at),
        (3, 'day_3', e.day_3_start_at, e.day_3_end_at),
        (4, 'day_4', e.day_4_start_at, e.day_4_end_at),
        (5, 'day_5', e.day_5_start_at, e.day_5_end_at),
        (6, 'day_6', e.day_6_start_at, e.day_6_end_at),
        (7, 'day_7', e.day_7_start_at, e.day_7_end_at),
        (8, 'day_8', e.day_8_start_at, e.day_8_end_at),
        (9, 'day_9', e.day_9_start_at, e.day_9_end_at),
        (10, 'day_10', e.day_10_start_at, e.day_10_end_at)
    ) AS v(slot_num, slot_key, slot_start, slot_end)
    WHERE e.id = p_event_id
      AND v.slot_start IS NOT NULL
      AND v.slot_end IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.get_order_with_event_and_tickets(p_order_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order JSONB;
  v_event JSONB;
  v_order_items JSONB;
  v_order_addon_items JSONB;
  v_tickets JSONB;
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', o.id,
    'event_id', o.event_id,
    'buyer_user_id', o.buyer_user_id,
    'buyer_first_name', o.buyer_first_name,
    'buyer_last_name', o.buyer_last_name,
    'buyer_email', o.buyer_email,
    'buyer_phone', o.buyer_phone,
    'total_amount', o.total_amount,
    'currency', o.currency,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status,
    'order_no', o.order_no,
    'metadata', COALESCE(o.metadata, '{}'::jsonb),
    'receipt_url', o.receipt_url,
    'payment_reference_link', o.payment_reference_link,
    'submitted_at', o.submitted_at,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  ) INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF (v_order->>'event_id') IS NULL OR (v_order->>'event_id') = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'start_at', e.start_at,
    'end_at', e.end_at,
    'day_2_start_at', e.day_2_start_at,
    'day_2_end_at', e.day_2_end_at,
    'day_3_start_at', e.day_3_start_at,
    'day_3_end_at', e.day_3_end_at,
    'day_4_start_at', e.day_4_start_at,
    'day_4_end_at', e.day_4_end_at,
    'day_5_start_at', e.day_5_start_at,
    'day_5_end_at', e.day_5_end_at,
    'day_6_start_at', e.day_6_start_at,
    'day_6_end_at', e.day_6_end_at,
    'day_7_start_at', e.day_7_start_at,
    'day_7_end_at', e.day_7_end_at,
    'day_8_start_at', e.day_8_start_at,
    'day_8_end_at', e.day_8_end_at,
    'day_9_start_at', e.day_9_start_at,
    'day_9_end_at', e.day_9_end_at,
    'day_10_start_at', e.day_10_start_at,
    'day_10_end_at', e.day_10_end_at,
    'location_text', e.location_text,
    'enable_stripe', e.enable_stripe,
    'enable_payme', e.enable_payme,
    'enable_fps', e.enable_fps,
    'payme_link', e.payme_link,
    'fps_link', e.fps_link,
    'stripe_fee_bearer', COALESCE(e.stripe_fee_bearer, 'host'),
    'org_id', e.org_id
  ) INTO v_event
  FROM public.events e
  WHERE e.id = (v_order->>'event_id')::UUID
  AND (
    e.status = 'published'
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = e.org_id AND om.user_id = auth.uid())
    OR (SELECT created_at FROM public.orders WHERE id = p_order_id) > NOW() - INTERVAL '1 hour'
    OR public.collab_can_access_order(p_order_id, 'viewer', true)
  );

  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'ticket_type_id', oi.ticket_type_id,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'metadata', COALESCE(oi.metadata, '{}'::jsonb),
      'ticket_type_access_variant_id', oi.ticket_type_access_variant_id,
      'access_variant', CASE WHEN ttv.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ttv.id,
        'visibility_mode', ttv.visibility_mode,
        'access_code', ttv.access_code,
        'price_override', ttv.price_override,
        'discount_percent', ttv.discount_percent
      ) END,
      'ticket_type', CASE WHEN tt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', tt.id,
        'name', tt.name,
        'valid_for_days', tt.valid_for_days
      ) END
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb) INTO v_order_items
  FROM public.order_items oi
  LEFT JOIN public.ticket_types tt ON tt.id = oi.ticket_type_id
  LEFT JOIN public.ticket_type_access_variants ttv ON ttv.id = oi.ticket_type_access_variant_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oai.id,
      'product_id', oai.product_id,
      'product_variant_id', oai.product_variant_id,
      'quantity', oai.quantity,
      'unit_price', oai.unit_price,
      'subtotal', oai.subtotal,
      'label', oai.label,
      'variant_label', oai.variant_label,
      'ticket_id', oai.ticket_id,
      'shipped_at', oai.shipped_at,
      'carrier_tracking_number', oai.carrier_tracking_number
    )
    ORDER BY oai.created_at
  ), '[]'::jsonb) INTO v_order_addon_items
  FROM public.order_addon_items oai
  WHERE oai.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'ticket_type_id', t.ticket_type_id,
      'time_slot', t.time_slot,
      'qr_code', t.qr_code,
      'status', t.status,
      'refunded_at', t.refunded_at,
      'first_name', t.first_name,
      'last_name', t.last_name,
      'email', t.email,
      'phone', t.phone,
      'ticket_type', CASE WHEN tt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', tt.id,
        'name', tt.name,
        'valid_for_days', tt.valid_for_days
      ) END
    )
    ORDER BY t.created_at
  ), '[]'::jsonb) INTO v_tickets
  FROM public.tickets t
  LEFT JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
  WHERE t.order_id = p_order_id;

  v_result := jsonb_build_object(
    'order', v_order,
    'event', v_event,
    'order_items', v_order_items,
    'order_addon_items', v_order_addon_items,
    'tickets', v_tickets
  );

  RETURN v_result;
END;
$$;
