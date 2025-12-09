-- ============================================
-- Replace product_class with product_type
-- ============================================
-- This migration:
-- 1. Updates product_type to include 'event' and 'workshop'
-- 2. Migrates data from product_class to product_type
-- 3. Drops product_class column

-- Step 1: Update product_type constraint to allow new values
-- First, drop the existing constraint if it exists
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_type_check;

-- Add new constraint with all product types
ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check 
  CHECK (product_type IN ('simple', 'variable', 'event', 'workshop', 'space', 'booking', 'service', 'ticket'));

-- Step 2: Migrate existing product_class data to product_type
-- Map product_class values to product_type:
-- 'physical' -> 'simple' or 'variable' (based on existing product_type)
-- 'ticket' -> 'event'
-- 'booking' -> 'workshop'
-- 'space' -> 'space' (keep for venue products)
-- 'service' -> 'service' (keep)
-- 'event_ticket' -> 'event'

UPDATE public.products
SET product_type = CASE
  -- If product_type is already set and is 'variable', keep it
  WHEN product_type = 'variable' THEN 'variable'
  -- If product_type is 'simple' or NULL, check product_class
  WHEN product_class = 'physical' THEN COALESCE(product_type, 'simple')
  WHEN product_class = 'ticket' OR product_class = 'event_ticket' THEN 'event'
  WHEN product_class = 'booking' THEN 'workshop'
  WHEN product_class = 'space' THEN 'space'
  WHEN product_class = 'service' THEN 'service'
  -- Default to simple if product_class is unknown
  ELSE COALESCE(product_type, 'simple')
END
WHERE product_type IS NULL OR product_type = 'simple';

-- Step 3: Ensure all products have a product_type
UPDATE public.products
SET product_type = 'simple'
WHERE product_type IS NULL;

-- Step 4: Make product_type NOT NULL
ALTER TABLE public.products
  ALTER COLUMN product_type SET NOT NULL;

-- Step 5: Drop product_class column
ALTER TABLE public.products
  DROP COLUMN IF EXISTS product_class;

-- Step 6: Update comment
COMMENT ON COLUMN public.products.product_type IS 'Product type: simple, variable, event, workshop, space, booking, service, or ticket';

