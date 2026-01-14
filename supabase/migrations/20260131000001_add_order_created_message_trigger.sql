-- Migration: Add trigger to send system message when order is created
-- This automatically creates a conversation and system message for each new order
-- based on the order's fulfillment_status
--
-- REQUIRED:
--   - Set INTERNAL_FUNCTION_SECRET environment variable in Supabase Dashboard
--     (Settings > Edge Functions > Environment Variables)
--   - pg_net extension must be enabled
--
-- ============================================================================
-- 1. CREATE TRIGGER FUNCTION TO CALL EDGE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.on_order_created_send_message()
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
  -- Only proceed for new orders (INSERT trigger)
  -- We want to create a message for every new order regardless of fulfillment_status
  
  -- Build Edge Function URL
  v_function_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/order-created-message';

  -- Get secret - must match INTERNAL_FUNCTION_SECRET env var in Edge Function
  -- Option 1: Read from database setting
  v_secret := current_setting('app.internal_function_secret', true);
  
  -- Option 2: If not set, try reading from app_config table
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
  
  -- Option 3: If still not set, log warning
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING 'INTERNAL_FUNCTION_SECRET not configured. Set it via: ALTER DATABASE postgres SET app.internal_function_secret = ''your-secret''; OR create app_config table and insert secret';
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
        'order_id', NEW.id::text
      )
    ) INTO v_response_id;

    RAISE NOTICE 'Triggered order created message for order % (HTTP request ID: %)', NEW.id, v_response_id;

  EXCEPTION
    WHEN OTHERS THEN
      v_error_msg := SQLERRM;
      RAISE WARNING 'Failed to trigger order created message for order %: %', NEW.id, v_error_msg;
  END;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. CREATE TRIGGER ON ORDERS INSERT
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_order_created_send_message ON public.orders;

CREATE TRIGGER trigger_order_created_send_message
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_created_send_message();

-- ============================================================================
-- SETUP INSTRUCTIONS:
-- ============================================================================
-- 
-- STEP 1: Set INTERNAL_FUNCTION_SECRET in Edge Function environment variables
--   - Go to Supabase Dashboard > Edge Functions > order-created-message
--   - Add environment variable: INTERNAL_FUNCTION_SECRET = <your-secret-value>
--   - (Same secret as used for send-confirmation-email)
--
-- STEP 2: Set the same secret in the database (choose one method):
--   
--   Method A - Database setting (recommended):
--     ALTER DATABASE postgres SET app.internal_function_secret = 'your-secret-value';
--   
--   Method B - Config table:
--     INSERT INTO public.app_config (key, value) 
--     VALUES ('internal_function_secret', 'your-secret-value')
--     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
--
-- STEP 3: Verify trigger works:
--   -- Create a test order
--   INSERT INTO orders (event_id, buyer_user_id, total_amount, fulfillment_status)
--   VALUES ('<test-event-id>', '<test-user-id>', 100.00, 'pending_confirmation');
--   
--   -- Check that conversation and message were created
--   SELECT c.id, c.order_id, m.body, m.metadata->>'fulfillment_status' as status
--   FROM conversations c
--   LEFT JOIN messages m ON m.conversation_id = c.id
--   WHERE c.order_id = '<test-order-id>'
--   ORDER BY m.created_at DESC;
--
-- NOTES:
-- ============================================================================
-- 1. The secret MUST match between Edge Function env var and database setting/config
--
-- 2. pg_net.http_post is async - the response may not be immediately available
--    Check Edge Function logs in Supabase Dashboard for actual execution results
--
-- 3. The trigger fires on EVERY order INSERT, regardless of fulfillment_status
--    The edge function determines the message content based on fulfillment_status
--
-- 4. Manual test via curl:
--    curl -X POST https://<project-ref>.supabase.co/functions/v1/order-created-message \
--      -H "Content-Type: application/json" \
--      -H "X-Internal-Secret: <your-secret>" \
--      -d '{"order_id": "<order-id>"}'
--
-- ============================================================================
-- TESTING:
-- ============================================================================
--
-- SQL TEST - Create order and verify message:
--   -- Create test order with pending_confirmation
--   INSERT INTO orders (event_id, buyer_user_id, total_amount, fulfillment_status)
--   VALUES ('<test-event-id>', '<test-user-id>', 100.00, 'pending_confirmation')
--   RETURNING id;
--   
--   -- Wait a moment for async trigger
--   SELECT pg_sleep(2);
--   
--   -- Check conversation and message
--   SELECT 
--     c.id as conversation_id,
--     c.order_id,
--     m.body,
--     m.sender_type,
--     m.metadata->>'fulfillment_status' as fulfillment_status,
--     m.metadata->>'status_display' as status_display
--   FROM conversations c
--   LEFT JOIN messages m ON m.conversation_id = c.id
--   WHERE c.order_id = '<test-order-id>'
--   ORDER BY m.created_at DESC
--   LIMIT 1;
--
--   -- Expected: Message with body "✅ Order received — pending confirmation."
--   --          and status_display = "Pending"
--
--   -- Test with confirmed status
--   INSERT INTO orders (event_id, buyer_user_id, total_amount, fulfillment_status)
--   VALUES ('<test-event-id>', '<test-user-id>', 100.00, 'confirmed')
--   RETURNING id;
--   
--   -- Expected: Message with body "✅ Order confirmed — your ticket is ready."
--   --          and status_display = "Confirmed"
-- ============================================================================

