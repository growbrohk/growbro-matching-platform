-- Add description illustration (dog+frog) and tagline body for reference layout
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS description_illustration_url TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS description_tagline_body TEXT;

COMMENT ON COLUMN org_profiles.description_illustration_url IS 'Small illustration for description section (e.g. dog + frog mascot)';
COMMENT ON COLUMN org_profiles.description_tagline_body IS 'Paragraph under tagline heading in description section';
