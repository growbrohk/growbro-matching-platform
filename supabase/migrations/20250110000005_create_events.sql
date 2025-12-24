-- Migration 5: Events and Ticket Types

-- Events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, -- event organizer
  venue_org_id UUID REFERENCES orgs(id) ON DELETE SET NULL, -- optional venue hosting the event
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);

-- Ticket types table
CREATE TABLE ticket_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., "Early Bird", "VIP", "General Admission"
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  quota INTEGER NOT NULL CHECK (quota > 0), -- total tickets available
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_org_id ON events(org_id);
CREATE INDEX idx_events_venue_org_id ON events(venue_org_id);
CREATE INDEX idx_events_start_at ON events(start_at);
CREATE INDEX idx_ticket_types_event_id ON ticket_types(event_id);

-- RLS for events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events from their orgs or venues they work with"
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE (org_members.org_id = events.org_id OR org_members.org_id = events.venue_org_id)
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create events in their orgs"
  ON events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update events in their orgs"
  ON events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = events.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- RLS for ticket_types
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ticket types for events in their orgs"
  ON ticket_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = ticket_types.event_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create ticket types for events in their orgs"
  ON ticket_types FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = ticket_types.event_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ticket types in their orgs"
  ON ticket_types FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = ticket_types.event_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete ticket types in their orgs"
  ON ticket_types FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = ticket_types.event_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ticket_types_updated_at
  BEFORE UPDATE ON ticket_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


