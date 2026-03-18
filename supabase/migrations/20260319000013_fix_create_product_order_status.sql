-- Fix: create_product_order was inserting status='unpaid' which violates
-- orders.status CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')).
-- Use status='pending' instead; payment_status='unpaid' remains correct.

CREATE OR REPLACE FUNCTION create_product_order(
  p_org_id UUID,
  p_items JSONB,
  p_contact JSONB,
  p_buyer_user_id UUID DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_no TEXT;
  v_total DECIMAL(10,2) := 0;
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
BEGIN
  -- Validate org exists
  IF NOT EXISTS (SELECT 1 FROM orgs WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Extract contact info
  v_first_name := NULLIF(TRIM(p_contact->>'first_name'), '');
  v_last_name := NULLIF(TRIM(p_contact->>'last_name'), '');
  v_email := NULLIF(LOWER(TRIM(p_contact->>'email')), '');
  v_phone := NULLIF(TRIM(p_contact->>'phone'), '');

  IF v_first_name IS NULL OR v_last_name IS NULL THEN
    RAISE EXCEPTION 'First name and last name are required';
  END IF;

  -- Validate items and compute total
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must have at least one item';
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

    -- Resolve variant: use provided variant_id or first variant of product
    IF v_variant_id IS NULL THEN
      SELECT id INTO v_variant_id
      FROM product_variants
      WHERE product_id = v_product_id
      ORDER BY created_at
      LIMIT 1;
    END IF;

    -- Get unit price from variant or product
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

    -- Get product name if not provided
    IF v_product_name IS NULL OR v_product_name = '' THEN
      SELECT title INTO v_product_name FROM products WHERE id = v_product_id;
      v_product_name := COALESCE(v_product_name, 'Product');
    END IF;

    -- Check stock: total across all warehouses for this org (variant_id required)
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

    v_total := v_total + (v_unit_price * v_qty);
  END LOOP;

  -- Generate order number
  v_order_no := 'PROD-' || UPPER(TO_CHAR(NOW(), 'yymmdd')) || '-' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8);

  -- Create order (status='pending' satisfies order_status_check; payment_status='unpaid' is correct)
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
    v_total,
    'HKD',
    v_order_no,
    'pending',
    'unpaid',
    'pending_confirmation',
    jsonb_build_object('source', 'checkout')
  )
  RETURNING id INTO v_order_id;

  -- Create order items
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
