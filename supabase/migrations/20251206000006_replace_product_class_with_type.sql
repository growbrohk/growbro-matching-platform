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

-- Step 5: Update RLS policies to use product_type instead of product_class
-- Drop existing policies that reference product_class
DROP POLICY IF EXISTS "Users can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Users can update their own products" ON public.products;
DROP POLICY IF EXISTS "Users can view their own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete their own products" ON public.products;

-- Recreate policies using product_type instead of product_class
CREATE POLICY "Users can insert their own products"
  ON public.products FOR INSERT
  WITH CHECK (
    -- Allow if owner_user_id matches current user (new unified system)
    owner_user_id = auth.uid()
    OR
    -- Legacy support: brand_user_id matches current user
    brand_user_id = auth.uid()
    OR
    -- Allow event ticket products if the event belongs to the user
    (product_type = 'event' AND EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = products.event_id
      AND events.brand_id = auth.uid()
    ))
  );

CREATE POLICY "Users can update their own products"
  ON public.products FOR UPDATE
  USING (
    -- Allow if owner_user_id matches current user (new unified system)
    owner_user_id = auth.uid()
    OR
    -- Legacy support: brand_user_id matches current user
    brand_user_id = auth.uid()
    OR
    -- Allow event ticket products if the event belongs to the user
    (product_type = 'event' AND EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = products.event_id
      AND events.brand_id = auth.uid()
    ))
  );

CREATE POLICY "Users can view their own products"
  ON public.products FOR SELECT
  USING (
    -- Public products are viewable by everyone
    is_public = true
    OR
    -- Allow if owner_user_id matches current user (new unified system)
    owner_user_id = auth.uid()
    OR
    -- Legacy support: brand_user_id matches current user
    brand_user_id = auth.uid()
    OR
    -- Allow event ticket products if the event belongs to the user
    (product_type = 'event' AND EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = products.event_id
      AND events.brand_id = auth.uid()
    ))
  );

CREATE POLICY "Users can delete their own products"
  ON public.products FOR DELETE
  USING (
    -- Allow if owner_user_id matches current user (new unified system)
    owner_user_id = auth.uid()
    OR
    -- Legacy support: brand_user_id matches current user
    brand_user_id = auth.uid()
    OR
    -- Allow event ticket products if the event belongs to the user
    (product_type = 'event' AND EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = products.event_id
      AND events.brand_id = auth.uid()
    ))
  );

-- Step 6: Drop product_class column (now safe since policies are updated)
ALTER TABLE public.products
  DROP COLUMN IF EXISTS product_class;

-- Step 7: Update comment
COMMENT ON COLUMN public.products.product_type IS 'Product type: simple, variable, event, workshop, space, booking, service, or ticket';

