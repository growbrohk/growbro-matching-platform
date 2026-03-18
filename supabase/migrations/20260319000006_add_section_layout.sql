-- Section layout: control what shows in top/bottom rows (events, products, both, or hidden)
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS top_section TEXT DEFAULT 'events' CHECK (top_section IN ('events', 'products', 'both', 'hidden'));
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS bottom_section TEXT DEFAULT 'products' CHECK (bottom_section IN ('events', 'products', 'both', 'hidden'));
COMMENT ON COLUMN org_profiles.top_section IS 'Top catalog row: events, products, both, or hidden';
COMMENT ON COLUMN org_profiles.bottom_section IS 'Bottom catalog row: events, products, both, or hidden';
