-- RPC: create_product_order - Creates product order for checkout (guest or authenticated)
-- RPC: get_order_with_org_and_products - Fetches product order with org and items for payment/success pages

-- ============================================================================
-- 1. create_product_order
-- ============================================================================
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

  -- Create order
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
    'unpaid',
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

GRANT EXECUTE ON FUNCTION create_product_order TO authenticated;
GRANT EXECUTE ON FUNCTION create_product_order TO anon;

COMMENT ON FUNCTION create_product_order IS 'Creates a product order for checkout. Validates stock, creates order and order_items. No auth required (guest checkout).';

-- ============================================================================
-- 2. get_order_with_org_and_products
-- ============================================================================
CREATE OR REPLACE FUNCTION get_order_with_org_and_products(p_order_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order JSONB;
  v_org JSONB;
  v_order_items JSONB;
  v_result JSONB;
  v_org_id UUID;
BEGIN
  -- Validate order exists and is product order
  SELECT o.host_org_id INTO v_org_id
  FROM orders o
  WHERE o.id = p_order_id AND o.order_type = 'product';

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch order
  SELECT jsonb_build_object(
    'id', o.id,
    'order_type', o.order_type,
    'host_org_id', o.host_org_id,
    'buyer_user_id', o.buyer_user_id,
    'buyer_first_name', o.buyer_first_name,
    'buyer_last_name', o.buyer_last_name,
    'buyer_email', o.buyer_email,
    'buyer_phone', o.buyer_phone,
    'total_amount', o.total_amount,
    'currency', o.currency,
    'order_no', o.order_no,
    'status', o.status,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'fulfillment_status', o.fulfillment_status,
    'receipt_url', o.receipt_url,
    'submitted_at', o.submitted_at,
    'paid_at', o.paid_at,
    'created_at', o.created_at
  ) INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  -- Fetch org with payment config from org_profiles
  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    'enable_stripe', COALESCE(op.enable_stripe, false),
    'enable_payme', COALESCE(op.enable_payme, false),
    'enable_fps', COALESCE(op.enable_fps, false),
    'payme_link', op.payme_link,
    'fps_link', op.fps_link
  ) INTO v_org
  FROM orgs o
  LEFT JOIN org_profiles op ON op.org_id = o.id
  WHERE o.id = v_org_id;

  -- Fetch order items (product order: ticket_type_id can be null, use metadata)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'metadata', COALESCE(oi.metadata, '{}'::jsonb),
      'product_name', COALESCE(oi.metadata->>'product_name', 'Item'),
      'variant_label', oi.metadata->>'variant_label'
    )
  ), '[]'::jsonb) INTO v_order_items
  FROM order_items oi
  WHERE oi.order_id = p_order_id;

  v_result := jsonb_build_object(
    'order', v_order,
    'org', v_org,
    'order_items', v_order_items
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_with_org_and_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_order_with_org_and_products TO anon;

COMMENT ON FUNCTION get_order_with_org_and_products IS 'Returns product order with org and order_items for payment/success pages. Public access for checkout flow.';
