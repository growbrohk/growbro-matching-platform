-- Add footer body text and logo-area illustration
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS footer_body TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS footer_illustration_url TEXT;

COMMENT ON COLUMN org_profiles.footer_body IS 'Customizable body paragraph in footer (replaces default text)';
COMMENT ON COLUMN org_profiles.footer_illustration_url IS 'Custom illustration for footer logo area (shown instead of org logo when set)';
