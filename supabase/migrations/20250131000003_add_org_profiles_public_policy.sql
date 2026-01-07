-- =====================================================
-- Add public read policy for org_profiles
-- =====================================================
-- Allows public to read address and website for published poster spaces

-- Public can view org_profiles for published spaces (limited fields)
CREATE POLICY "Public can view org profiles for published spaces"
  ON org_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM poster_spaces ps
      WHERE ps.org_id = org_profiles.org_id
      AND ps.status = 'published'
    )
  );

