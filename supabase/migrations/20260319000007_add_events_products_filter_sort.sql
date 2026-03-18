-- Events & Products Layout: filter and sort options
-- Events: all vs non-expired; sort: manual, random, date, creation
-- Products: all vs in sale only; sort: manual, random, date, creation

-- org_profiles: events filter and sort
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS events_filter TEXT DEFAULT 'all' CHECK (events_filter IN ('all', 'non_expired'));
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS events_sort TEXT DEFAULT 'creation' CHECK (events_sort IN ('manual', 'random', 'date', 'creation'));
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS events_display_order JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN org_profiles.events_filter IS 'Events: all or non_expired only';
COMMENT ON COLUMN org_profiles.events_sort IS 'Events: manual, random, date, or creation';
COMMENT ON COLUMN org_profiles.events_display_order IS 'Array of event UUIDs for manual sort order';

-- org_profiles: products filter and sort
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS products_filter TEXT DEFAULT 'all' CHECK (products_filter IN ('all', 'in_sale_only'));
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS products_sort TEXT DEFAULT 'creation' CHECK (products_sort IN ('manual', 'random', 'date', 'creation'));
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS products_display_order JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN org_profiles.products_filter IS 'Products: all or in_sale_only';
COMMENT ON COLUMN org_profiles.products_sort IS 'Products: manual, random, date, or creation';
COMMENT ON COLUMN org_profiles.products_display_order IS 'Array of product UUIDs for manual sort order';

-- products: on sale flag
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_on_sale BOOLEAN DEFAULT true;
COMMENT ON COLUMN products.is_on_sale IS 'When false, product is out of sale. Filter in_sale_only excludes these.';
