-- ============================================
-- Add Missing Constraints and Setup for Variable Products
-- ============================================
-- This script adds the missing constraints, indexes, triggers, and RLS policies
-- that are required for variable products to work correctly.
-- Run this in Supabase SQL Editor.
-- ============================================

-- ============================================
-- 1. ADD MISSING UNIQUE CONSTRAINTS
-- ============================================
-- These are CRITICAL for upsert operations to work!

-- UNIQUE constraint on product_variables (product_id, name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_variables_product_id_name_key'
  ) THEN
    ALTER TABLE public.product_variables
    ADD CONSTRAINT product_variables_product_id_name_key UNIQUE (product_id, name);
  END IF;
END $$;

-- UNIQUE constraint on product_variable_values (variable_id, value)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_variable_values_variable_id_value_key'
  ) THEN
    ALTER TABLE public.product_variable_values
    ADD CONSTRAINT product_variable_values_variable_id_value_key UNIQUE (variable_id, value);
  END IF;
END $$;

-- CRITICAL: UNIQUE constraint on product_variation_inventory (variation_id, inventory_location_id)
-- This is REQUIRED for upsert operations in updateVariationInventory!
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_variation_inventory_variation_id_inventory_location_id_key'
  ) THEN
    ALTER TABLE public.product_variation_inventory
    ADD CONSTRAINT product_variation_inventory_variation_id_inventory_location_id_key 
    UNIQUE (variation_id, inventory_location_id);
  END IF;
END $$;

-- ============================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_product_variables_product_id 
  ON public.product_variables(product_id);

CREATE INDEX IF NOT EXISTS idx_product_variable_values_variable_id 
  ON public.product_variable_values(variable_id);

CREATE INDEX IF NOT EXISTS idx_product_variations_product_id 
  ON public.product_variations(product_id);

CREATE INDEX IF NOT EXISTS idx_product_variations_sku 
  ON public.product_variations(sku) 
  WHERE sku IS NOT NULL;

-- GIN index for JSONB attributes queries
CREATE INDEX IF NOT EXISTS idx_product_variations_attributes 
  ON public.product_variations USING GIN (attributes);

CREATE INDEX IF NOT EXISTS idx_product_variation_inventory_variation_id 
  ON public.product_variation_inventory(variation_id);

CREATE INDEX IF NOT EXISTS idx_product_variation_inventory_location_id 
  ON public.product_variation_inventory(inventory_location_id);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_product_variation_inventory_variation_location 
  ON public.product_variation_inventory(variation_id, inventory_location_id);

-- ============================================
-- 3. CREATE FUNCTIONS
-- ============================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate total stock for a variation
CREATE OR REPLACE FUNCTION calculate_variation_stock(p_variation_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(stock_quantity) 
     FROM public.product_variation_inventory 
     WHERE variation_id = p_variation_id),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update variation stock_quantity when inventory changes
CREATE OR REPLACE FUNCTION update_variation_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.product_variations
  SET stock_quantity = calculate_variation_stock(
    COALESCE(NEW.variation_id, OLD.variation_id)
  )
  WHERE id = COALESCE(NEW.variation_id, OLD.variation_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. CREATE TRIGGERS
-- ============================================

-- Updated_at triggers
DO $$
BEGIN
  -- product_variables trigger
  DROP TRIGGER IF EXISTS product_variables_updated_at ON public.product_variables;
  CREATE TRIGGER product_variables_updated_at
    BEFORE UPDATE ON public.product_variables
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  -- product_variations trigger
  DROP TRIGGER IF EXISTS product_variations_updated_at ON public.product_variations;
  CREATE TRIGGER product_variations_updated_at
    BEFORE UPDATE ON public.product_variations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  -- product_variation_inventory trigger
  DROP TRIGGER IF EXISTS product_variation_inventory_updated_at ON public.product_variation_inventory;
  CREATE TRIGGER product_variation_inventory_updated_at
    BEFORE UPDATE ON public.product_variation_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
END $$;

-- Stock calculation trigger
DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_variation_stock_on_inventory_change ON public.product_variation_inventory;
  CREATE TRIGGER update_variation_stock_on_inventory_change
    AFTER INSERT OR UPDATE OR DELETE ON public.product_variation_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_variation_stock();
END $$;

-- ============================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.product_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variable_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variation_inventory ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. CREATE RLS POLICIES
-- ============================================

-- Drop existing policies if they exist (to ensure clean recreation)
DROP POLICY IF EXISTS "Users can manage variables for their products" ON public.product_variables;
DROP POLICY IF EXISTS "Users can manage values for their product variables" ON public.product_variable_values;
DROP POLICY IF EXISTS "Users can manage variations for their products" ON public.product_variations;
DROP POLICY IF EXISTS "Users can manage inventory for their product variations" ON public.product_variation_inventory;

-- RLS Policy for product_variables
CREATE POLICY "Users can manage variables for their products"
  ON public.product_variables FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_variables.product_id
      AND (products.owner_user_id = auth.uid() OR products.brand_user_id = auth.uid())
    )
  );

-- RLS Policy for product_variable_values
CREATE POLICY "Users can manage values for their product variables"
  ON public.product_variable_values FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variables pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = product_variable_values.variable_id
      AND (p.owner_user_id = auth.uid() OR p.brand_user_id = auth.uid())
    )
  );

-- RLS Policy for product_variations
CREATE POLICY "Users can manage variations for their products"
  ON public.product_variations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_variations.product_id
      AND (products.owner_user_id = auth.uid() OR products.brand_user_id = auth.uid())
    )
  );

-- RLS Policy for product_variation_inventory
CREATE POLICY "Users can manage inventory for their product variations"
  ON public.product_variation_inventory FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variations pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = product_variation_inventory.variation_id
      AND (p.owner_user_id = auth.uid() OR p.brand_user_id = auth.uid())
    )
  );

-- ============================================
-- COMPLETE!
-- ============================================
-- All missing constraints, indexes, triggers, and RLS policies have been added.
-- Your variable products should now work correctly!
-- ============================================

