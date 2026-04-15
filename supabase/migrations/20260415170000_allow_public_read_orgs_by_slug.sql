-- Allow anonymous visitors to view orgs that have a slug.
-- Fixes brand public pages showing "Profile not found" when the org has no
-- published poster_space (the only other public orgs SELECT policy).
-- PostgreSQL RLS ORs multiple policies; this complements
-- "Public can view orgs with published spaces".

CREATE POLICY "Public can view orgs by slug"
  ON orgs FOR SELECT
  USING (slug IS NOT NULL);

COMMENT ON POLICY "Public can view orgs by slug" ON orgs IS
  'Allows anon/authenticated users to read org rows with a slug for public brand URLs. '
  'Basic org fields only; org_profiles and other tables have separate RLS.';
