-- ============================================================================
-- Migration: Fix connected orgs RLS access
-- Purpose: Ensure get_connected_orgs RPCs can access org details by making
--          orgs table readable when accessed through accepted connections
-- ============================================================================

-- The issue: get_connected_count returns 1, but get_connected_orgs returns empty
-- Root cause: RLS on orgs table blocks access to connected orgs that user is not a member of
-- Solution: Allow viewing orgs that have accepted connections to user's orgs

-- Drop the old policy if it exists
DROP POLICY IF EXISTS "Users can view connected orgs" ON orgs;

-- Add a policy that allows users to see orgs they are connected to
-- This policy works alongside existing policies (PostgreSQL RLS uses OR logic)
CREATE POLICY "Users can view connected orgs"
  ON orgs FOR SELECT
  TO authenticated
  USING (
    -- Allow viewing orgs that have an accepted connection with any of the user's orgs
    EXISTS (
      SELECT 1 
      FROM connections c
      INNER JOIN org_members om ON (
        om.user_id = auth.uid() 
        AND om.org_id IN (c.org_a_id, c.org_b_id)
      )
      WHERE c.status = 'accepted'
      AND orgs.id IN (c.org_a_id, c.org_b_id)
      AND orgs.id != om.org_id -- The connected org (not the user's own org)
    )
  );

COMMENT ON POLICY "Users can view connected orgs" ON orgs IS 
  'Allows authenticated users to view orgs that have accepted connections with their orgs. '
  'This enables get_connected_orgs RPC to return full org details for connected orgs.';
