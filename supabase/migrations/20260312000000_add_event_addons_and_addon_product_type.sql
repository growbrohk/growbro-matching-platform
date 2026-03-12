-- Migration: Add event add-ons support and addon product type
-- 1. Add 'addon' product type (hidden from public catalog)
-- 2. Create event_addon_products table (links events to add-on products with is_required)
-- 3. Extend order_items for add-on lines (product_id, product_variant_id)
-- 4. Create order_addon_items table for add-on line items (cleaner than extending order_items)

-- ============================================================================
-- 1. ADD 'addon' PRODUCT TYPE
-- ============================================================================

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check;
ALTER TABLE products ADD CONSTRAINT products_type_check CHECK (type IN ('physical', 'addon'));

COMMENT ON CONSTRAINT products_type_check ON products IS 'Products can be physical (catalog) or addon (event add-on only, hidden from catalog)';

-- Update create_product_with_variants to allow addon type
CREATE OR REPLACE FUNCTION create_product_with_variants(
  p_org_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_base_price DECIMAL,
  p_variant_names TEXT[] DEFAULT NULL,
  p_variant_skus TEXT[] DEFAULT NULL,
  p_variant_prices DECIMAL[] DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id UUID;
  v_user_id UUID;
  i INT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to this organization';
  END IF;

  IF p_type NOT IN ('physical', 'addon') THEN
    RAISE EXCEPTION 'Product type must be physical or addon';
  END IF;

  IF array_length(p_variant_names, 1) IS NOT NULL THEN
    IF array_length(p_variant_names, 1) IS DISTINCT FROM array_length(p_variant_skus, 1)
       OR array_length(p_variant_names, 1) IS DISTINCT FROM array_length(p_variant_prices, 1) THEN
      RAISE EXCEPTION 'Variant arrays must have the same length';
    END IF;
  END IF;

  INSERT INTO products (org_id, type, title, base_price)
  VALUES (p_org_id, p_type, p_title, p_base_price)
  RETURNING id INTO v_product_id;

  IF array_length(p_variant_names, 1) IS NOT NULL AND array_length(p_variant_names, 1) > 0 THEN
    FOR i IN 1..array_length(p_variant_names, 1) LOOP
      INSERT INTO product_variants (product_id, name, sku, price)
      VALUES (
        v_product_id,
        p_variant_names[i],
        NULLIF(p_variant_skus[i], ''),
        NULLIF(p_variant_prices[i], 0)
      );
    END LOOP;
  ELSE
    INSERT INTO product_variants (product_id, name, price)
    VALUES (v_product_id, 'Default', p_base_price);
  END IF;

  RETURN v_product_id;
END;
$$;

-- ============================================================================
-- 2. CREATE event_addon_products TABLE
-- ============================================================================

CREATE TABLE event_addon_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, product_id)
);

CREATE INDEX idx_event_addon_products_event_id ON event_addon_products(event_id);
CREATE INDEX idx_event_addon_products_product_id ON event_addon_products(product_id);

ALTER TABLE event_addon_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view event addon products for events in their orgs"
  ON event_addon_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = event_addon_products.event_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage event addon products for events in their orgs"
  ON event_addon_products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = event_addon_products.event_id
      AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = event_addon_products.event_id
      AND om.user_id = auth.uid()
    )
  );

-- Allow public read for published events (for checkout page)
CREATE POLICY "Public can view event addon products for published events"
  ON event_addon_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_addon_products.event_id
      AND e.status = 'published'
    )
  );

COMMENT ON TABLE event_addon_products IS 'Links events to add-on products. is_required=true means guest must select before checkout.';

-- ============================================================================
-- 3. CREATE order_addon_items TABLE (add-on lines in orders)
-- ============================================================================

CREATE TABLE order_addon_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
  label TEXT,
  variant_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_addon_items_order_id ON order_addon_items(order_id);
CREATE INDEX idx_order_addon_items_product_id ON order_addon_items(product_id);

ALTER TABLE order_addon_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view order addon items for their orders or events in their orgs"
  ON order_addon_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_addon_items.order_id
      AND (
        o.buyer_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM events e
          JOIN org_members om ON om.org_id = e.org_id
          WHERE e.id = o.event_id
          AND om.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Service role can insert order addon items"
  ON order_addon_items FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE order_addon_items IS 'Add-on product lines in event orders. No tickets created for add-ons.';
