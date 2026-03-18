-- Migration: Add brand page columns to org_profiles
-- Block-like sections: Hero, Events, Description, Products, Footer
-- Designed for future migration to full block editor (block_document JSONB reserved)

ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS hero_banner_url TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS hero_headline TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS hero_subheadline TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS description_intro TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS description_body TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS description_images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS description_tagline TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS footer_tagline TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS footer_contact_email TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS footer_links JSONB DEFAULT '[]'::jsonb;

-- Optional: reserve for future block editor migration
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS block_document JSONB;

COMMENT ON COLUMN org_profiles.hero_banner_url IS 'URL to hero banner background image';
COMMENT ON COLUMN org_profiles.hero_headline IS 'Main hero overlay text (e.g. Run to EXPLORE)';
COMMENT ON COLUMN org_profiles.hero_subheadline IS 'Secondary hero text';
COMMENT ON COLUMN org_profiles.description_intro IS 'First paragraph of About section';
COMMENT ON COLUMN org_profiles.description_body IS 'Second paragraph of About section';
COMMENT ON COLUMN org_profiles.description_images IS 'Array of 3 image URLs for description gallery';
COMMENT ON COLUMN org_profiles.description_tagline IS 'e.g. 777 run club isnt just events';
COMMENT ON COLUMN org_profiles.footer_tagline IS 'Footer motto text';
COMMENT ON COLUMN org_profiles.footer_contact_email IS 'Contact email in footer';
COMMENT ON COLUMN org_profiles.footer_links IS 'Array of {label, url} for footer links';
COMMENT ON COLUMN org_profiles.block_document IS 'Reserved for future block editor JSON';
