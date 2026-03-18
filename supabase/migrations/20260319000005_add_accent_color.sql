-- Add accent color for brand page (header, section labels, links, etc.)
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#E85D04';
COMMENT ON COLUMN org_profiles.accent_color IS 'Hex color for brand page accent (header bar, section labels, links). Default orange.';
