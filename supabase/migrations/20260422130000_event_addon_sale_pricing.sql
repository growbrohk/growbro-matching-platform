-- Event-scoped add-on pricing (mirror ticket_type_access_variants: fixed price OR % off, not both)
-- + DRY apply_event_addon_pricing
-- + get_event_addons_for_checkout: list vs effective; base_list_price + effective base_price
-- + create_event_booking: require event_addon_products row and apply same pricing

-- 1) Columns + constraints
ALTER TABLE event_addon_products
  ADD COLUMN IF NOT EXISTS price_override DECIMAL(10,2) CHECK (price_override IS NULL OR price_override >= 0),
  ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));

ALTER TABLE event_addon_products
  DROP CONSTRAINT IF EXISTS chk_event_addon_price_xor_discount;

ALTER TABLE event_addon_products
  ADD CONSTRAINT chk_event_addon_price_xor_discount CHECK (
    (price_override IS NULL AND discount_percent IS NULL) OR
    (price_override IS NULL AND discount_percent IS NOT NULL) OR
    (price_override IS NOT NULL AND discount_percent IS NULL)
  );

COMMENT ON COLUMN event_addon_products.price_override IS
  'Optional fixed unit price for this add-on on this event (all variants). Mutually exclusive with discount_percent. NULL = use catalog.';
COMMENT ON COLUMN event_addon_products.discount_percent IS
  'Optional % off each variant''s list price (COALESCE(variant.price, product.base_price)). Mutually exclusive with price_override.';

-- 2) Shared pricing helper
CREATE OR REPLACE FUNCTION apply_event_addon_pricing(
  p_list DECIMAL(10,2),
  p_override DECIMAL(10,2),
  p_discount DECIMAL(5,2)
) RETURNS DECIMAL(10,2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_override IS NOT NULL THEN ROUND(p_override, 2)
    WHEN p_discount IS NOT NULL THEN ROUND((COALESCE(p_list, 0) * (1 - p_discount / 100))::NUMERIC, 2)
    ELSE COALESCE(p_list, 0)
  END
$$;

COMMENT ON FUNCTION apply_event_addon_pricing IS
  'Event add-on: fixed override wins, else % off list, else list. Used by get_event_addons_for_checkout and create_event_booking.';

-- 3) Checkout JSON
CREATE OR REPLACE FUNCTION get_event_addons_for_checkout(p_event_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_org_id UUID;
  v_warehouse_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND status = 'published') THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT e.org_id INTO v_org_id FROM events e WHERE e.id = p_event_id;

  SELECT w.id INTO v_warehouse_id
  FROM warehouses w
  WHERE w.org_id = v_org_id
  ORDER BY (CASE WHEN w.name ILIKE '%main%' THEN 0 ELSE 1 END), w.created_at
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'product_title', p.title,
      'product_image_url', p.image_url,
      'base_list_price', p.base_price,
      'base_price', apply_event_addon_pricing(COALESCE(p.base_price, 0), eap.price_override, eap.discount_percent),
      'is_required', eap.is_required,
      'sort_order', eap.sort_order,
      'fixed_quantity', eap.fixed_quantity,
      'show_remaining_stock', eap.show_remaining_stock,
      'product_description', p.description,
      'gallery_urls', COALESCE(p.metadata->'gallery_urls', '[]'::jsonb),
      'product_details', p.metadata->>'product_details',
      'size_and_fit', p.metadata->>'size_and_fit',
      'variants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', pv.id,
            'name', pv.name,
            'list_price', COALESCE(pv.price, p.base_price, 0),
            'price', apply_event_addon_pricing(
              COALESCE(pv.price, p.base_price, 0),
              eap.price_override,
              eap.discount_percent
            ),
            'stock_remaining',
              CASE
                WHEN eap.show_remaining_stock THEN COALESCE((
                  SELECT ii.quantity
                  FROM inventory_items ii
                  WHERE ii.variant_id = pv.id
                    AND v_warehouse_id IS NOT NULL
                    AND ii.warehouse_id = v_warehouse_id
                ), 0)
                ELSE NULL
              END
          )
          ORDER BY pv.created_at
        ), '[]'::jsonb)
        FROM product_variants pv
        WHERE pv.product_id = p.id
        AND (pv.archived_at IS NULL)
        AND COALESCE(pv.active, true) = true
      )
    )
    ORDER BY eap.sort_order, p.title
  ), '[]'::jsonb) INTO v_result
  FROM event_addon_products eap
  JOIN products p ON p.id = eap.product_id
  WHERE eap.event_id = p_event_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_event_addons_for_checkout IS
  'Add-ons for event checkout: image, per-variant list_price/price (promo), base_list_price/effective base_price, stock when enabled, product text fields.';

-- 4) create_event_booking: addon lines must be linked via event_addon_products; apply apply_event_addon_pricing
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
  'Creates event booking with tickets and optional add-on products. Add-ons must be linked in event_addon_products; pricing via apply_event_addon_pricing. Validates add-on stock when show_remaining_stock.';
