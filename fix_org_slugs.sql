-- =====================================================
-- Quick fix script to backfill all org slugs
-- Run this directly in your Supabase SQL editor if needed
-- =====================================================

-- Ensure the generate_org_slug function exists
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
UPDATE orgs 
SET slug = generate_org_slug(name)
WHERE slug IS NULL;

-- Show results
SELECT 
  id,
  name,
  slug,
  CASE 
    WHEN slug IS NULL THEN 'MISSING SLUG'
    ELSE 'OK'
  END as status
FROM orgs
ORDER BY name;

