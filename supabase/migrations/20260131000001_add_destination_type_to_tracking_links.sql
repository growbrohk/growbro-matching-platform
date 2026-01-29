-- Migration: Add destination_type column to tracking_links table
-- Stores the user's destination choice: 'event', 'product', or 'custom'

-- ============================================================================
-- 1. ADD destination_type COLUMN
-- ============================================================================

ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS destination_type text NOT NULL DEFAULT 'custom';

-- ============================================================================
-- 2. ADD CHECK CONSTRAINT
-- ============================================================================

ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_destination_type_check;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_destination_type_check
  CHECK (destination_type IN ('event', 'product', 'custom'));

-- ============================================================================
-- 3. CREATE INDEX FOR FILTERING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tracking_links_destination_type
  ON public.tracking_links(destination_type);

-- ============================================================================
-- 4. BACKFILL EXISTING ROWS (if any exist without the default)
-- ============================================================================

-- This should not be necessary due to DEFAULT 'custom', but included for safety
UPDATE public.tracking_links
SET destination_type = 'custom'
WHERE destination_type IS NULL;

COMMENT ON COLUMN public.tracking_links.destination_type IS 'Type of destination: event, product, or custom URL';
