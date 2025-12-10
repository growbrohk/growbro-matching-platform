-- ============================================
-- Refine Variable Products Schema
-- ============================================
-- This migration ensures all constraints, indexes, and triggers are properly set up
-- for variable products functionality

-- 1. Ensure UNIQUE constraint on product_variables (product_id, name)
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

-- 2. Ensure UNIQUE constraint on product_variable_values (variable_id, value)
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

-- 3. Ensure UNIQUE constraint on product_variation_inventory (variation_id, inventory_location_id)
-- This is critical for upsert operations
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

-- 4. Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_product_variables_product_id 
  ON public.product_variables(product_id);

CREATE INDEX IF NOT EXISTS idx_product_variable_values_variable_id 
  ON public.product_variable_values(variable_id);

CREATE INDEX IF NOT EXISTS idx_product_variations_product_id 
  ON public.product_variations(product_id);

CREATE INDEX IF NOT EXISTS idx_product_variations_sku 
  ON public.product_variations(sku) 
  WHERE sku IS NOT NULL;

-- Index for JSONB attributes queries (useful for finding variations by attribute values)
CREATE INDEX IF NOT EXISTS idx_product_variations_attributes 
  ON public.product_variations USING GIN (attributes);

CREATE INDEX IF NOT EXISTS idx_product_variation_inventory_variation_id 
  ON public.product_variation_inventory(variation_id);

CREATE INDEX IF NOT EXISTS idx_product_variation_inventory_location_id 
  ON public.product_variation_inventory(inventory_location_id);

-- Composite index for common queries (variation + location)
CREATE INDEX IF NOT EXISTS idx_product_variation_inventory_variation_location 
  ON public.product_variation_inventory(variation_id, inventory_location_id);

-- 5. Ensure updated_at triggers exist
-- Check if update_updated_at_column function exists, if not create it
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure triggers exist for updated_at
DO $$
BEGIN
  -- product_variables trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'product_variables_updated_at'
  ) THEN
    CREATE TRIGGER product_variables_updated_at
      BEFORE UPDATE ON public.product_variables
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- product_variations trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'product_variations_updated_at'
  ) THEN
    CREATE TRIGGER product_variations_updated_at
      BEFORE UPDATE ON public.product_variations
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- product_variation_inventory trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'product_variation_inventory_updated_at'
  ) THEN
    CREATE TRIGGER product_variation_inventory_updated_at
      BEFORE UPDATE ON public.product_variation_inventory
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 6. Ensure stock calculation function exists
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

-- 7. Ensure stock update trigger exists
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

-- Ensure trigger exists for stock updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_variation_stock_on_inventory_change'
  ) THEN
    CREATE TRIGGER update_variation_stock_on_inventory_change
      AFTER INSERT OR UPDATE OR DELETE ON public.product_variation_inventory
      FOR EACH ROW
      EXECUTE FUNCTION update_variation_stock();
  END IF;
END $$;

-- 8. Ensure RLS is enabled
ALTER TABLE public.product_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variable_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variation_inventory ENABLE ROW LEVEL SECURITY;

-- 9. Ensure RLS policies exist (drop and recreate to ensure they're correct)
DROP POLICY IF EXISTS "Users can manage variables for their products" ON public.product_variables;
CREATE POLICY "Users can manage variables for their products"
  ON public.product_variables FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_variables.product_id
      AND (products.owner_user_id = auth.uid() OR products.brand_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage values for their product variables" ON public.product_variable_values;
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

DROP POLICY IF EXISTS "Users can manage variations for their products" ON public.product_variations;
CREATE POLICY "Users can manage variations for their products"
  ON public.product_variations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_variations.product_id
      AND (products.owner_user_id = auth.uid() OR products.brand_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage inventory for their product variations" ON public.product_variation_inventory;
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

-- 10. Add helpful comments
COMMENT ON TABLE public.product_variables IS 'Variable definitions for products (e.g., Color, Size). Each product can have multiple variables.';
COMMENT ON TABLE public.product_variable_values IS 'Possible values for each variable (e.g., Black, Blue for Color; S, M, L for Size).';
COMMENT ON TABLE public.product_variations IS 'Product variations representing specific combinations of variable values (e.g., Black-S, Blue-M). Each variation has its own pricing and inventory.';
COMMENT ON TABLE public.product_variation_inventory IS 'Inventory tracking per location for each product variation. Stock is tracked separately for each warehouse/location.';
COMMENT ON COLUMN public.product_variations.attributes IS 'JSONB object mapping variable names to values, e.g., {"Color": "Black", "Size": "S"}. Used to uniquely identify each variation.';
COMMENT ON COLUMN public.product_variations.price_in_cents IS 'Override price for this variation in cents. If null, uses the product base price_in_cents.';
COMMENT ON COLUMN public.product_variations.stock_quantity IS 'Total stock across all locations. Automatically calculated by trigger from product_variation_inventory.';
COMMENT ON COLUMN public.product_variation_inventory.stock_quantity IS 'Available stock quantity for this variation at this specific location.';
COMMENT ON COLUMN public.product_variation_inventory.reserved_quantity IS 'Reserved stock (e.g., in cart, pending checkout) for this variation at this location.';

