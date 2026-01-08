-- =====================================================
-- Create Type Definitions Table
-- =====================================================
-- Universal source-of-truth for type definitions used across the app
-- Powers Collab filters, Catalog creation forms, and search logic

CREATE TABLE IF NOT EXISTS public.type_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  parent_domain text NULL,
  parent_value text NULL,
  db_table text NULL,
  db_column text NULL,
  db_values text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure unique domain+value combinations
  CONSTRAINT type_definitions_domain_value_unique UNIQUE(domain, value)
);

-- =====================================================
-- Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_type_definitions_domain ON public.type_definitions(domain);
CREATE INDEX IF NOT EXISTS idx_type_definitions_domain_active ON public.type_definitions(domain, active);
CREATE INDEX IF NOT EXISTS idx_type_definitions_parent ON public.type_definitions(parent_domain, parent_value) WHERE parent_domain IS NOT NULL;

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE public.type_definitions IS 'Universal type definitions for spaces, products, events, and UI filters';
COMMENT ON COLUMN public.type_definitions.domain IS 'Domain category: catalog_tab, space_type, promotion_type, brand_type';
COMMENT ON COLUMN public.type_definitions.value IS 'Internal key value (e.g. consignment, promotion, poster)';
COMMENT ON COLUMN public.type_definitions.label IS 'User-facing label';
COMMENT ON COLUMN public.type_definitions.parent_domain IS 'Parent domain for nested types (e.g. promotion_type has parent space_type)';
COMMENT ON COLUMN public.type_definitions.parent_value IS 'Parent value for nested types (e.g. promotion has parent promotion)';
COMMENT ON COLUMN public.type_definitions.db_table IS 'Database table this maps to (e.g. poster_spaces, products, events)';
COMMENT ON COLUMN public.type_definitions.db_column IS 'Database column this maps to (e.g. category, type, metadata)';
COMMENT ON COLUMN public.type_definitions.db_values IS 'Array of database values to filter/match (for IN queries)';
COMMENT ON COLUMN public.type_definitions.sort_order IS 'Display order (lower = first)';
COMMENT ON COLUMN public.type_definitions.active IS 'Whether this definition is active/visible';

-- =====================================================
-- RLS Policies
-- =====================================================
ALTER TABLE public.type_definitions ENABLE ROW LEVEL SECURITY;

-- Allow public read access for active rows (so dropdowns work on public pages)
CREATE POLICY "Allow public read for active type definitions"
  ON public.type_definitions
  FOR SELECT
  USING (active = true);

-- Allow authenticated users to read all (including inactive for admin views)
CREATE POLICY "Allow authenticated read for all type definitions"
  ON public.type_definitions
  FOR SELECT
  TO authenticated
  USING (true);

-- Restrict writes to service role only (for now)
-- In production, you may want to add admin-only write policies
-- For now, writes should be done via SQL migrations or service role

-- =====================================================
-- Seed Data
-- =====================================================

-- A) Space types (domain='space_type')
INSERT INTO public.type_definitions (domain, value, label, db_table, db_column, db_values, sort_order) VALUES
  ('space_type', 'consignment', 'Consignment', 'poster_spaces', 'category', ARRAY['consignment_shelf', 'shelf', 'booth', 'counter'], 1),
  ('space_type', 'promotion', 'Promotion', 'poster_spaces', 'category', ARRAY['poster_space', 'cup_sleeve_promotion'], 2),
  ('space_type', 'event', 'Event Hosting', 'poster_spaces', 'category', ARRAY['event_hosting'], 3)
ON CONFLICT (domain, value) DO NOTHING;

-- B) Promotion subtypes (domain='promotion_type', parent='space_type'/'promotion')
INSERT INTO public.type_definitions (domain, value, label, parent_domain, parent_value, db_table, db_column, db_values, sort_order) VALUES
  ('promotion_type', 'poster', 'Poster', 'space_type', 'promotion', 'poster_spaces', 'category', ARRAY['poster_space'], 1),
  ('promotion_type', 'cupsleeve', 'Cupsleeve', 'space_type', 'promotion', 'poster_spaces', 'category', ARRAY['cup_sleeve_promotion'], 2)
ON CONFLICT (domain, value) DO NOTHING;

-- C) Brand types (domain='brand_type')
INSERT INTO public.type_definitions (domain, value, label, db_table, db_column, db_values, sort_order) VALUES
  ('brand_type', 'product', 'Product', 'products', 'type', ARRAY['physical'], 1),
  ('brand_type', 'event', 'Event', 'events', NULL, ARRAY[]::text[], 2),
  ('brand_type', 'workshop', 'Workshop', 'events', 'metadata', ARRAY[]::text[], 3)
ON CONFLICT (domain, value) DO NOTHING;

-- D) Catalog tabs (domain='catalog_tab') - for future use
INSERT INTO public.type_definitions (domain, value, label, sort_order) VALUES
  ('catalog_tab', 'products', 'Products', 1),
  ('catalog_tab', 'events', 'Events', 2),
  ('catalog_tab', 'spaces', 'Spaces', 3)
ON CONFLICT (domain, value) DO NOTHING;

-- =====================================================
-- Update Trigger for updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_type_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_type_definitions_updated_at
  BEFORE UPDATE ON public.type_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_type_definitions_updated_at();

