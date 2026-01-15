-- Migration: Add RPC function for updating order contact info using edit_token
-- 
-- Goal:
-- - Allow incognito users to update contact info without authentication
-- - Use edit_token as the ONLY security boundary (consistent with submit_payment_receipt)
-- - No auth gates, no email matching, no JWT checks
--
-- ============================================================================
-- CREATE update_order_contact_info RPC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_order_contact_info(
  p_order_id UUID,
  p_edit_token TEXT,
  p_buyer_first_name TEXT DEFAULT NULL,
  p_buyer_last_name TEXT DEFAULT NULL,
  p_buyer_email TEXT DEFAULT NULL,
  p_buyer_phone TEXT DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- STEP 1: Fetch order and validate it exists
  SELECT 
    id,
    edit_token
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- STEP 2: Validate edit_token (ONLY security check - no auth gates)
  IF v_order.edit_token IS NULL OR v_order.edit_token != p_edit_token THEN
    RAISE EXCEPTION 'Unauthorized: invalid edit token';
  END IF;

  -- STEP 3: Update order contact info
  -- Normalize email if provided (lowercase, trim)
  UPDATE orders
  SET 
    buyer_first_name = NULLIF(TRIM(p_buyer_first_name), ''),
    buyer_last_name = NULLIF(TRIM(p_buyer_last_name), ''),
    buyer_email = CASE 
      WHEN p_buyer_email IS NOT NULL AND TRIM(p_buyer_email) != '' 
      THEN LOWER(TRIM(p_buyer_email))
      ELSE NULL
    END,
    buyer_phone = NULLIF(TRIM(p_buyer_phone), ''),
    updated_at = NOW()
  WHERE id = p_order_id
    AND edit_token = p_edit_token; -- Double-check token in WHERE clause for safety

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: invalid edit token';
  END IF;

  RAISE NOTICE 'Contact info updated for order %', p_order_id;
END;
$$;

-- Grant execute permission to anon and authenticated (no auth gates)
GRANT EXECUTE ON FUNCTION public.update_order_contact_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.update_order_contact_info IS 
  'Updates order contact info (buyer_first_name, buyer_last_name, buyer_email, buyer_phone) using edit_token for authorization. Works for incognito/anon users - edit_token is the ONLY security boundary.';

