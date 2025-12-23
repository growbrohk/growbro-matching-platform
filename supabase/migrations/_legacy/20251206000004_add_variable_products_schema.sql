-- ============================================
-- Variable Products Schema
-- ============================================
-- This migration adds support for variable products (e.g., products with size/color options)
-- and their variations with individual inventory tracking

-- 1. Create product_variables table (e.g., "Color", "Size")
CREATE TABLE IF NOT EXISTS public.product_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., "Color", "Size"
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, name) -- Each product can only have one variable with the same name
);

-- 2. Create product_variable_values table (e.g., "Black", "Blue", "S", "M")
CREATE TABLE IF NOT EXISTS public.product_variable_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variable_id UUID NOT NULL REFERENCES public.product_variables(id) ON DELETE CASCADE,
  value TEXT NOT NULL, -- e.g., "Black", "S"
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variable_id, value) -- Each variable can only have one value with the same text
);

-- 3. Create product_variations table (combinations like "Black-S", "Blue-M")
-- Each variation represents a specific combination of variable values
CREATE TABLE IF NOT EXISTS public.product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT, -- Optional SKU for this variation
  attributes JSONB NOT NULL, -- e.g., {"Color": "Black", "Size": "S"}
  price_in_cents INTEGER, -- Override price (if null, use product price)
  image_url TEXT, -- Variation-specific image
  stock_quantity INTEGER DEFAULT 0, -- Total stock across all locations
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, attributes) -- Each product can only have one variation with the same attributes
);

-- 4. Create product_variation_inventory table (inventory per location per variation)
CREATE TABLE IF NOT EXISTS public.product_variation_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id UUID NOT NULL REFERENCES public.product_variations(id) ON DELETE CASCADE,
  inventory_location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  stock_quantity INTEGER DEFAULT 0,
  reserved_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variation_id, inventory_location_id)
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_variables_product_id ON public.product_variables(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variable_values_variable_id ON public.product_variable_values(variable_id);
CREATE INDEX IF NOT EXISTS idx_product_variations_product_id ON public.product_variations(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variations_sku ON public.product_variations(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_variation_inventory_variation_id ON public.product_variation_inventory(variation_id);
CREATE INDEX IF NOT EXISTS idx_product_variation_inventory_location_id ON public.product_variation_inventory(inventory_location_id);

-- 6. Add updated_at trigger for product_variables
-- First ensure the function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_variables_updated_at
  BEFORE UPDATE ON public.product_variables
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER product_variations_updated_at
  BEFORE UPDATE ON public.product_variations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER product_variation_inventory_updated_at
  BEFORE UPDATE ON public.product_variation_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. RLS Policies for product_variables
ALTER TABLE public.product_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage variables for their products"
  ON public.product_variables FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_variables.product_id
      AND (products.owner_user_id = auth.uid() OR products.brand_user_id = auth.uid())
    )
  );

-- 8. RLS Policies for product_variable_values
ALTER TABLE public.product_variable_values ENABLE ROW LEVEL SECURITY;

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

-- 9. RLS Policies for product_variations
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage variations for their products"
  ON public.product_variations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_variations.product_id
      AND (products.owner_user_id = auth.uid() OR products.brand_user_id = auth.uid())
    )
  );

-- 10. RLS Policies for product_variation_inventory
ALTER TABLE public.product_variation_inventory ENABLE ROW LEVEL SECURITY;

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

-- 11. Function to calculate total stock for a variation
CREATE OR REPLACE FUNCTION calculate_variation_stock(p_variation_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(stock_quantity) FROM public.product_variation_inventory WHERE variation_id = p_variation_id),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- 12. Function to update variation stock_quantity when inventory changes
CREATE OR REPLACE FUNCTION update_variation_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.product_variations
  SET stock_quantity = calculate_variation_stock(NEW.variation_id)
  WHERE id = NEW.variation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_variation_stock_on_inventory_change
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variation_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_variation_stock();

-- 13. Add comments for documentation
COMMENT ON TABLE public.product_variables IS 'Variable definitions for products (e.g., Color, Size)';
COMMENT ON TABLE public.product_variable_values IS 'Possible values for each variable (e.g., Black, Blue for Color)';
COMMENT ON TABLE public.product_variations IS 'Product variations (combinations of variable values) with individual pricing and inventory';
COMMENT ON TABLE public.product_variation_inventory IS 'Inventory tracking per location for each product variation';
COMMENT ON COLUMN public.product_variations.attributes IS 'JSON object mapping variable names to values, e.g., {"Color": "Black", "Size": "S"}';
COMMENT ON COLUMN public.product_variations.price_in_cents IS 'Override price for this variation. If null, uses product base price.';

