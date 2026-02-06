-- Migration: Remove Tags Feature and Venue Asset Product Type
-- This migration:
-- 1. Migrates existing venue_asset products to physical
-- 2. Removes tag tables (product_tags, product_tag_links) and related objects
-- 3. Updates products.type constraint to only allow 'physical'
-- 4. Removes/updates bookings constraint that checks for venue_asset

-- ============================================================================
-- 1. MIGRATE EXISTING VENUE_ASSET PRODUCTS TO PHYSICAL
-- ============================================================================

UPDATE products
SET type = 'physical'
WHERE type = 'venue_asset';

-- ============================================================================
-- 2. DROP BOOKINGS CONSTRAINT/TRIGGER THAT CHECKS FOR VENUE_ASSET
-- ============================================================================

-- Drop the trigger first
DROP TRIGGER IF EXISTS check_booking_product_type_trigger ON bookings;

-- Drop the function
DROP FUNCTION IF EXISTS check_booking_product_type();

-- ============================================================================
-- 3. REMOVE TAG TABLES AND RELATED OBJECTS
-- ============================================================================

-- Drop policies on product_tag_links first (before dropping table)
DROP POLICY IF EXISTS "Users can view tag links for products in their orgs" ON product_tag_links;
DROP POLICY IF EXISTS "Users can create tag links for products in their orgs" ON product_tag_links;
DROP POLICY IF EXISTS "Users can delete tag links for products in their orgs" ON product_tag_links;

-- Drop policies on product_tags
DROP POLICY IF EXISTS "Users can view tags from their orgs" ON product_tags;
DROP POLICY IF EXISTS "Users can create tags in their orgs" ON product_tags;
DROP POLICY IF EXISTS "Users can update tags in their orgs" ON product_tags;
DROP POLICY IF EXISTS "Users can delete tags in their orgs" ON product_tags;

-- Drop triggers
DROP TRIGGER IF EXISTS update_product_tags_updated_at ON product_tags;

-- Drop indexes
DROP INDEX IF EXISTS idx_product_tag_links_product_id;
DROP INDEX IF EXISTS idx_product_tag_links_tag_id;
DROP INDEX IF EXISTS idx_product_tags_org_id;

-- Drop helper functions that reference tag tables
DROP FUNCTION IF EXISTS get_tag_product_count(UUID);

-- Drop tables (CASCADE will handle foreign keys)
DROP TABLE IF EXISTS product_tag_links CASCADE;
DROP TABLE IF EXISTS product_tags CASCADE;

-- ============================================================================
-- 4. UPDATE PRODUCTS.TYPE CONSTRAINT TO ONLY ALLOW 'physical'
-- ============================================================================

-- First, check if products.type uses a CHECK constraint or ENUM
-- We'll handle both cases safely

DO $$
DECLARE
  v_constraint_name TEXT;
  v_is_enum BOOLEAN := false;
BEGIN
  -- Check if type column uses an enum type
  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_attribute a ON a.atttypid = t.oid
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'products'
      AND a.attname = 'type'
      AND t.typtype = 'e'
  ) INTO v_is_enum;

  -- Find existing CHECK constraint on products.type
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'products'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%'
  LIMIT 1;

  -- Drop existing CHECK constraint if it exists
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE products DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;

  -- Add new CHECK constraint restricting to 'physical' only
  ALTER TABLE products
    ADD CONSTRAINT products_type_check CHECK (type = 'physical');

  -- If it was an enum, we'd need to recreate it, but since we're using TEXT with CHECK,
  -- we're done. The CHECK constraint approach is simpler and more flexible.
END $$;

-- ============================================================================
-- 5. UPDATE RPC FUNCTIONS THAT REFERENCE VENUE_ASSET
-- ============================================================================

-- Update create_product_with_variants function to remove venue_asset validation
CREATE OR REPLACE FUNCTION create_product_with_variants(
  p_org_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_base_price DECIMAL,
  p_variant_names TEXT[] DEFAULT NULL,
  p_variant_skus TEXT[] DEFAULT NULL,
  p_variant_prices DECIMAL[] DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id UUID;
  v_user_id UUID;
  i INT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check user belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to this organization';
  END IF;

  -- Validate type (only 'physical' allowed now)
  IF p_type != 'physical' THEN
    RAISE EXCEPTION 'Product type must be physical';
  END IF;

  -- Validate arrays have same length (if non-empty)
  IF array_length(p_variant_names, 1) IS NOT NULL THEN
    IF array_length(p_variant_names, 1) IS DISTINCT FROM array_length(p_variant_skus, 1)
       OR array_length(p_variant_names, 1) IS DISTINCT FROM array_length(p_variant_prices, 1) THEN
      RAISE EXCEPTION 'Variant arrays must have the same length';
    END IF;
  END IF;

  -- Create product
  INSERT INTO products (org_id, type, title, base_price)
  VALUES (p_org_id, p_type, p_title, p_base_price)
  RETURNING id INTO v_product_id;

  -- Create variants
  IF array_length(p_variant_names, 1) IS NOT NULL AND array_length(p_variant_names, 1) > 0 THEN
    FOR i IN 1..array_length(p_variant_names, 1) LOOP
      INSERT INTO product_variants (product_id, name, sku, price)
      VALUES (
        v_product_id,
        p_variant_names[i],
        NULLIF(p_variant_skus[i], ''),
        NULLIF(p_variant_prices[i], 0)
      );
    END LOOP;
  ELSE
    -- Create a default variant if none provided
    INSERT INTO product_variants (product_id, name, price)
    VALUES (v_product_id, 'Default', p_base_price);
  END IF;

  RETURN v_product_id;
END;
$$;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON CONSTRAINT products_type_check ON products IS 'Products can only be of type physical';
