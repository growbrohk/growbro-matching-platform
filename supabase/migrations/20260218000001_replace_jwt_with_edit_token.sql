-- Migration: Replace JWT email authorization with edit_token for receipt submission
-- 
-- Goal:
-- - Update submit_payment_receipt RPC to accept and validate edit_token instead of JWT email
-- - Remove all JWT email comparison logic
-- - Allow guest users to submit receipts without authentication
--
-- ============================================================================
-- DROP OLD FUNCTION SIGNATURE FIRST
-- ============================================================================

-- Drop the old function signature (UUID, TEXT, TEXT, TEXT) if it exists
DROP FUNCTION IF EXISTS public.submit_payment_receipt(UUID, TEXT, TEXT, TEXT);

-- ============================================================================
-- CREATE NEW submit_payment_receipt RPC FUNCTION WITH edit_token
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_payment_receipt(
  p_order_id UUID,
  p_edit_token TEXT,
  p_payment_method TEXT,
  p_receipt_url TEXT,
  p_payment_reference_link TEXT DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_total_amount DECIMAL(10,2);
  v_current_payment_status TEXT;
  v_current_fulfillment_status TEXT;
BEGIN
  -- STEP 1: Fetch order and validate it exists
  SELECT 
    id,
    edit_token,
    total_amount,
    payment_status,
    fulfillment_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_total_amount := v_order.total_amount;
  v_current_payment_status := v_order.payment_status;
  v_current_fulfillment_status := v_order.fulfillment_status;

  -- STEP 2: Validate edit_token
  -- This is the ONLY authorization check - no JWT email comparison
  IF v_order.edit_token IS NULL OR v_order.edit_token != p_edit_token THEN
    RAISE EXCEPTION 'Unauthorized: invalid edit token';
  END IF;

  -- STEP 3: Validate payment_method
  IF p_payment_method NOT IN ('payme', 'fps') THEN
    RAISE EXCEPTION 'Invalid payment_method: %. Must be ''payme'' or ''fps''', p_payment_method;
  END IF;

  -- STEP 4: Validate total_amount > 0 (free orders should never submit receipts)
  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Cannot submit receipt for free orders (total_amount = %)', v_total_amount;
  END IF;

  -- STEP 5: Validate payment_status transition
  -- Only allow transition to submitted if:
  -- - current payment_status in ('unpaid','failed') OR (submitted -> allow updating receipt_url, but keep payment_status='submitted')
  -- - fulfillment_status != 'cancelled'
  IF v_current_payment_status NOT IN ('unpaid', 'failed', 'submitted') THEN
    RAISE EXCEPTION 'Cannot submit receipt. Current payment_status is %, expected unpaid, failed, or submitted', v_current_payment_status;
  END IF;

  IF v_current_fulfillment_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot submit receipt for cancelled orders';
  END IF;

  -- STEP 6: Update order
  -- Set: payment_method, receipt_url, payment_reference_link, submitted_at, payment_status='submitted'
  -- DO NOT set: paid_at, status='paid', fulfillment_status='confirmed'
  UPDATE orders
  SET 
    payment_method = p_payment_method,
    receipt_url = p_receipt_url,
    payment_reference_link = p_payment_reference_link,
    submitted_at = NOW(),
    payment_status = 'submitted',
    updated_at = NOW()
  WHERE id = p_order_id
    AND edit_token = p_edit_token; -- Double-check token in WHERE clause for safety

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: invalid edit token';
  END IF;

  RAISE NOTICE 'Payment receipt submitted for order %: payment_method=%, payment_status=submitted', p_order_id, p_payment_method;
END;
$$;

-- Grant execute permission (anon and authenticated can both use this)
GRANT EXECUTE ON FUNCTION public.submit_payment_receipt(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.submit_payment_receipt IS 
  'Submits a payment receipt for PayMe/FPS orders using edit_token for authorization. Sets payment_status=''submitted'' but does NOT mark as paid. Only host confirmation can mark as paid. Guest users can submit receipts without authentication by providing the correct edit_token.';

