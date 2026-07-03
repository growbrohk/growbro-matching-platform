-- =====================================================
-- Per-slot ticket inventory (valid_for_days = 'each')
-- tickets.time_slot stores purchased slot
-- =====================================================

ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS slot_quotas JSONB;

COMMENT ON COLUMN ticket_types.slot_quotas IS 'Per-slot inventory when valid_for_days = each. Keys: day_1..day_4, values: integer quotas.';

ALTER TABLE ticket_types
  DROP CONSTRAINT IF EXISTS ticket_types_valid_for_days_check;

ALTER TABLE ticket_types
  ADD CONSTRAINT ticket_types_valid_for_days_check
  CHECK (valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4', 'both', 'all', 'each'));

COMMENT ON COLUMN ticket_types.valid_for_days IS 'Which time slot(s) this ticket grants access: day_1..day_4, both (legacy), all, or each (separate per-slot inventory).';

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS time_slot TEXT;

ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_time_slot_check;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_time_slot_check
  CHECK (time_slot IS NULL OR time_slot IN ('day_1', 'day_2', 'day_3', 'day_4'));

COMMENT ON COLUMN tickets.time_slot IS 'Purchased time slot for this ticket (day_1..day_4). NULL for legacy all-slots tickets.';

-- Count sold tickets (paid/submitted, non-cancelled) for inventory checks
CREATE OR REPLACE FUNCTION count_paid_tickets_for_inventory(
  p_ticket_type_id UUID,
  p_time_slot TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM tickets t
  JOIN orders o ON o.id = t.order_id
  WHERE t.ticket_type_id = p_ticket_type_id
    AND t.status IN ('valid', 'scanned')
    AND o.payment_status IN ('paid', 'submitted')
    AND (o.fulfillment_status IS NULL OR o.fulfillment_status != 'cancelled')
    AND (
      p_time_slot IS NULL
      OR t.time_slot = p_time_slot
    );
$$;

-- Resolve time_slot for an order line based on ticket type valid_for_days
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
  v_slot_quotas JSONB;
  v_time_slot TEXT;
BEGIN
  SELECT tt.valid_for_days, tt.slot_quotas
  INTO v_valid_for_days, v_slot_quotas
  FROM ticket_types tt
  WHERE tt.id = ((p_line->>'ticket_type_id')::UUID)
    AND tt.event_id = p_event_id
    AND tt.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket type not found or inactive: %', (p_line->>'ticket_type_id');
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
    -- all, both, day_1 default
    RETURN NULL;
  END IF;
END;
$$;

-- Validate ticket inventory before creating an order (with advisory locks)
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
  v_slot_quotas JSONB;
  v_quota INTEGER;
  v_time_slot TEXT;
  v_qty INTEGER;
  v_sold BIGINT;
  v_slot_quota INTEGER;
BEGIN
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

    SELECT tt.valid_for_days, tt.slot_quotas, tt.quota
    INTO v_valid_for_days, v_slot_quotas, v_quota
    FROM ticket_types tt
    WHERE tt.id = v_ticket_type_id
      AND tt.event_id = p_event_id
      AND tt.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ticket type not found or inactive: %', v_ticket_type_id;
    END IF;

    v_time_slot := resolve_order_line_time_slot(v_line, p_event_id);

    PERFORM pg_advisory_xact_lock(
      hashtext(v_ticket_type_id::text || COALESCE(v_time_slot, '__aggregate__'))
    );

    IF v_valid_for_days = 'each' THEN
      v_slot_quota := (v_slot_quotas->>v_time_slot)::INTEGER;
      IF v_slot_quota IS NULL OR v_slot_quota < 1 THEN
        RAISE EXCEPTION 'No inventory configured for time slot %', v_time_slot;
      END IF;
      v_sold := count_paid_tickets_for_inventory(v_ticket_type_id, v_time_slot);
      IF v_sold + v_qty > v_slot_quota THEN
        RAISE EXCEPTION 'Insufficient tickets remaining for the selected time slot';
      END IF;
    ELSE
      -- Aggregate quota for single-slot, all, both, and legacy
      v_sold := count_paid_tickets_for_inventory(v_ticket_type_id, NULL);
      IF v_sold + v_qty > v_quota THEN
        RAISE EXCEPTION 'Insufficient tickets remaining';
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- get_ticket_types_with_remaining: add slot_quotas and slot_remaining
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
  description TEXT,
  slot_quotas JSONB,
  slot_remaining JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  remaining_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    tt.description,
    tt.slot_quotas,
    CASE
      WHEN tt.valid_for_days = 'each' AND tt.slot_quotas IS NOT NULL AND tt.slot_quotas != '{}'::jsonb THEN
        (
          SELECT COALESCE(
            jsonb_object_agg(
              sq.key,
              GREATEST(0, sq.value::integer - COALESCE(sc.cnt, 0))
            ),
            '{}'::jsonb
          )
          FROM jsonb_each_text(tt.slot_quotas) AS sq(key, value)
          LEFT JOIN LATERAL (
            SELECT count_paid_tickets_for_inventory(tt.id, sq.key) AS cnt
          ) sc ON true
        )
      ELSE NULL
    END AS slot_remaining,
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

COMMENT ON FUNCTION get_ticket_types_with_remaining(UUID) IS
  'Returns ticket types with remaining_count and slot_remaining (for valid_for_days=each). Counts paid/submitted non-cancelled orders only.';

-- get_order_with_event_and_tickets: include time_slot on tickets
CREATE OR REPLACE FUNCTION get_order_with_event_and_tickets(p_order_id UUID)
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
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
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
  FROM orders o
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
    'location_text', e.location_text,
    'enable_stripe', e.enable_stripe,
    'enable_payme', e.enable_payme,
    'enable_fps', e.enable_fps,
    'payme_link', e.payme_link,
    'fps_link', e.fps_link,
    'stripe_fee_bearer', COALESCE(e.stripe_fee_bearer, 'host'),
    'org_id', e.org_id
  ) INTO v_event
  FROM events e
  WHERE e.id = (v_order->>'event_id')::UUID
  AND (
    e.status = 'published'
    OR EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = e.org_id AND om.user_id = auth.uid())
    OR (SELECT created_at FROM orders WHERE id = p_order_id) > NOW() - INTERVAL '1 hour'
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
  FROM order_items oi
  LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
  LEFT JOIN ticket_type_access_variants ttv ON ttv.id = oi.ticket_type_access_variant_id
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
  FROM order_addon_items oai
  WHERE oai.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'ticket_type_id', t.ticket_type_id,
      'time_slot', t.time_slot,
      'qr_code', t.qr_code,
      'status', t.status,
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
  FROM tickets t
  LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
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

-- create_event_booking: validate inventory + store time_slot on tickets
-- Based on 20260422130000_event_addon_sale_pricing.sql
CREATE OR REPLACE FUNCTION create_event_booking(
  p_event_id UUID,
  p_order_lines JSONB,
  p_buyer_user_id UUID DEFAULT NULL,
  p_buyer_first_name TEXT DEFAULT NULL,
  p_buyer_last_name TEXT DEFAULT NULL,
  p_buyer_email TEXT DEFAULT NULL,
  p_buyer_phone TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'HKD',
  p_attendees JSONB DEFAULT NULL,
  p_tracking_link_id UUID DEFAULT NULL,
  p_addon_lines JSONB DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_item_id UUID;
  v_line JSONB;
  v_attendee JSONB;
  v_qr_code TEXT;
  v_order_no TEXT;
  v_ticket_count INTEGER;
  v_attendee_index INTEGER;
  v_order_first_name TEXT;
  v_order_last_name TEXT;
  v_order_email TEXT;
  v_order_phone TEXT;
  v_first_attendee JSONB;
  v_order_status TEXT;
  v_payment_status TEXT;
  v_payment_method TEXT;
  v_fulfillment_status TEXT;
  v_total_amount DECIMAL(10,2);
  v_ticket_total DECIMAL(10,2);
  v_addon_total DECIMAL(10,2);
  v_unit_price DECIMAL(10,2);
  v_subtotal DECIMAL(10,2);
  v_product_org_id UUID;
  v_event_org_id UUID;
  v_collect_attendee_info TEXT;
  v_ticket_ids UUID[] := '{}';
  v_ticket_id UUID;
  v_ticket_index INT;
  v_variant_id UUID;
  v_base_price DECIMAL(10,2);
  v_price_override DECIMAL(10,2);
  v_discount_percent DECIMAL(5,2);
  v_warehouse_id UUID;
  v_req RECORD;
  v_stock_chk RECORD;
  i INT;
  v_addon_list_price DECIMAL(10,2);
  v_eap_po DECIMAL(10,2);
  v_eap_dp DECIMAL(5,2);
  v_time_slot TEXT;
BEGIN
  -- STEP 1: Order contact info
  IF p_buyer_email IS NOT NULL AND p_buyer_email != '' THEN
    v_order_first_name := p_buyer_first_name;
    v_order_last_name := p_buyer_last_name;
    v_order_email := p_buyer_email;
    v_order_phone := p_buyer_phone;
  ELSIF p_attendees IS NOT NULL AND jsonb_array_length(p_attendees) > 0 THEN
    v_first_attendee := p_attendees->0;
    v_order_first_name := COALESCE(v_first_attendee->>'first_name', '');
    v_order_last_name := COALESCE(v_first_attendee->>'last_name', '');
    v_order_email := COALESCE(v_first_attendee->>'email', '');
    v_order_phone := COALESCE(v_first_attendee->>'phone', '');
  ELSE
    v_order_first_name := NULL;
    v_order_last_name := NULL;
    v_order_email := NULL;
    v_order_phone := NULL;
  END IF;

  -- STEP 2: Validate event and fetch collect_attendee_info
  SELECT org_id, COALESCE(collect_attendee_info, 'primary') INTO v_event_org_id, v_collect_attendee_info
  FROM events WHERE id = p_event_id AND status = 'published';
  IF v_event_org_id IS NULL THEN
    RAISE EXCEPTION 'Event not found or not published';
  END IF;

  -- STEP 3: Validate tracking link
  IF p_tracking_link_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM tracking_links WHERE id = p_tracking_link_id) THEN
      RAISE WARNING 'Invalid tracking_link_id: %, ignoring', p_tracking_link_id;
    END IF;
  END IF;

  -- STEP 4: Compute ticket total (use variant effective price when variant_id provided)
  v_ticket_total := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    IF (v_line->>'ticket_type_id') IS NULL THEN
      RAISE EXCEPTION 'Order line must have ticket_type_id';
    END IF;

    SELECT tt.price INTO v_base_price
    FROM ticket_types tt
    WHERE tt.id = ((v_line->>'ticket_type_id')::UUID) AND tt.event_id = p_event_id AND tt.is_active = true;
    IF v_base_price IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found or inactive: %', (v_line->>'ticket_type_id');
    END IF;

    v_variant_id := NULL;
    v_price_override := NULL;
    v_discount_percent := NULL;
    IF (v_line->>'ticket_type_access_variant_id') IS NOT NULL AND (v_line->>'ticket_type_access_variant_id') != '' THEN
      v_variant_id := (v_line->>'ticket_type_access_variant_id')::UUID;
      SELECT v.price_override, v.discount_percent INTO v_price_override, v_discount_percent
      FROM ticket_type_access_variants v
      JOIN ticket_types tt ON tt.id = v.ticket_type_id
      WHERE v.id = v_variant_id AND tt.id = ((v_line->>'ticket_type_id')::UUID) AND tt.event_id = p_event_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found or does not belong to ticket type: %', v_variant_id;
      END IF;
      IF v_price_override IS NOT NULL THEN
        v_unit_price := v_price_override;
      ELSIF v_discount_percent IS NOT NULL THEN
        v_unit_price := v_base_price * (1 - v_discount_percent / 100);
      ELSE
        v_unit_price := v_base_price;
      END IF;
    ELSE
      v_unit_price := v_base_price;
    END IF;

    v_ticket_total := v_ticket_total + (v_unit_price * ((v_line->>'quantity')::INTEGER));
  END LOOP;

  -- STEP 5: Compute addon total (event_addon_products required; apply_event_addon_pricing)
  v_addon_total := 0;
  IF p_addon_lines IS NOT NULL AND jsonb_array_length(p_addon_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_addon_lines)
    LOOP
      IF (v_line->>'product_id') IS NULL OR (v_line->>'quantity') IS NULL THEN
        RAISE EXCEPTION 'Addon line must have product_id and quantity';
      END IF;

      IF (v_line->>'product_variant_id') IS NOT NULL AND (v_line->>'product_variant_id') != '' THEN
        SELECT
          COALESCE(pv.price, p.base_price, 0),
          p.org_id,
          eap.price_override,
          eap.discount_percent
        INTO v_addon_list_price, v_product_org_id, v_eap_po, v_eap_dp
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id AND pv.id = ((v_line->>'product_variant_id')::UUID)
        JOIN event_addon_products eap ON eap.event_id = p_event_id AND eap.product_id = p.id
        WHERE p.id = ((v_line->>'product_id')::UUID);
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Product is not an add-on for this event, or variant not found: %', (v_line->>'product_id');
        END IF;
      ELSE
        SELECT
          COALESCE(p.base_price, 0),
          p.org_id,
          eap.price_override,
          eap.discount_percent
        INTO v_addon_list_price, v_product_org_id, v_eap_po, v_eap_dp
        FROM products p
        JOIN event_addon_products eap ON eap.event_id = p_event_id AND eap.product_id = p.id
        WHERE p.id = ((v_line->>'product_id')::UUID);
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Product is not an add-on for this event, or product not found: %', (v_line->>'product_id');
        END IF;
      END IF;

      v_unit_price := apply_event_addon_pricing(v_addon_list_price, v_eap_po, v_eap_dp);

      IF v_product_org_id != v_event_org_id THEN
        RAISE EXCEPTION 'Addon product must belong to event organization';
      END IF;

      v_addon_total := v_addon_total + (v_unit_price * ((v_line->>'quantity')::INTEGER));
    END LOOP;
  END IF;

  -- STEP 5b: Add-on stock validation (show_remaining_stock)
  SELECT w.id INTO v_warehouse_id
  FROM warehouses w
  WHERE w.org_id = v_event_org_id
  ORDER BY (CASE WHEN w.name ILIKE '%main%' THEN 0 ELSE 1 END), w.created_at
  LIMIT 1;

  FOR v_req IN
    SELECT eap.product_id, p.title AS product_title
    FROM event_addon_products eap
    JOIN products p ON p.id = eap.product_id
    WHERE eap.event_id = p_event_id
      AND eap.is_required = true
      AND eap.show_remaining_stock = true
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM product_variants pv
      INNER JOIN inventory_items ii ON ii.variant_id = pv.id
        AND ii.warehouse_id IS NOT DISTINCT FROM v_warehouse_id
        AND ii.quantity > 0
      WHERE pv.product_id = v_req.product_id
        AND pv.archived_at IS NULL
        AND COALESCE(pv.active, true) = true
    ) THEN
      RAISE EXCEPTION 'Required add-on "%" is out of stock', v_req.product_title;
    END IF;
  END LOOP;

  FOR v_stock_chk IN
    WITH parsed AS (
      SELECT
        (elem->>'product_id')::uuid AS product_id,
        COALESCE((elem->>'quantity')::integer, 0) AS qty,
        NULLIF(TRIM(elem->>'product_variant_id'), '')::uuid AS explicit_variant_id
      FROM jsonb_array_elements(COALESCE(p_addon_lines, '[]'::jsonb)) AS elem
    ),
    expanded AS (
      SELECT
        p.product_id,
        p.qty,
        COALESCE(p.explicit_variant_id, fv.id) AS variant_id
      FROM parsed p
      LEFT JOIN LATERAL (
        SELECT pv.id
        FROM product_variants pv
        WHERE pv.product_id = p.product_id
          AND pv.archived_at IS NULL
          AND COALESCE(pv.active, true) = true
        ORDER BY pv.created_at
        LIMIT 1
      ) fv ON p.explicit_variant_id IS NULL
      WHERE p.qty > 0 AND COALESCE(p.explicit_variant_id, fv.id) IS NOT NULL
    ),
    joined AS (
      SELECT e.variant_id, SUM(e.qty)::integer AS total_qty
      FROM expanded e
      INNER JOIN event_addon_products eap ON eap.event_id = p_event_id
        AND eap.product_id = e.product_id
        AND eap.show_remaining_stock = true
      GROUP BY e.variant_id
    )
    SELECT
      j.variant_id,
      j.total_qty,
      COALESCE(ii.quantity, 0) AS available
    FROM joined j
    LEFT JOIN inventory_items ii ON ii.variant_id = j.variant_id
      AND ii.warehouse_id IS NOT DISTINCT FROM v_warehouse_id
  LOOP
    IF v_stock_chk.total_qty > v_stock_chk.available THEN
      RAISE EXCEPTION 'Insufficient stock for an add-on option';
    END IF;
  END LOOP;

  -- STEP 5c: Ticket inventory validation (per-slot + aggregate with advisory locks)
  PERFORM validate_ticket_order_lines(p_event_id, p_order_lines);

  v_total_amount := v_ticket_total + v_addon_total;

  -- STEP 6: Order status
  IF v_total_amount <= 0 THEN
    v_order_status := 'paid';
    v_payment_status := 'paid';
    v_payment_method := 'free';
    v_fulfillment_status := 'confirmed';
  ELSE
    v_order_status := 'pending';
    v_payment_status := 'unpaid';
    v_payment_method := NULL;
    v_fulfillment_status := 'pending_confirmation';
  END IF;

  v_order_no := generate_unique_code('ORD');

  -- STEP 7: Create order
  INSERT INTO orders (
    event_id, buyer_user_id, buyer_first_name, buyer_last_name, buyer_email, buyer_phone,
    total_amount, currency, status, payment_status, payment_method, fulfillment_status,
    order_no, tracking_link_id, paid_at, confirmed_at
  )
  VALUES (
    p_event_id, p_buyer_user_id, v_order_first_name, v_order_last_name, v_order_email, v_order_phone,
    v_total_amount, p_currency, v_order_status, v_payment_status, v_payment_method, v_fulfillment_status,
    v_order_no, p_tracking_link_id,
    CASE WHEN v_total_amount <= 0 THEN NOW() ELSE NULL END,
    CASE WHEN v_total_amount <= 0 THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  -- STEP 8: Create order items and tickets
  v_attendee_index := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    SELECT tt.price INTO v_base_price
    FROM ticket_types tt
    WHERE tt.id = ((v_line->>'ticket_type_id')::UUID) AND tt.event_id = p_event_id AND tt.is_active = true;

    IF v_base_price IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found or inactive: %', (v_line->>'ticket_type_id');
    END IF;

    v_time_slot := resolve_order_line_time_slot(v_line, p_event_id);

    v_variant_id := NULL;
    v_price_override := NULL;
    v_discount_percent := NULL;
    IF (v_line->>'ticket_type_access_variant_id') IS NOT NULL AND (v_line->>'ticket_type_access_variant_id') != '' THEN
      v_variant_id := (v_line->>'ticket_type_access_variant_id')::UUID;
      SELECT v.price_override, v.discount_percent INTO v_price_override, v_discount_percent
      FROM ticket_type_access_variants v
      JOIN ticket_types tt ON tt.id = v.ticket_type_id
      WHERE v.id = v_variant_id AND tt.id = ((v_line->>'ticket_type_id')::UUID) AND tt.event_id = p_event_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found or does not belong to ticket type: %', v_variant_id;
      END IF;
      IF v_price_override IS NOT NULL THEN
        v_unit_price := v_price_override;
      ELSIF v_discount_percent IS NOT NULL THEN
        v_unit_price := v_base_price * (1 - v_discount_percent / 100);
      ELSE
        v_unit_price := v_base_price;
      END IF;
    ELSE
      v_unit_price := v_base_price;
    END IF;

    v_subtotal := v_unit_price * ((v_line->>'quantity')::INTEGER);

    INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price, subtotal, ticket_type_access_variant_id)
    VALUES (
      v_order_id,
      (v_line->>'ticket_type_id')::UUID,
      (v_line->>'quantity')::INTEGER,
      v_unit_price,
      v_subtotal,
      v_variant_id
    )
    RETURNING id INTO v_order_item_id;

    v_ticket_count := (v_line->>'quantity')::INTEGER;
    FOR i IN 1..v_ticket_count
    LOOP
      v_qr_code := generate_unique_code('TK');
      IF p_attendees IS NOT NULL AND jsonb_array_length(p_attendees) > v_attendee_index THEN
        v_attendee := p_attendees->v_attendee_index;
        INSERT INTO tickets (order_id, order_item_id, ticket_type_id, time_slot, qr_code, status, first_name, last_name, email, phone)
        VALUES (v_order_id, v_order_item_id, (v_line->>'ticket_type_id')::UUID, v_time_slot, v_qr_code, 'valid',
          COALESCE(v_attendee->>'first_name', NULL), COALESCE(v_attendee->>'last_name', NULL),
          COALESCE(v_attendee->>'email', NULL), COALESCE(v_attendee->>'phone', NULL))
        RETURNING id INTO v_ticket_id;
        v_attendee_index := v_attendee_index + 1;
      ELSE
        INSERT INTO tickets (order_id, order_item_id, ticket_type_id, time_slot, qr_code, status, first_name, last_name, email, phone)
        VALUES (v_order_id, v_order_item_id, (v_line->>'ticket_type_id')::UUID, v_time_slot, v_qr_code, 'valid',
          v_order_first_name, v_order_last_name, v_order_email, v_order_phone)
        RETURNING id INTO v_ticket_id;
      END IF;
      v_ticket_ids := array_append(v_ticket_ids, v_ticket_id);
    END LOOP;
  END LOOP;

  -- STEP 9: order_addon_items (apply_event_addon_pricing; require event_addon_products)
  IF p_addon_lines IS NOT NULL AND jsonb_array_length(p_addon_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_addon_lines)
    LOOP
      IF (v_line->>'product_variant_id') IS NOT NULL AND (v_line->>'product_variant_id') != '' THEN
        SELECT
          COALESCE(pv.price, p.base_price, 0),
          eap.price_override,
          eap.discount_percent
        INTO v_addon_list_price, v_eap_po, v_eap_dp
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id AND pv.id = ((v_line->>'product_variant_id')::UUID)
        JOIN event_addon_products eap ON eap.event_id = p_event_id AND eap.product_id = p.id
        WHERE p.id = ((v_line->>'product_id')::UUID);
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Product is not an add-on for this event, or variant not found: %', (v_line->>'product_id');
        END IF;
      ELSE
        SELECT
          COALESCE(p.base_price, 0),
          eap.price_override,
          eap.discount_percent
        INTO v_addon_list_price, v_eap_po, v_eap_dp
        FROM products p
        JOIN event_addon_products eap ON eap.event_id = p_event_id AND eap.product_id = p.id
        WHERE p.id = ((v_line->>'product_id')::UUID);
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Product is not an add-on for this event, or product not found: %', (v_line->>'product_id');
        END IF;
      END IF;

      v_unit_price := apply_event_addon_pricing(v_addon_list_price, v_eap_po, v_eap_dp);

      v_subtotal := v_unit_price * ((v_line->>'quantity')::INTEGER);

      v_ticket_id := NULL;
      IF v_collect_attendee_info = 'per_ticket' AND (v_line->>'ticket_index') IS NOT NULL AND (v_line->>'ticket_index') != '' THEN
        v_ticket_index := ((v_line->>'ticket_index')::INT);
        IF v_ticket_index >= 0 AND v_ticket_index < array_length(v_ticket_ids, 1) THEN
          v_ticket_id := v_ticket_ids[v_ticket_index + 1];
        END IF;
      END IF;

      INSERT INTO order_addon_items (order_id, product_id, product_variant_id, quantity, unit_price, subtotal, label, variant_label, ticket_id)
      VALUES (
        v_order_id,
        (v_line->>'product_id')::UUID,
        CASE WHEN (v_line->>'product_variant_id') IS NOT NULL AND (v_line->>'product_variant_id') != ''
          THEN (v_line->>'product_variant_id')::UUID ELSE NULL END,
        (v_line->>'quantity')::INTEGER,
        v_unit_price,
        v_subtotal,
        v_line->>'label',
        v_line->>'variant_label',
        v_ticket_id
      );
    END LOOP;
  END IF;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION create_event_booking IS
  'Creates event booking with tickets and optional add-on products. Validates ticket inventory (per-slot for each mode) with advisory locks. Add-ons via event_addon_products.';
