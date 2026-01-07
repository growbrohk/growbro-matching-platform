-- =====================================================
-- Fix orgs RLS policy for public access to published spaces
-- =====================================================
-- The existing policy "Public can view orgs by slug for booking" allows
-- viewing ANY org with a slug, which is too permissive for poster spaces.
-- This migration replaces it with a policy that only allows public access
-- to orgs that have at least one published poster space.
-- 
-- Note: The booking system uses SECURITY DEFINER RPC functions that bypass
-- RLS, so it doesn't need this policy. This policy is specifically for
-- poster spaces public access.

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Public can view orgs by slug for booking" ON orgs;

-- Create a more restrictive policy: only allow public access to orgs
-- that have at least one published poster space
CREATE POLICY "Public can view orgs with published spaces"
  ON orgs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM poster_spaces ps
      WHERE ps.org_id = orgs.id
      AND ps.status = 'published'
    )
  );

