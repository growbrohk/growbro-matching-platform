-- Migration 2: Products and Product Variants

-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('physical', 'venue_asset')),
  title TEXT NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2), -- base price, can be overridden by variant prices or pricing rules
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product variants table
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., "Size: Large", "Color: Red"
  sku TEXT,
  price DECIMAL(10,2), -- variant-specific price (overrides base_price if set)
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_products_org_id ON products(org_id);
CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;

-- RLS for products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products from their orgs"
  ON products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = products.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create products in their orgs"
  ON products FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = products.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update products in their orgs"
  ON products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = products.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete products in their orgs"
  ON products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = products.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- RLS for product_variants
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view variants of products in their orgs"
  ON product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_variants.product_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create variants for products in their orgs"
  ON product_variants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_variants.product_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update variants in their orgs"
  ON product_variants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_variants.product_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete variants in their orgs"
  ON product_variants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_variants.product_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


