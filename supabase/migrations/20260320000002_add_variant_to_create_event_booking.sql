-- Update create_event_booking to accept ticket_type_access_variant_id in order lines
-- When variant is provided: use variant effective price (price_override or discount_percent), store variant_id on order_item
-- When variant is null: use ticket_types.price (existing behavior)

DROP FUNCTION IF EXISTS create_event_booking(uuid, jsonb, uuid, text, text, text, text, text, jsonb, uuid, jsonb) CASCADE;

CREATE OR REPLACE FUNCTION create_event_booking(
  p_event_id UUID,
  p_order_lines JSONB, -- Array of {ticket_type_id, quantity, ticket_type_access_variant_id?}
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
  i INT;
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
      -- Validate variant belongs to ticket type and event, fetch pricing
      SELECT v.price_override, v.discount_percent INTO v_price_override, v_discount_percent
      FROM ticket_type_access_variants v
      JOIN ticket_types tt ON tt.id = v.ticket_type_id
      WHERE v.id = v_variant_id AND tt.id = ((v_line->>'ticket_type_id')::UUID) AND tt.event_id = p_event_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found or does not belong to ticket type: %', v_variant_id;
      END IF;
      -- Effective price: price_override takes precedence, else discount_percent off base
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

  -- STEP 5: Compute addon total and validate products belong to event org
  v_addon_total := 0;
  IF p_addon_lines IS NOT NULL AND jsonb_array_length(p_addon_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_addon_lines)
    LOOP
      IF (v_line->>'product_id') IS NULL OR (v_line->>'quantity') IS NULL THEN
        RAISE EXCEPTION 'Addon line must have product_id and quantity';
      END IF;

      IF (v_line->>'product_variant_id') IS NOT NULL AND (v_line->>'product_variant_id') != '' THEN
        SELECT COALESCE(pv.price, p.base_price, 0), p.org_id
        INTO v_unit_price, v_product_org_id
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id AND pv.id = ((v_line->>'product_variant_id')::UUID)
        WHERE p.id = ((v_line->>'product_id')::UUID);
      ELSE
        SELECT COALESCE(p.base_price, 0), p.org_id
        INTO v_unit_price, v_product_org_id
        FROM products p
        WHERE p.id = ((v_line->>'product_id')::UUID);
      END IF;

      IF v_unit_price IS NULL THEN
        RAISE EXCEPTION 'Product or variant not found for addon: %', (v_line->>'product_id');
      END IF;

      IF v_product_org_id != v_event_org_id THEN
        RAISE EXCEPTION 'Addon product must belong to event organization';
      END IF;

      v_addon_total := v_addon_total + (v_unit_price * ((v_line->>'quantity')::INTEGER));
    END LOOP;
  END IF;

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

  -- STEP 8: Create order items and tickets (use variant price when variant_id provided, store variant_id)
  v_attendee_index := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
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
        INSERT INTO tickets (order_id, order_item_id, ticket_type_id, qr_code, status, first_name, last_name, email, phone)
        VALUES (v_order_id, v_order_item_id, (v_line->>'ticket_type_id')::UUID, v_qr_code, 'valid',
          COALESCE(v_attendee->>'first_name', NULL), COALESCE(v_attendee->>'last_name', NULL),
          COALESCE(v_attendee->>'email', NULL), COALESCE(v_attendee->>'phone', NULL))
        RETURNING id INTO v_ticket_id;
        v_attendee_index := v_attendee_index + 1;
      ELSE
        INSERT INTO tickets (order_id, order_item_id, ticket_type_id, qr_code, status, first_name, last_name, email, phone)
        VALUES (v_order_id, v_order_item_id, (v_line->>'ticket_type_id')::UUID, v_qr_code, 'valid',
          v_order_first_name, v_order_last_name, v_order_email, v_order_phone)
        RETURNING id INTO v_ticket_id;
      END IF;
      v_ticket_ids := array_append(v_ticket_ids, v_ticket_id);
    END LOOP;
  END LOOP;

  -- STEP 9: Create order addon items (with ticket_id when per-ticket mode)
  IF p_addon_lines IS NOT NULL AND jsonb_array_length(p_addon_lines) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_addon_lines)
    LOOP
      IF (v_line->>'product_variant_id') IS NOT NULL AND (v_line->>'product_variant_id') != '' THEN
        SELECT COALESCE(pv.price, p.base_price, 0) INTO v_unit_price
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id AND pv.id = ((v_line->>'product_variant_id')::UUID)
        WHERE p.id = ((v_line->>'product_id')::UUID);
      ELSE
        SELECT COALESCE(p.base_price, 0) INTO v_unit_price
        FROM products p WHERE p.id = ((v_line->>'product_id')::UUID);
      END IF;

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

GRANT EXECUTE ON FUNCTION create_event_booking TO authenticated;
GRANT EXECUTE ON FUNCTION create_event_booking TO anon;

ALTER FUNCTION create_event_booking(uuid,jsonb,uuid,text,text,text,text,text,jsonb,uuid,jsonb) SET search_path = public;

COMMENT ON FUNCTION create_event_booking IS 'Creates event booking with tickets and optional add-on products. Order lines may include ticket_type_access_variant_id for variant pricing and quota tracking. All amounts computed server-side.';
