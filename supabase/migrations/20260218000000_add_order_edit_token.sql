-- Migration: Add edit_token to orders for guest receipt submission
-- 
-- Goal:
-- - Replace JWT email-based authorization with order-level secret edit_token
-- - Allow guest users to submit receipts without authentication
-- - Still secure: only someone with the edit_token can submit receipt
--
-- ============================================================================
-- PART A: ADD edit_token COLUMN TO orders
-- ============================================================================

-- Ensure pgcrypto extension is available for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add edit_token column
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS edit_token TEXT;

-- ============================================================================
-- PART B: BACKFILL EXISTING ORDERS
-- ============================================================================

-- Backfill existing orders with random tokens
UPDATE public.orders
SET edit_token = encode(gen_random_bytes(32), 'hex')
WHERE edit_token IS NULL;

-- ============================================================================
-- PART C: CREATE TRIGGER TO AUTO-GENERATE edit_token ON INSERT
-- ============================================================================

-- Function to set edit_token on insert if not provided
CREATE OR REPLACE FUNCTION public.set_order_edit_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.edit_token IS NULL THEN
    NEW.edit_token := encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS trg_set_order_edit_token ON public.orders;

-- Create trigger
CREATE TRIGGER trg_set_order_edit_token
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_edit_token();

-- ============================================================================
-- PART D: ADD INDEX FOR PERFORMANCE
-- ============================================================================

-- Index for edit_token lookups (used in RPC validation)
CREATE INDEX IF NOT EXISTS idx_orders_edit_token ON public.orders(edit_token) WHERE edit_token IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.orders.edit_token IS 
  'Secret token for guest users to submit payment receipts without authentication. Never expose in UI.';

COMMENT ON FUNCTION public.set_order_edit_token IS 
  'Trigger function that automatically generates a random edit_token for new orders if not provided.';

