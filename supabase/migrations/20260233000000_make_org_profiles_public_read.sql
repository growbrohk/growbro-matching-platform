-- ============================================================================
-- Migration: Make org_profiles publicly readable
-- Purpose: Remove over-restrictive RLS on org_profiles to unblock development
--          Allow anyone (public/anon/auth) to read org_profiles without
--          requiring org_members membership or auth.uid() checks
-- ============================================================================

-- Drop the existing restrictive policy that requires org_members membership
DROP POLICY IF EXISTS "Users can view profiles from their orgs" ON org_profiles;

-- Create a permissive SELECT policy that allows everyone to read org_profiles
-- This uses the simplest possible policy: using (true) allows all rows
CREATE POLICY "Anyone can view org profiles"
  ON org_profiles FOR SELECT
  USING (true);

COMMENT ON POLICY "Anyone can view org profiles" ON org_profiles IS 
  'Allows public/anon/authenticated users to read all org_profiles rows. '
  'This is intentional MVP behavior to unblock development. RLS can be re-added later.';
