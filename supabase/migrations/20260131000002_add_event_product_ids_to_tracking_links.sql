-- Migration: Add event_id and product_id columns to tracking_links table
-- These columns link tracking links to specific events or products for grouping

-- ============================================================================
-- 1. ADD event_id COLUMN
-- ============================================================================

ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS event_id uuid;

-- ============================================================================
-- 2. ADD product_id COLUMN
-- ============================================================================

ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS product_id uuid;

-- ============================================================================
-- 3. ADD FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Add foreign key for event_id
ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_event_id_fkey;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_event_id_fkey
  FOREIGN KEY (event_id)
  REFERENCES public.events(id)
  ON DELETE SET NULL;

-- Add foreign key for product_id
ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_product_id_fkey;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.products(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 4. CREATE INDEXES FOR FILTERING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tracking_links_event_id
  ON public.tracking_links(event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_links_product_id
  ON public.tracking_links(product_id)
  WHERE product_id IS NOT NULL;

COMMENT ON COLUMN public.tracking_links.event_id IS 'Foreign key to events table. Set when destination_type is "event"';
COMMENT ON COLUMN public.tracking_links.product_id IS 'Foreign key to products table. Set when destination_type is "product"';
