-- Allow public to read physical (catalog) products for brand page merch section
-- Unauthenticated visitors and users viewing other brands were blocked by org-members-only policy
CREATE POLICY "Public can view physical products"
  ON products FOR SELECT
  USING (type = 'physical');
