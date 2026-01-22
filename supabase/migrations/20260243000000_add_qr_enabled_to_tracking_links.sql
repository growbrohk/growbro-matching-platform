-- Migration: Add qr_enabled column to tracking_links table
-- Enables QR code generation for tracking links

-- ============================================================================
-- 1. ADD qr_enabled COLUMN
-- ============================================================================
ALTER TABLE public.tracking_links 
ADD COLUMN IF NOT EXISTS qr_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 2. CREATE INDEX (optional, for filtering)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tracking_links_qr_enabled ON tracking_links(qr_enabled) WHERE qr_enabled = true;

COMMENT ON COLUMN public.tracking_links.qr_enabled IS 'Whether QR code generation is enabled for this tracking link';
