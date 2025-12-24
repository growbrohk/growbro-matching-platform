-- Migration 7: Product Pricing (fixed price or revenue share)

-- Product pricing table
CREATE TABLE product_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pricing_model TEXT NOT NULL CHECK (pricing_model IN ('fixed', 'revenue_share')),
  -- For fixed: rate is the price, rate_unit is 'one_time' or 'per_hour', 'per_day', etc.
  -- For revenue_share: rate is the percentage (0-100), minimum_fee applies
  rate DECIMAL(10,2) NOT NULL CHECK (rate >= 0),
  rate_unit TEXT, -- 'one_time', 'per_hour', 'per_day', 'per_month' (for fixed), NULL for revenue_share
  minimum_fee DECIMAL(10,2) CHECK (minimum_fee >= 0), -- only for revenue_share
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id) -- one pricing rule per product
);

-- Indexes
CREATE INDEX idx_product_pricing_product_id ON product_pricing(product_id);
CREATE INDEX idx_product_pricing_pricing_model ON product_pricing(pricing_model);

-- Constraint: revenue_share must have minimum_fee, fixed should not
CREATE OR REPLACE FUNCTION check_pricing_model_constraints()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pricing_model = 'revenue_share' AND NEW.minimum_fee IS NULL THEN
    RAISE EXCEPTION 'Revenue share pricing must have a minimum_fee';
  END IF;
  IF NEW.pricing_model = 'fixed' AND NEW.minimum_fee IS NOT NULL THEN
    RAISE EXCEPTION 'Fixed pricing should not have a minimum_fee';
  END IF;
  IF NEW.pricing_model = 'fixed' AND NEW.rate_unit IS NULL THEN
    RAISE EXCEPTION 'Fixed pricing must have a rate_unit';
  END IF;
  IF NEW.pricing_model = 'revenue_share' AND NEW.rate_unit IS NOT NULL THEN
    RAISE EXCEPTION 'Revenue share pricing should not have a rate_unit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_pricing_model_constraints_trigger
  BEFORE INSERT OR UPDATE ON product_pricing
  FOR EACH ROW
  EXECUTE FUNCTION check_pricing_model_constraints();

-- RLS for product_pricing
ALTER TABLE product_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pricing for products in their orgs"
  ON product_pricing FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_pricing.product_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create pricing for products in their orgs"
  ON product_pricing FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_pricing.product_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update pricing for products in their orgs"
  ON product_pricing FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_pricing.product_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete pricing for products in their orgs"
  ON product_pricing FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_pricing.product_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_product_pricing_updated_at
  BEFORE UPDATE ON product_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


