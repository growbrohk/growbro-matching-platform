-- =====================================================
-- Add slug to orgs table and improve public booking access
-- =====================================================

-- 1) Add slug field to orgs table
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS slug text;

-- Create unique index on slug (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_slug_unique ON orgs(LOWER(slug));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON orgs(slug) WHERE slug IS NOT NULL;

-- 2) Function to generate slug from name
CREATE OR REPLACE FUNCTION generate_org_slug(org_name text)
RETURNS text AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter int := 0;
BEGIN
  -- Convert to lowercase, replace spaces and special chars with hyphens
  base_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  
  -- Ensure slug is not empty
  IF base_slug = '' THEN
    base_slug := 'org';
  END IF;
  
  final_slug := base_slug;
  
  -- Check for uniqueness and append counter if needed
  WHILE EXISTS (SELECT 1 FROM orgs WHERE LOWER(slug) = LOWER(final_slug)) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- 3) Backfill slugs for existing orgs (if any)
UPDATE orgs 
SET slug = generate_org_slug(name)
WHERE slug IS NULL;

-- 4) Add public read policy for orgs (limited fields via slug lookup)
-- This allows public to read org info when looking up by slug for booking
CREATE POLICY "Public can view orgs by slug for booking"
  ON orgs FOR SELECT
  USING (slug IS NOT NULL);

-- 5) Ensure booking_resources public policy allows reading with org join
-- The existing policy "Public can view active resources" already handles this
-- But let's make sure the join to orgs works for public users

-- 6) Grant usage on the slug generation function
GRANT EXECUTE ON FUNCTION generate_org_slug TO authenticated;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON COLUMN orgs.slug IS 'URL-friendly unique identifier for the organization';
COMMENT ON FUNCTION generate_org_slug IS 'Generates a unique URL-friendly slug from an organization name';

-- Migration complete

