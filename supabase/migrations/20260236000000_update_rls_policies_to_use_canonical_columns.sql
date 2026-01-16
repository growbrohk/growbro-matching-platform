-- ============================================================================
-- Migration: Update RLS policies to use canonical columns (org_low_id, org_high_id)
-- Purpose: Refactor RLS policies to use org_low_id/org_high_id for consistency
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. UPDATE SELECT POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Users can view connections for their orgs" ON connections;

CREATE POLICY "Users can view connections for their orgs"
  ON connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id IN (connections.org_low_id, connections.org_high_id)
      AND org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. UPDATE INSERT POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Users can create connection requests for their orgs" ON connections;

CREATE POLICY "Users can create connection requests for their orgs"
  ON connections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = connections.requested_by_org_id
      AND org_members.user_id = auth.uid()
    )
    AND connections.status = 'pending'
  );

-- ============================================================================
-- 3. UPDATE UPDATE POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Users can update connections for their orgs" ON connections;

CREATE POLICY "Users can update connections for their orgs"
  ON connections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id IN (connections.org_low_id, connections.org_high_id)
      AND org_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Ensure blocked_by_org_id is set correctly if blocking
    (
      connections.status <> 'blocked' 
      OR (
        connections.blocked_by_org_id IN (connections.org_low_id, connections.org_high_id)
        AND EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.org_id = connections.blocked_by_org_id
          AND org_members.user_id = auth.uid()
        )
      )
    )
  );

COMMIT;
