-- Door / SF Locker: bill shipping by integer kg = CEIL(actual total kg) × rate per kg.

CREATE OR REPLACE FUNCTION create_product_order(
  p_org_id UUID,
  p_items JSONB,
  p_contact JSONB,
  p_buyer_user_id UUID DEFAULT NULL,
  p_delivery JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_no TEXT;
  v_items_subtotal DECIMAL(10,2) := 0;
  v_total_kg NUMERIC := 0;
  v_line_kg NUMERIC;
  v_weight_raw TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_qty INT;
  v_unit_price DECIMAL(10,2);
  v_product_name TEXT;
  v_variant_label TEXT;
  v_available_stock INT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_delivery JSONB;
  v_method TEXT;
  v_details JSONB;
  v_rate NUMERIC := 0;
  v_billable_kg NUMERIC;
  v_shipping_fee DECIMAL(10,2) := 0;
  v_grand_total DECIMAL(10,2);
  v_stored_details JSONB;
  v_order_metadata JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orgs WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  v_delivery := COALESCE(p_delivery, '{}'::jsonb);

  v_first_name := NULLIF(TRIM(p_contact->>'first_name'), '');
  v_last_name := NULLIF(TRIM(p_contact->>'last_name'), '');
  v_email := NULLIF(LOWER(TRIM(p_contact->>'email')), '');
  v_phone := NULLIF(TRIM(p_contact->>'phone'), '');

  IF v_first_name IS NULL OR v_last_name IS NULL THEN
    RAISE EXCEPTION 'First name and last name are required';
  END IF;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF v_phone IS NULL OR v_phone = '' THEN
    RAISE EXCEPTION 'Phone is required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must have at least one item';
  END IF;

  v_method := NULLIF(LOWER(TRIM(v_delivery->>'delivery_method')), '');
  IF v_method IS NULL THEN
    RAISE EXCEPTION 'delivery_method is required';
  END IF;

  IF v_method NOT IN ('door', 'sf_locker', 'event_pickup') THEN
    RAISE EXCEPTION 'Invalid delivery_method';
  END IF;

  v_details := COALESCE(v_delivery->'delivery_details', '{}'::jsonb);

  IF v_method = 'door' THEN
    IF NULLIF(TRIM(COALESCE(v_details->>'building', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Building is required for door delivery';
    END IF;
    IF NULLIF(TRIM(COALESCE(v_details->>'street', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Street address is required for door delivery';
    END IF;
  ELSIF v_method = 'sf_locker' THEN
    IF NULLIF(TRIM(COALESCE(v_details->>'sf_locker_address', '')), '') IS NULL THEN
      RAISE EXCEPTION 'SF locker address is required';
    END IF;
    IF NULLIF(TRIM(COALESCE(v_details->>'sf_locker_code', '')), '') IS NULL THEN
      RAISE EXCEPTION 'SF locker code is required';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_qty := (v_item->>'qty')::INT;
    v_product_name := v_item->>'product_name';
    v_variant_label := v_item->>'variant_label';

    IF v_product_id IS NULL OR v_qty IS NULL OR v_qty < 1 THEN
      RAISE EXCEPTION 'Invalid item: product_id and qty required';
    END IF;

    IF v_variant_id IS NULL THEN
      SELECT id INTO v_variant_id
      FROM product_variants
      WHERE product_id = v_product_id
      ORDER BY created_at
      LIMIT 1;
    END IF;

    IF v_variant_id IS NOT NULL THEN
      SELECT COALESCE(pv.price, p.base_price, 0) INTO v_unit_price
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id AND p.org_id = p_org_id;
    ELSE
      SELECT base_price INTO v_unit_price
      FROM products
      WHERE id = v_product_id AND org_id = p_org_id;
    END IF;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Product or variant not found for org';
    END IF;

    IF v_product_name IS NULL OR v_product_name = '' THEN
      SELECT title INTO v_product_name FROM products WHERE id = v_product_id;
      v_product_name := COALESCE(v_product_name, 'Product');
    END IF;

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'Product % has no variants', v_product_name;
    END IF;

    SELECT COALESCE(SUM(ii.quantity), 0)::INT INTO v_available_stock
    FROM inventory_items ii
    WHERE ii.org_id = p_org_id
      AND ii.variant_id = v_variant_id;

    IF v_available_stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % (%). Available: %, Requested: %',
        v_product_name, COALESCE(v_variant_label, 'default'), v_available_stock, v_qty;
    END IF;

    v_line_kg := 0;
    SELECT COALESCE(metadata->>'shipping_weight_kg', '') INTO v_weight_raw
    FROM products
    WHERE id = v_product_id AND org_id = p_org_id;

    v_weight_raw := TRIM(BOTH FROM COALESCE(v_weight_raw, ''));
    IF v_weight_raw <> '' THEN
      BEGIN
        v_line_kg := v_weight_raw::NUMERIC;
      EXCEPTION WHEN invalid_text_representation THEN
        v_line_kg := 0;
      END;
    END IF;

    v_total_kg := v_total_kg + (v_line_kg * v_qty);
    v_items_subtotal := v_items_subtotal + (v_unit_price * v_qty);
  END LOOP;

  IF v_method = 'door' THEN
    v_rate := 25;
  ELSIF v_method = 'sf_locker' THEN
    v_rate := 16;
  ELSE
    v_rate := 0;
  END IF;

  IF v_rate > 0 AND v_total_kg <= 0 THEN
    RAISE EXCEPTION 'Each product needs a shipping weight (kg) set in the catalog for this delivery option';
  END IF;

  IF v_rate > 0 THEN
    v_billable_kg := CEIL(v_total_kg);
    v_shipping_fee := ROUND((v_billable_kg * v_rate)::NUMERIC, 2);
  ELSE
    v_billable_kg := NULL;
    v_shipping_fee := 0;
  END IF;

  v_grand_total := v_items_subtotal + v_shipping_fee;

  IF v_method = 'door' THEN
    v_stored_details := jsonb_strip_nulls(jsonb_build_object(
      'country', NULLIF(TRIM(COALESCE(v_details->>'country', '')), ''),
      'building', NULLIF(TRIM(COALESCE(v_details->>'building', '')), ''),
      'street', NULLIF(TRIM(COALESCE(v_details->>'street', '')), ''),
      'region', NULLIF(TRIM(COALESCE(v_details->>'region', '')), ''),
      'district', NULLIF(TRIM(COALESCE(v_details->>'district', '')), '')
    ));
  ELSIF v_method = 'sf_locker' THEN
    v_stored_details := jsonb_strip_nulls(jsonb_build_object(
      'sf_locker_address', NULLIF(TRIM(COALESCE(v_details->>'sf_locker_address', '')), ''),
      'sf_locker_code', NULLIF(TRIM(COALESCE(v_details->>'sf_locker_code', '')), '')
    ));
  ELSE
    v_stored_details := '{}'::jsonb;
  END IF;

  v_order_metadata := jsonb_build_object(
    'source', 'checkout',
    'delivery_method', v_method,
    'shipping_weight_kg', v_total_kg,
    'shipping_billable_kg', v_billable_kg,
    'shipping_rate_per_kg', v_rate,
    'shipping_fee', v_shipping_fee,
    'items_subtotal', v_items_subtotal,
    'delivery_details', v_stored_details
  );

  v_order_no := 'PROD-' || UPPER(TO_CHAR(NOW(), 'yymmdd')) || '-' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8);

  INSERT INTO orders (
    order_type,
    event_id,
    host_org_id,
    buyer_user_id,
    buyer_first_name,
    buyer_last_name,
    buyer_email,
    buyer_phone,
    total_amount,
    currency,
    order_no,
    status,
    payment_status,
    fulfillment_status,
    metadata
  ) VALUES (
    'product',
    NULL,
    p_org_id,
    p_buyer_user_id,
    v_first_name,
    v_last_name,
    v_email,
    v_phone,
    v_grand_total,
    'HKD',
    v_order_no,
    'pending',
    'unpaid',
    'pending_confirmation',
    v_order_metadata
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_qty := (v_item->>'qty')::INT;
    v_product_name := v_item->>'product_name';
    v_variant_label := v_item->>'variant_label';

    IF v_variant_id IS NULL THEN
      SELECT id INTO v_variant_id
      FROM product_variants
      WHERE product_id = v_product_id
      ORDER BY created_at
      LIMIT 1;
    END IF;

    IF v_variant_id IS NOT NULL THEN
      SELECT COALESCE(pv.price, p.base_price, 0) INTO v_unit_price
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id AND p.org_id = p_org_id;
    ELSE
      SELECT base_price INTO v_unit_price
      FROM products
      WHERE id = v_product_id AND org_id = p_org_id;
    END IF;

    IF v_product_name IS NULL OR v_product_name = '' THEN
      SELECT title INTO v_product_name FROM products WHERE id = v_product_id;
      v_product_name := COALESCE(v_product_name, 'Product');
    END IF;

    INSERT INTO order_items (
      order_id,
      ticket_type_id,
      quantity,
      unit_price,
      subtotal,
      metadata
    ) VALUES (
      v_order_id,
      NULL,
      v_qty,
      v_unit_price,
      v_unit_price * v_qty,
      jsonb_build_object(
        'product_id', v_product_id,
        'variant_id', v_variant_id,
        'product_name', v_product_name,
        'variant_label', v_variant_label,
        'is_product_order', true
      )
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION create_product_order IS 'Creates a product order with delivery/shipping. Door/SF: fee = CEIL(total kg) × rate per kg.';

GRANT EXECUTE ON FUNCTION create_product_order TO authenticated;
GRANT EXECUTE ON FUNCTION create_product_order TO anon;
