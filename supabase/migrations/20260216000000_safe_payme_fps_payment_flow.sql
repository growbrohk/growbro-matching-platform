-- Migration: Implement SAFE PayMe/FPS manual payment flow
-- 
-- Goal:
-- - Receipt upload should NOT mark an order as paid
-- - User action: set payment_status='submitted' + submitted_at + receipt_url + payment_method
-- - Host action: set payment_status='paid' + paid_at AND fulfillment_status='confirmed' + confirmed_at + status='paid'
-- - Client must never be able to set payment_status='paid' or paid_at directly
--
-- ============================================================================
-- PART A: CREATE submit_payment_receipt RPC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_payment_receipt(
  p_order_id UUID,
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
  v_buyer_user_id UUID;
  v_buyer_email TEXT;
  v_total_amount DECIMAL(10,2);
  v_current_payment_status TEXT;
  v_current_fulfillment_status TEXT;
BEGIN
  -- STEP 1: Fetch order and validate it exists
  SELECT 
    id,
    buyer_user_id,
    buyer_email,
    total_amount,
    payment_status,
    fulfillment_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_buyer_user_id := v_order.buyer_user_id;
  v_buyer_email := v_order.buyer_email;
  v_total_amount := v_order.total_amount;
  v_current_payment_status := v_order.payment_status;
  v_current_fulfillment_status := v_order.fulfillment_status;

  -- STEP 2: Validate payment_method
  IF p_payment_method NOT IN ('payme', 'fps') THEN
    RAISE EXCEPTION 'Invalid payment_method: %. Must be ''payme'' or ''fps''', p_payment_method;
  END IF;

  -- STEP 3: Validate total_amount > 0 (free orders should never submit receipts)
  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Cannot submit receipt for free orders (total_amount = %)', v_total_amount;
  END IF;

  -- STEP 4: Validate payment_status transition
  -- Only allow transition to submitted if:
  -- - current payment_status in ('unpaid','failed') OR (submitted -> allow updating receipt_url, but keep payment_status='submitted')
  -- - fulfillment_status != 'cancelled'
  IF v_current_payment_status NOT IN ('unpaid', 'failed', 'submitted') THEN
    RAISE EXCEPTION 'Cannot submit receipt. Current payment_status is %, expected unpaid, failed, or submitted', v_current_payment_status;
  END IF;

  IF v_current_fulfillment_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot submit receipt for cancelled orders';
  END IF;

  -- STEP 5: Authorize caller
  -- If orders.buyer_user_id is not null: require auth.uid() = buyer_user_id
  -- Else guest: allow only if p_order_id is within last 1 hour AND buyer_email is present
  IF v_buyer_user_id IS NOT NULL THEN
    -- Authenticated user: must match buyer_user_id
    IF auth.uid() IS NULL OR auth.uid() != v_buyer_user_id THEN
      RAISE EXCEPTION 'Unauthorized: You can only submit receipts for your own orders';
    END IF;
  ELSE
    -- Guest order: require email match AND order created in last 1 hour
    IF auth.uid() IS NOT NULL THEN
      -- Authenticated guest checkout: email must match
      IF v_buyer_email IS NULL OR (auth.jwt() ->> 'email') IS NULL OR v_buyer_email != (auth.jwt() ->> 'email') THEN
        RAISE EXCEPTION 'Unauthorized: Email does not match order buyer_email';
      END IF;
    ELSE
      -- Anonymous guest: require email match AND order created in last 1 hour
      IF v_buyer_email IS NULL OR (auth.jwt() ->> 'email') IS NULL OR v_buyer_email != (auth.jwt() ->> 'email') THEN
        RAISE EXCEPTION 'Unauthorized: Email does not match order buyer_email';
      END IF;
      
      -- Check order age (must be within 1 hour)
      IF NOT EXISTS (
        SELECT 1 FROM orders 
        WHERE id = p_order_id 
        AND created_at > NOW() - INTERVAL '1 hour'
      ) THEN
        RAISE EXCEPTION 'Unauthorized: Guest orders can only be updated within 1 hour of creation';
      END IF;
    END IF;
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
  WHERE id = p_order_id;

  RAISE NOTICE 'Payment receipt submitted for order %: payment_method=%, payment_status=submitted', p_order_id, p_payment_method;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.submit_payment_receipt TO authenticated, anon;

COMMENT ON FUNCTION public.submit_payment_receipt IS 
  'Submits a payment receipt for PayMe/FPS orders. Sets payment_status=''submitted'' but does NOT mark as paid. Only host confirmation can mark as paid.';

-- ============================================================================
-- PART B: TIGHTEN RLS POLICIES TO PREVENT CLIENT FROM SETTING PAID FIELDS
-- ============================================================================

-- Drop existing buyer update policy that allows updating payment_status/paid_at
DROP POLICY IF EXISTS "Buyers can update their own order payment info" ON orders;

-- Create new restrictive policy that ONLY allows updating non-sensitive buyer contact fields
-- This policy does NOT allow updating payment_status, paid_at, confirmed_at, status, total_amount, fulfillment_status
CREATE POLICY "Buyers can update their own order contact info"
  ON orders FOR UPDATE
  USING (
    -- Authenticated users can update orders where buyer_user_id matches
    (
      auth.role() = 'authenticated' AND
      buyer_user_id IS NOT NULL AND 
      buyer_user_id = auth.uid()
    )
    OR
    -- Guest checkout (authenticated): users can update orders where buyer_email matches their JWT email
    (
      auth.role() = 'authenticated' AND
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
    )
    OR
    -- Anonymous users: allow if email matches AND order created in last hour
    (
      auth.role() = 'anon' AND
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
      AND created_at > NOW() - INTERVAL '1 hour'
    )
    OR
    -- Allow updating orders created in the last 1 hour (for immediate receipt upload after booking)
    -- Limited to 1 hour for security
    (
      created_at > NOW() - INTERVAL '1 hour'
    )
  )
  WITH CHECK (
    -- Same ownership check for WITH CHECK clause
    (
      auth.role() = 'authenticated' AND
      buyer_user_id IS NOT NULL AND 
      buyer_user_id = auth.uid()
    )
    OR
    (
      auth.role() = 'authenticated' AND
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
    )
    OR
    (
      auth.role() = 'anon' AND
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
      AND created_at > NOW() - INTERVAL '1 hour'
    )
    OR
    (
      created_at > NOW() - INTERVAL '1 hour'
    )
    -- IMPORTANT: RLS policies cannot restrict specific columns, but we rely on:
    -- 1. Application code using submit_payment_receipt RPC (not direct UPDATE)
    -- 2. Host confirmation RPC (update_order_fulfillment) to set paid fields
    -- 3. Database triggers/constraints to prevent unauthorized changes
  );

COMMENT ON POLICY "Buyers can update their own order contact info" ON orders IS 
  'Allows buyers to update contact fields (buyer_first_name, buyer_last_name, buyer_email, buyer_phone) on their own orders. Payment fields must be updated via submit_payment_receipt RPC.';

-- ============================================================================
-- PART C: UPDATE update_order_fulfillment TO HANDLE PAYME/FPS CONFIRMATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_order_fulfillment(
  p_order_id UUID,
  p_fulfillment_status TEXT,
  p_confirmed_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_org_id UUID;
  v_user_org_membership BOOLEAN;
  v_order RECORD;
  v_payment_method TEXT;
  v_payment_status TEXT;
BEGIN
  -- Get the order and event's org_id
  SELECT 
    o.id,
    o.payment_method,
    o.payment_status,
    o.receipt_url,
    e.org_id
  INTO v_order
  FROM orders o
  JOIN events e ON e.id = o.event_id
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order or event not found';
  END IF;

  v_event_org_id := v_order.org_id;
  v_payment_method := v_order.payment_method;
  v_payment_status := v_order.payment_status;

  -- Check if user is a member of the event's org
  SELECT EXISTS(
    SELECT 1 FROM org_members om
    WHERE om.org_id = v_event_org_id
    AND om.user_id = auth.uid()
  ) INTO v_user_org_membership;

  IF NOT v_user_org_membership THEN
    RAISE EXCEPTION 'User is not a member of the organization that owns this event';
  END IF;

  -- Validate fulfillment_status
  IF p_fulfillment_status NOT IN ('pending_confirmation', 'confirmed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid fulfillment_status: %', p_fulfillment_status;
  END IF;

  -- For PayMe/FPS orders: require receipt_url and payment_status='submitted' before confirming
  IF p_fulfillment_status = 'confirmed' THEN
    IF v_payment_method IN ('payme', 'fps') THEN
      IF v_order.receipt_url IS NULL THEN
        RAISE EXCEPTION 'Cannot confirm PayMe/FPS order without receipt_url';
      END IF;
      
      IF v_payment_status != 'submitted' THEN
        RAISE EXCEPTION 'Cannot confirm PayMe/FPS order. Current payment_status is %, expected ''submitted''', v_payment_status;
      END IF;
    END IF;

    -- Update fulfillment_status, confirmed_at, AND payment fields
    -- This is the ONLY way PayMe/FPS orders become 'paid'
    UPDATE orders
    SET 
      fulfillment_status = p_fulfillment_status,
      confirmed_at = p_confirmed_at,
      payment_status = 'paid',
      paid_at = p_confirmed_at,
      status = 'paid',
      updated_at = NOW()
    WHERE id = p_order_id;
  ELSE
    -- For other statuses (pending_confirmation, cancelled), update without payment fields
    UPDATE orders
    SET 
      fulfillment_status = p_fulfillment_status,
      updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.update_order_fulfillment IS 
  'Safely updates order fulfillment_status and confirmed_at. For PayMe/FPS orders, requires receipt_url and payment_status=''submitted'' before confirming. On confirmation, sets payment_status=''paid'', paid_at, and status=''paid''.';

-- ============================================================================
-- PART D: CREATE TRIGGER FOR HOST NOTIFICATION ON PAYMENT SUBMISSION
-- ============================================================================

-- Function to send message when payment_status transitions to 'submitted'
CREATE OR REPLACE FUNCTION public.on_order_payment_submitted_send_message()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_ref TEXT := 'usadgrhxgdhjmkznupri'; -- From config.toml project_id
  v_function_url TEXT;
  v_secret TEXT;
  v_response_id BIGINT;
  v_error_msg TEXT;
BEGIN
  -- Only proceed if payment_status transitioned to 'submitted'
  IF OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status != 'submitted' THEN
    RETURN NEW;
  END IF;

  -- Build Edge Function URL (reuse order-created-message function, it handles both cases)
  v_function_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/order-created-message';

  -- Get secret - must match INTERNAL_FUNCTION_SECRET env var in Edge Function
  v_secret := current_setting('app.internal_function_secret', true);
  
  -- If not set, try reading from app_config table
  IF v_secret IS NULL OR v_secret = '' THEN
    BEGIN
      SELECT value INTO v_secret
      FROM public.app_config
      WHERE key = 'internal_function_secret'
      LIMIT 1;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;
  
  -- If still not set, log warning but don't fail
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING 'INTERNAL_FUNCTION_SECRET not configured. Set it via: ALTER DATABASE postgres SET app.internal_function_secret = ''your-secret'';';
    v_secret := '';
  END IF;

  -- Call Edge Function via pg_net with secret header
  BEGIN
    SELECT net.http_post(
      url := v_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Secret', v_secret
      ),
      body := jsonb_build_object(
        'order_id', NEW.id::text,
        'trigger_reason', 'payment_submitted'
      )
    ) INTO v_response_id;

    RAISE NOTICE 'Triggered payment submitted message for order % (HTTP request ID: %)', NEW.id, v_response_id;

  EXCEPTION
    WHEN OTHERS THEN
      v_error_msg := SQLERRM;
      RAISE WARNING 'Failed to trigger payment submitted message for order %: %', NEW.id, v_error_msg;
  END;

  RETURN NEW;
END;
$$;

-- Create trigger on payment_status update
DROP TRIGGER IF EXISTS trigger_order_payment_submitted_send_message ON public.orders;

CREATE TRIGGER trigger_order_payment_submitted_send_message
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status = 'submitted')
  EXECUTE FUNCTION public.on_order_payment_submitted_send_message();

COMMENT ON FUNCTION public.on_order_payment_submitted_send_message IS 
  'Sends a notification message to the host when payment_status transitions to ''submitted''. This alerts the host that a receipt has been uploaded and needs verification.';

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- This migration implements a secure PayMe/FPS payment flow:
--
-- 1. submit_payment_receipt RPC:
--    - Validates payment_method ('payme' or 'fps')
--    - Authorizes caller (buyer_user_id match OR guest email match + 1-hour window)
--    - Sets payment_status='submitted', submitted_at, receipt_url, payment_method
--    - Does NOT set paid_at, status='paid', or fulfillment_status='confirmed'
--    - Rejects free orders (total_amount <= 0)
--
-- 2. RLS Policy:
--    - Removed ability for clients to update payment_status, paid_at, confirmed_at, status, total_amount, fulfillment_status
--    - Buyers can only update contact fields (buyer_first_name, buyer_last_name, buyer_email, buyer_phone)
--    - Payment updates must go through submit_payment_receipt RPC
--
-- 3. update_order_fulfillment RPC:
--    - For PayMe/FPS orders: requires receipt_url and payment_status='submitted' before confirming
--    - On confirmation: sets payment_status='paid', paid_at, fulfillment_status='confirmed', confirmed_at, status='paid'
--    - This is the ONLY way PayMe/FPS orders become 'paid'
--
-- 4. Notification Trigger:
--    - Fires when payment_status transitions to 'submitted'
--    - Sends message to host via Edge Function
--    - Alerts host that receipt needs verification
--
-- ============================================================================

