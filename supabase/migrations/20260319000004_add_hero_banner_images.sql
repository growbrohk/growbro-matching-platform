-- Add hero_banner_images for 3-photo carousel (replaces/supplements hero_banner_url)
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS hero_banner_images JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN org_profiles.hero_banner_images IS 'Array of up to 3 image URLs for hero banner carousel';
