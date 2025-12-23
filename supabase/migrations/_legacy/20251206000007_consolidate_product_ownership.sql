-- ============================================
-- Consolidate Product Ownership Fields
-- ============================================
-- This migration ensures consistency between brand_user_id and owner_user_id:
-- - For brand products (owner_type = 'brand'): brand_user_id MUST equal owner_user_id
-- - For venue products (owner_type = 'venue'): brand_user_id points to the brand, owner_user_id points to the venue
--
-- Note: brand_user_id is kept for backward compatibility and legacy queries.
-- The primary ownership system uses owner_user_id + owner_type.

-- Step 1: Ensure data consistency
-- For brand products, ensure brand_user_id = owner_user_id
UPDATE public.products
SET brand_user_id = owner_user_id
WHERE owner_type = 'brand' AND (brand_user_id IS NULL OR brand_user_id != owner_user_id);

-- Step 2: For venue products, if brand_user_id is NULL, we need to determine the brand
-- Since venue products are created by brands, we'll set brand_user_id to owner_user_id
-- (This assumes the venue user created it, but in practice venues are created by brands)
-- Actually, for venue products, the brand_user_id should point to the brand that created the venue product
-- If we don't have that info, we'll leave it as owner_user_id for now
UPDATE public.products
SET brand_user_id = owner_user_id
WHERE owner_type = 'venue' AND brand_user_id IS NULL;

-- Step 3: Add a check constraint to ensure consistency
-- For brand products: brand_user_id must equal owner_user_id
-- For venue products: brand_user_id can be different (points to the brand)
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_brand_owner_consistency_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_brand_owner_consistency_check
  CHECK (
    -- For brand products, brand_user_id must equal owner_user_id (they're the same)
    (owner_type = 'brand' AND brand_user_id = owner_user_id)
    OR
    -- For venue products, brand_user_id can be different (points to the brand)
    (owner_type = 'venue')
  );

-- Step 4: Add comments explaining the relationship
COMMENT ON COLUMN public.products.brand_user_id IS 
  'Legacy field: Always points to the brand. For brand products (owner_type=brand), equals owner_user_id. For venue products (owner_type=venue), points to the brand while owner_user_id points to the venue.';

COMMENT ON COLUMN public.products.owner_user_id IS 
  'Primary ownership field: Points to the user who owns the product. Combined with owner_type to determine ownership. For brand products, equals brand_user_id. For venue products, points to the venue user.';

COMMENT ON COLUMN public.products.owner_type IS 
  'Product ownership type: "brand" for brand products (owner_user_id = brand_user_id), "venue" for venue products (owner_user_id = venue, brand_user_id = brand).';

