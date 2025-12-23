-- ============================================
-- Add product_type column to products table
-- ============================================
-- This migration adds a product_type column to distinguish between simple and variable products

-- Add product_type column (simple or variable)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'simple' CHECK (product_type IN ('simple', 'variable'));

-- Update existing products: if they have variables, set to 'variable', otherwise 'simple'
UPDATE public.products
SET product_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.product_variables
    WHERE product_variables.product_id = products.id
  ) THEN 'variable'
  ELSE 'simple'
END
WHERE product_type IS NULL OR product_type = 'simple';

-- Set default and make it NOT NULL after backfill
ALTER TABLE public.products
  ALTER COLUMN product_type SET DEFAULT 'simple',
  ALTER COLUMN product_type SET NOT NULL;

-- Add comment
COMMENT ON COLUMN public.products.product_type IS 'Product type: simple (one price) or variable (multiple variations with different prices/stock)';

