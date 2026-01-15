-- Migration: Fix order enquiry trigger to fire ONLY on payment_status='submitted'
-- 
-- Problem:
-- Host enquiries/messages are currently fired when an order is CREATED (or when fulfillment_status changes).
-- This causes the host to receive enquiries for PayMe/FPS orders that are not actually submitted yet (no receipt uploaded).
--
-- Goal:
-- Change the enquiry trigger to fire ONLY when payment_status transitions to 'submitted' (i.e. when user uploads receipt).
-- We do NOT track fulfillment_status anymore for this behaviour.
--
-- Changes:
-- 1. Drop the INSERT trigger that fires on order creation
-- 2. Update the payment_submitted trigger function to add idempotency check
-- 3. Add unique constraint/index to prevent duplicate messages for payment_submitted
-- 4. Ensure idempotency: if message already exists for payment_submitted, do nothing
--
-- ============================================================================
-- PART A: DROP INSERT TRIGGER (ORDER CREATED)
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_order_created_send_message ON public.orders;

-- Drop the function as well (no longer needed)
DROP FUNCTION IF EXISTS public.on_order_created_send_message();

-- ============================================================================
-- PART B: UPDATE PAYMENT_SUBMITTED TRIGGER FUNCTION WITH IDEMPOTENCY
-- ============================================================================

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
  v_conversation_id UUID;
  v_message_exists BOOLEAN;
BEGIN
  -- Only proceed if payment_status transitioned to 'submitted'
  IF OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status != 'submitted' THEN
    RETURN NEW;
  END IF;

  -- IDEMPOTENCY CHECK: Check if a message already exists for this order with trigger_reason='payment_submitted'
  -- Get conversation_id for this order
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE order_id = NEW.id
  LIMIT 1;

  -- If conversation exists, check if payment_submitted message already exists
  IF v_conversation_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.conversation_id = v_conversation_id
        AND m.sender_type = 'system'
        AND m.metadata->>'trigger_reason' = 'payment_submitted'
    ) INTO v_message_exists;

    -- If message already exists, skip calling Edge Function (idempotency)
    IF v_message_exists THEN
      RAISE NOTICE 'Payment submitted message already exists for order %. Skipping notification.', NEW.id;
      RETURN NEW;
    END IF;
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

-- Recreate trigger (in case it doesn't exist or needs to be updated)
DROP TRIGGER IF EXISTS trigger_order_payment_submitted_send_message ON public.orders;

CREATE TRIGGER trigger_order_payment_submitted_send_message
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status = 'submitted')
  EXECUTE FUNCTION public.on_order_payment_submitted_send_message();

COMMENT ON FUNCTION public.on_order_payment_submitted_send_message IS 
  'Sends a notification message to the host when payment_status transitions to ''submitted''. This alerts the host that a receipt has been uploaded and needs verification. Includes idempotency check to prevent duplicate messages.';

-- ============================================================================
-- PART C: ADD UNIQUE CONSTRAINT/INDEX FOR IDEMPOTENCY
-- ============================================================================

-- Add partial unique index to prevent duplicate payment_submitted messages per conversation
-- This provides database-level idempotency protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_payment_submitted_unique
ON messages(conversation_id)
WHERE sender_type = 'system' 
  AND metadata->>'trigger_reason' = 'payment_submitted';

COMMENT ON INDEX idx_messages_payment_submitted_unique IS 
  'Ensures only one payment_submitted system message exists per conversation. Provides database-level idempotency protection.';

-- ============================================================================
-- PART D: REGRESSION TESTS (COMMENTED OUT - UNCOMMENT TO RUN MANUALLY)
-- ============================================================================

/*
-- Test 1: Creating an order with payment_status='unpaid' does NOT create enquiry
DO $$
DECLARE
  v_test_order_id UUID;
  v_message_count INT;
BEGIN
  -- Create test order
  INSERT INTO orders (event_id, buyer_user_id, total_amount, payment_status, fulfillment_status)
  VALUES (
    '<test-event-id>', -- Replace with actual event_id
    '<test-user-id>',  -- Replace with actual user_id
    100.00,
    'unpaid',
    'pending_confirmation'
  )
  RETURNING id INTO v_test_order_id;

  -- Wait a moment for any async triggers
  PERFORM pg_sleep(1);

  -- Check that NO payment_submitted message was created
  SELECT COUNT(*) INTO v_message_count
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.order_id = v_test_order_id
    AND m.sender_type = 'system'
    AND m.metadata->>'trigger_reason' = 'payment_submitted';

  IF v_message_count > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: Order creation created payment_submitted message (expected 0, got %)', v_message_count;
  END IF;

  RAISE NOTICE 'TEST 1 PASSED: Order creation does not create payment_submitted message';
END $$;

-- Test 2: Updating payment_status to 'submitted' DOES create enquiry exactly once
DO $$
DECLARE
  v_test_order_id UUID;
  v_message_count INT;
BEGIN
  -- Create test order
  INSERT INTO orders (event_id, buyer_user_id, total_amount, payment_status, fulfillment_status)
  VALUES (
    '<test-event-id>', -- Replace with actual event_id
    '<test-user-id>',  -- Replace with actual user_id
    100.00,
    'unpaid',
    'pending_confirmation'
  )
  RETURNING id INTO v_test_order_id;

  -- Update payment_status to 'submitted'
  UPDATE orders
  SET payment_status = 'submitted',
      receipt_url = 'test/receipt.jpg',
      submitted_at = NOW()
  WHERE id = v_test_order_id;

  -- Wait a moment for async trigger
  PERFORM pg_sleep(2);

  -- Check that exactly ONE payment_submitted message was created
  SELECT COUNT(*) INTO v_message_count
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.order_id = v_test_order_id
    AND m.sender_type = 'system'
    AND m.metadata->>'trigger_reason' = 'payment_submitted';

  IF v_message_count != 1 THEN
    RAISE EXCEPTION 'TEST FAILED: Expected exactly 1 payment_submitted message (got %)', v_message_count;
  END IF;

  RAISE NOTICE 'TEST 2 PASSED: Payment status update to submitted creates exactly one message';
END $$;

-- Test 3: Updating submitted -> submitted again does NOT duplicate
DO $$
DECLARE
  v_test_order_id UUID;
  v_message_count INT;
BEGIN
  -- Use existing order from Test 2 (or create new one)
  -- Update payment_status from 'submitted' to 'submitted' again
  UPDATE orders
  SET payment_status = 'submitted', -- Same status
      receipt_url = 'test/receipt2.jpg', -- Different receipt
      updated_at = NOW()
  WHERE id = '<test-order-id>' -- Replace with order_id from Test 2
    AND payment_status = 'submitted';

  -- Wait a moment for async trigger
  PERFORM pg_sleep(2);

  -- Check that still only ONE payment_submitted message exists
  SELECT COUNT(*) INTO v_message_count
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.order_id = '<test-order-id>' -- Replace with order_id from Test 2
    AND m.sender_type = 'system'
    AND m.metadata->>'trigger_reason' = 'payment_submitted';

  IF v_message_count != 1 THEN
    RAISE EXCEPTION 'TEST FAILED: Expected exactly 1 payment_submitted message after duplicate update (got %)', v_message_count;
  END IF;

  RAISE NOTICE 'TEST 3 PASSED: Duplicate payment_status update does not create duplicate message';
END $$;

-- Test 4: Updating submitted -> paid does NOT create a new enquiry
DO $$
DECLARE
  v_test_order_id UUID;
  v_message_count_before INT;
  v_message_count_after INT;
BEGIN
  -- Use existing order from Test 2 (or create new one with payment_status='submitted')
  -- Count messages before
  SELECT COUNT(*) INTO v_message_count_before
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.order_id = '<test-order-id>' -- Replace with order_id
    AND m.sender_type = 'system'
    AND m.metadata->>'trigger_reason' = 'payment_submitted';

  -- Update payment_status from 'submitted' to 'paid'
  UPDATE orders
  SET payment_status = 'paid',
      paid_at = NOW()
  WHERE id = '<test-order-id>' -- Replace with order_id
    AND payment_status = 'submitted';

  -- Wait a moment for async trigger
  PERFORM pg_sleep(2);

  -- Count messages after
  SELECT COUNT(*) INTO v_message_count_after
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.order_id = '<test-order-id>' -- Replace with order_id
    AND m.sender_type = 'system'
    AND m.metadata->>'trigger_reason' = 'payment_submitted';

  -- Should be the same count (no new message)
  IF v_message_count_after != v_message_count_before THEN
    RAISE EXCEPTION 'TEST FAILED: Payment status update to paid created new message (before: %, after: %)', v_message_count_before, v_message_count_after;
  END IF;

  RAISE NOTICE 'TEST 4 PASSED: Payment status update to paid does not create new message';
END $$;
*/

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- This migration fixes the order enquiry trigger behavior:
--
-- 1. REMOVED: INSERT trigger that fired on order creation
--    - trigger_order_created_send_message is dropped
--    - on_order_created_send_message function is dropped
--
-- 2. UPDATED: Payment submitted trigger with idempotency
--    - on_order_payment_submitted_send_message now checks if message already exists
--    - Prevents duplicate messages for the same order
--    - Only fires when payment_status transitions to 'submitted'
--
-- 3. ADDED: Unique index for database-level idempotency
--    - idx_messages_payment_submitted_unique ensures one payment_submitted message per conversation
--    - Provides additional protection against race conditions
--
-- 4. BEHAVIOR:
--    - Orders created with payment_status='unpaid' do NOT trigger host notifications
--    - Only when payment_status transitions to 'submitted' (receipt uploaded) does host get notified
--    - Idempotency ensures no duplicate notifications even if trigger fires multiple times
--    - Updating payment_status from 'submitted' to 'paid' does NOT create new notifications
--
-- ============================================================================

