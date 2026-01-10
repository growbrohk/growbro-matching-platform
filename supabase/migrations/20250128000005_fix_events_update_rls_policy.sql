-- Migration: Fix events UPDATE RLS policy to include WITH CHECK clause
-- This fixes the "new row violates row-level security policy" error when updating events

-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "Users can update events in their orgs" ON events;

-- Recreate the UPDATE policy with both USING and WITH CHECK clauses
CREATE POLICY "Users can update events in their orgs"
  ON events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
      AND org_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
      AND org_members.user_id = auth.uid()
    )
  );

