-- =====================================================
-- Backfill all org slugs that are NULL
-- This ensures all orgs have slugs for profile URLs
-- =====================================================

-- Ensure the generate_org_slug function exists (from previous migration)
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
  -- Only check against non-NULL slugs
  WHILE EXISTS (
    SELECT 1 FROM orgs 
    WHERE slug IS NOT NULL 
    AND LOWER(slug) = LOWER(final_slug)
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Backfill all orgs that don't have slugs
-- This handles both existing orgs and any new ones created after the initial migration
UPDATE orgs 
SET slug = generate_org_slug(name)
WHERE slug IS NULL;

-- Verify: Count orgs without slugs (should be 0)
DO $$
DECLARE
  null_slug_count int;
BEGIN
  SELECT COUNT(*) INTO null_slug_count FROM orgs WHERE slug IS NULL;
  IF null_slug_count > 0 THEN
    RAISE WARNING 'Still have % orgs without slugs after backfill', null_slug_count;
  ELSE
    RAISE NOTICE 'All orgs now have slugs';
  END IF;
END $$;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON FUNCTION generate_org_slug IS 'Generates a unique URL-friendly slug from an organization name. Used for profile URLs.';

