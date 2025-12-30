-- =====================================================
-- Add slug to events table for public event pages
-- =====================================================

-- 1) Add slug field to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS slug text;

-- Create unique index on (org_id, slug) - slugs must be unique per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_org_slug_unique ON events(org_id, slug) WHERE slug IS NOT NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug) WHERE slug IS NOT NULL;

-- 2) Function to generate unique slug from title for an org
CREATE OR REPLACE FUNCTION generate_event_slug(p_org_id UUID, p_title TEXT)
RETURNS text AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter int := 0;
BEGIN
  -- Convert to lowercase, replace spaces and special chars with hyphens
  base_slug := lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  
  -- Ensure slug is not empty
  IF base_slug = '' THEN
    base_slug := 'event';
  END IF;
  
  final_slug := base_slug;
  
  -- Check for uniqueness within the org and append counter if needed
  WHILE EXISTS (SELECT 1 FROM events WHERE org_id = p_org_id AND slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- 3) Add public RLS policy for published events
-- Allow public to read published events (needed for public event pages)
CREATE POLICY "Public can view published events"
  ON events FOR SELECT
  USING (status = 'published');

-- 4) Add public RLS policy for ticket_types of published events
-- Allow public to read ticket types for published events
CREATE POLICY "Public can view ticket types for published events"
  ON ticket_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = ticket_types.event_id
      AND events.status = 'published'
    )
  );

-- 5) Grant usage on the slug generation function
GRANT EXECUTE ON FUNCTION generate_event_slug TO authenticated;

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON COLUMN events.slug IS 'URL-friendly unique identifier for the event within an organization';
COMMENT ON FUNCTION generate_event_slug IS 'Generates a unique URL-friendly slug from an event title within an organization';

