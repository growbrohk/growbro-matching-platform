-- Allow anonymous and authenticated clients to read org variant rank order for public storefront UX.
-- Table only stores rank1/rank2 display labels per org; existing member-only policies remain for writes.

CREATE POLICY "org_variant_config_select_public_read"
  ON org_variant_config
  FOR SELECT
  TO anon, authenticated
  USING (true);
