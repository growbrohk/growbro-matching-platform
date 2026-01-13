-- Migration: Add fulfillment_status and order_no to orders table
-- This enables deterministic routing based on order state

-- ============================================================================
-- 1. ADD FULFILLMENT_STATUS FIELD
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'pending_confirmation' 
  CHECK (fulfillment_status IN ('pending_confirmation', 'confirmed', 'cancelled'));

-- ============================================================================
-- 2. ADD ORDER_NO FIELD (Booking Code)
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_no TEXT;

-- Create unique index for order_no
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_no 
ON orders(order_no) 
WHERE order_no IS NOT NULL;

-- ============================================================================
-- 3. UPDATE GENERATE_UNIQUE_CODE TO SUPPORT ORDER NUMBERS
-- ============================================================================

-- Update the function to also check orders.order_no
CREATE OR REPLACE FUNCTION generate_unique_code(p_prefix TEXT DEFAULT '')
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a code: prefix + random hex string
    v_code := p_prefix || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 12));
    
    -- Check if it exists in booking_entitlements, tickets, or orders.order_no
    SELECT EXISTS(
      SELECT 1 FROM booking_entitlements WHERE code = v_code
      UNION
      SELECT 1 FROM tickets WHERE qr_code = v_code
      UNION
      SELECT 1 FROM orders WHERE order_no = v_code
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- ============================================================================
-- 4. UPDATE CREATE_EVENT_BOOKING TO GENERATE ORDER_NO
-- ============================================================================

-- We'll update the RPC function to generate order_no when creating orders
-- This will be done in a separate migration that updates the function

-- ============================================================================
-- 5. BACKFILL EXISTING ORDERS WITH ORDER_NO
-- ============================================================================

-- Generate order numbers for existing orders that don't have one
UPDATE orders
SET order_no = 'ORD' || upper(substring(md5(id::text || created_at::text) from 1 for 10))
WHERE order_no IS NULL;

-- ============================================================================
-- 6. SET DEFAULT FULFILLMENT_STATUS FOR EXISTING ORDERS
-- ============================================================================

-- Set fulfillment_status based on payment_status for existing orders
UPDATE orders
SET fulfillment_status = CASE
  WHEN payment_status = 'paid' THEN 'confirmed'
  WHEN payment_status = 'submitted' THEN 'pending_confirmation'
  ELSE 'pending_confirmation'
END
WHERE fulfillment_status IS NULL;

