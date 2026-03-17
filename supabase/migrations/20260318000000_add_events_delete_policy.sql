-- Migration: Add RLS DELETE policy for events
-- Allows org members (owner/admin) to delete events in their org

CREATE POLICY "Users can delete events in their orgs"
  ON events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );
