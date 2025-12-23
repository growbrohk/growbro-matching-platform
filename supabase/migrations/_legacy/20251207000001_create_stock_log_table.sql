-- Create stock_log table for tracking inventory changes
CREATE TABLE IF NOT EXISTS public.stock_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  product_variation_id UUID REFERENCES public.product_variations(id) ON DELETE SET NULL,
  inventory_location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('adjustment', 'sale', 'return', 'transfer_in', 'transfer_out', 'damage', 'other')),
  quantity_before INTEGER NOT NULL DEFAULT 0,
  quantity_after INTEGER NOT NULL DEFAULT 0,
  quantity_change INTEGER NOT NULL GENERATED ALWAYS AS (quantity_after - quantity_before) STORED,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_log_product_id ON public.stock_log(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_log_variation_id ON public.stock_log(product_variation_id);
CREATE INDEX IF NOT EXISTS idx_stock_log_location_id ON public.stock_log(inventory_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_log_user_id ON public.stock_log(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_log_created_at ON public.stock_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.stock_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own stock logs"
ON public.stock_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create stock logs"
ON public.stock_log FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow brands to view stock logs for their products
CREATE POLICY "Brands can view stock logs for their products"
ON public.stock_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = stock_log.product_id
    AND p.owner_user_id = auth.uid()
  )
);

COMMENT ON TABLE public.stock_log IS 'Tracks all inventory changes for audit purposes';
COMMENT ON COLUMN public.stock_log.change_type IS 'Type of stock change: adjustment, sale, return, transfer_in, transfer_out, damage, other';
COMMENT ON COLUMN public.stock_log.quantity_change IS 'Calculated difference between before and after quantities';

