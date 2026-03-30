-- Fix: Allow authenticated users to read access variants for published events
-- Previously only anon could read; logged-in users (authenticated) got 0 rows,
-- causing discount/strikethrough to not show on public event pages.
-- This policy mirrors the anon policy for published events.

CREATE POLICY "Authenticated can read access variants for published events"
  ON ticket_type_access_variants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ticket_types tt
      JOIN events e ON e.id = tt.event_id
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
      AND e.status = 'published'
    )
  );
