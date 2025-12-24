-- Migration: Add Product Categories and Tags Tables
-- This replaces the metadata-based category/tag system with proper database tables

-- ============================================================================
-- 1. CREATE TABLES
-- ============================================================================

-- Product Categories table
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_categories_org_slug UNIQUE (org_id, slug),
  CONSTRAINT uq_product_categories_org_name UNIQUE (org_id, name)
);

-- Product Tags table
CREATE TABLE product_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_tags_org_slug UNIQUE (org_id, slug),
  CONSTRAINT uq_product_tags_org_name UNIQUE (org_id, name)
);

-- Product Tag Links junction table (many-to-many)
CREATE TABLE product_tag_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES product_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_tag_links UNIQUE (product_id, tag_id)
);

-- ============================================================================
-- 2. ADD CATEGORY_ID TO PRODUCTS
-- ============================================================================

ALTER TABLE products
ADD COLUMN category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_product_categories_org_id ON product_categories(org_id);
CREATE INDEX idx_product_categories_sort_order ON product_categories(org_id, sort_order);
CREATE INDEX idx_product_tags_org_id ON product_tags(org_id);
CREATE INDEX idx_product_tag_links_product_id ON product_tag_links(product_id);
CREATE INDEX idx_product_tag_links_tag_id ON product_tag_links(tag_id);
CREATE INDEX idx_products_category_id ON products(category_id) WHERE category_id IS NOT NULL;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Product Categories RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view categories from their orgs"
  ON product_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = product_categories.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create categories in their orgs"
  ON product_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = product_categories.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update categories in their orgs"
  ON product_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = product_categories.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete categories in their orgs"
  ON product_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = product_categories.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- Product Tags RLS
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tags from their orgs"
  ON product_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = product_tags.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tags in their orgs"
  ON product_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = product_tags.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tags in their orgs"
  ON product_tags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = product_tags.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tags in their orgs"
  ON product_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = product_tags.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- Product Tag Links RLS
ALTER TABLE product_tag_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tag links for products in their orgs"
  ON product_tag_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_tag_links.product_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tag links for products in their orgs"
  ON product_tag_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_tag_links.product_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tag links for products in their orgs"
  ON product_tag_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE p.id = product_tag_links.product_id
      AND om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE TRIGGER update_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_tags_updated_at
  BEFORE UPDATE ON product_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. MIGRATION: Import existing categories and tags from metadata
-- ============================================================================

-- Function to generate slug from name
CREATE OR REPLACE FUNCTION slugify(text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(regexp_replace(text, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Migrate categories from org metadata to product_categories table
DO $$
DECLARE
  org_record RECORD;
  category_name TEXT;
  category_slug TEXT;
  category_id UUID;
  sort_idx INTEGER;
BEGIN
  -- Loop through all orgs
  FOR org_record IN 
    SELECT id, metadata FROM orgs WHERE metadata IS NOT NULL
  LOOP
    -- Check if org has catalog.categories in metadata
    IF org_record.metadata ? 'catalog' AND 
       org_record.metadata->'catalog' ? 'categories' AND
       jsonb_typeof(org_record.metadata->'catalog'->'categories') = 'array' THEN
      
      sort_idx := 0;
      
      -- Loop through each category
      FOR category_name IN 
        SELECT jsonb_array_elements_text(org_record.metadata->'catalog'->'categories')
      LOOP
        category_slug := slugify(category_name);
        
        -- Insert category if it doesn't exist
        INSERT INTO product_categories (org_id, name, slug, sort_order)
        VALUES (org_record.id, category_name, category_slug, sort_idx)
        ON CONFLICT (org_id, slug) DO NOTHING;
        
        sort_idx := sort_idx + 1;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Migrate tags from org metadata to product_tags table
DO $$
DECLARE
  org_record RECORD;
  tag_name TEXT;
  tag_slug TEXT;
BEGIN
  -- Loop through all orgs
  FOR org_record IN 
    SELECT id, metadata FROM orgs WHERE metadata IS NOT NULL
  LOOP
    -- Check if org has catalog.tags in metadata
    IF org_record.metadata ? 'catalog' AND 
       org_record.metadata->'catalog' ? 'tags' AND
       jsonb_typeof(org_record.metadata->'catalog'->'tags') = 'array' THEN
      
      -- Loop through each tag
      FOR tag_name IN 
        SELECT jsonb_array_elements_text(org_record.metadata->'catalog'->'tags')
      LOOP
        tag_slug := slugify(tag_name);
        
        -- Insert tag if it doesn't exist
        INSERT INTO product_tags (org_id, name, slug)
        VALUES (org_record.id, tag_name, tag_slug)
        ON CONFLICT (org_id, slug) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Migrate product.metadata.category to product.category_id
DO $$
DECLARE
  product_record RECORD;
  category_name TEXT;
  category_id_val UUID;
BEGIN
  -- Loop through all products with a category in metadata
  FOR product_record IN 
    SELECT p.id, p.org_id, p.metadata
    FROM products p
    WHERE p.metadata ? 'category' AND 
          p.metadata->>'category' IS NOT NULL AND
          p.metadata->>'category' != ''
  LOOP
    category_name := product_record.metadata->>'category';
    
    -- Find the category_id for this category name
    SELECT id INTO category_id_val
    FROM product_categories
    WHERE org_id = product_record.org_id AND name = category_name
    LIMIT 1;
    
    -- Update product with category_id if found
    IF category_id_val IS NOT NULL THEN
      UPDATE products
      SET category_id = category_id_val
      WHERE id = product_record.id;
    END IF;
  END LOOP;
END $$;

-- Migrate product.metadata.tags to product_tag_links
DO $$
DECLARE
  product_record RECORD;
  tag_name TEXT;
  tag_id_val UUID;
BEGIN
  -- Loop through all products with tags in metadata
  FOR product_record IN 
    SELECT p.id, p.org_id, p.metadata
    FROM products p
    WHERE p.metadata ? 'tags' AND 
          jsonb_typeof(p.metadata->'tags') = 'array'
  LOOP
    -- Loop through each tag for this product
    FOR tag_name IN 
      SELECT jsonb_array_elements_text(product_record.metadata->'tags')
    LOOP
      -- Find the tag_id for this tag name
      SELECT id INTO tag_id_val
      FROM product_tags
      WHERE org_id = product_record.org_id AND name = tag_name
      LIMIT 1;
      
      -- Create link if tag found
      IF tag_id_val IS NOT NULL THEN
        INSERT INTO product_tag_links (product_id, tag_id)
        VALUES (product_record.id, tag_id_val)
        ON CONFLICT (product_id, tag_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to get products count by category
CREATE OR REPLACE FUNCTION get_category_product_count(category_id_param UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM products
  WHERE category_id = category_id_param;
$$ LANGUAGE SQL STABLE;

-- Function to get products count by tag
CREATE OR REPLACE FUNCTION get_tag_product_count(tag_id_param UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM product_tag_links
  WHERE tag_id = tag_id_param;
$$ LANGUAGE SQL STABLE;

-- Add comments for documentation
COMMENT ON TABLE product_categories IS 'Product categories for organizing products within an org';
COMMENT ON TABLE product_tags IS 'Product tags for labeling and filtering products within an org';
COMMENT ON TABLE product_tag_links IS 'Many-to-many relationship between products and tags';
COMMENT ON COLUMN products.category_id IS 'Foreign key to product_categories. Each product can have one category.';

