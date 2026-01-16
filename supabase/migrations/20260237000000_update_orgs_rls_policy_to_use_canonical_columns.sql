-- ============================================================================
-- Migration: Update orgs RLS policy to use canonical columns
-- Purpose: Update the "Users can view connected orgs" policy to use
--          org_low_id/org_high_id instead of org_a_id/org_b_id
-- ============================================================================

BEGIN;

-- Drop the old policy
DROP POLICY IF EXISTS "Users can view connected orgs" ON orgs;

-- Recreate with canonical columns
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
        AND om.org_id IN (c.org_low_id, c.org_high_id)
      )
      WHERE c.status = 'accepted'
      AND orgs.id IN (c.org_low_id, c.org_high_id)
      AND orgs.id != om.org_id -- The connected org (not the user's own org)
    )
  );

COMMENT ON POLICY "Users can view connected orgs" ON orgs IS 
  'Allows authenticated users to view orgs that have accepted connections with their orgs. '
  'This enables get_connected_orgs RPC to return full org details for connected orgs. '
  'Updated to use canonical columns (org_low_id, org_high_id).';

COMMIT;
