-- Allow public to read variants of physical products (for brand page product detail)
-- Mirrors the products public read policy from 20260319000003
CREATE POLICY "Public can view variants of physical products"
  ON product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_variants.product_id
      AND p.type = 'physical'
    )
  );
