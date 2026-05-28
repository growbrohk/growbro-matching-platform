-- Product unit cost (optional) for profit-based partner commission.
-- Commission basis on tracking links: revenue (gross) vs profit (after cost + shipping).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2) NULL CHECK (cost IS NULL OR cost >= 0);

COMMENT ON COLUMN public.products.cost IS
  'Optional unit cost (COGS). Used for profit-based commission: profit ≈ order total - shipping_fee - sum(qty * cost).';

ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS commission_basis TEXT NOT NULL DEFAULT 'revenue';

ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_commission_basis_check;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_commission_basis_check
  CHECK (commission_basis IN ('revenue', 'profit'));

COMMENT ON COLUMN public.tracking_links.commission_basis IS
  'revenue: commission on order total_amount. profit: commission on (total_amount - shipping_fee - product line cost using products.cost).';
