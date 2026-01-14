-- Migration: Fix confirmation email trigger with secret auth and response logging
-- This updates the trigger to include secret header authentication and stores
-- trigger call responses in confirmation_email_trigger_log for debugging
--
-- REQUIRED:
--   - Set INTERNAL_FUNCTION_SECRET environment variable in Supabase Dashboard
--     (Settings > Edge Functions > Environment Variables)
--   - pg_net extension must be enabled (already done in previous migration)
--
-- ============================================================================
-- 1. ADD TRIGGER LOG COLUMN TO ORDERS TABLE
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS confirmation_email_trigger_log JSONB;

COMMENT ON COLUMN orders.confirmation_email_trigger_log IS 'Stores last trigger call response (status, body, error) for debugging';

-- ============================================================================
-- 2. ADD INDEX ON FULFILLMENT_STATUS FOR TRIGGER PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status 
ON orders(fulfillment_status) 
WHERE fulfillment_status = 'confirmed';

-- ============================================================================
-- 3. CREATE CONFIG TABLE FOR SECRET (OPTIONAL - ALTERNATIVE TO DB SETTING)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant access to trigger function
GRANT SELECT ON public.app_config TO postgres, anon, authenticated, service_role;

COMMENT ON TABLE public.app_config IS 'Application configuration table for storing secrets and settings';

-- ============================================================================
-- 4. UPDATE TRIGGER FUNCTION WITH SECRET AUTH AND RESPONSE LOGGING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.on_order_confirmed_send_email()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_ref TEXT := 'usadgrhxgdhjmkznupri'; -- From config.toml project_id
  v_function_url TEXT;
  v_secret TEXT; -- Will be read from environment variable via current_setting
  v_response_id BIGINT;
  v_response_status INT;
  v_response_body TEXT;
  v_response_headers JSONB;
  v_error_msg TEXT;
  v_log_data JSONB;
BEGIN
  -- Only proceed if fulfillment_status transitioned to 'confirmed'
  IF OLD.fulfillment_status IS NOT DISTINCT FROM NEW.fulfillment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.fulfillment_status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Only send if email hasn't been sent yet (idempotency check)
  IF NEW.confirmation_email_sent_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Increment attempt counter (update the row)
  UPDATE orders
  SET confirmation_email_attempts = COALESCE(confirmation_email_attempts, 0) + 1
  WHERE id = NEW.id;

  -- Build Edge Function URL
  v_function_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/send-confirmation-email';

  -- Get secret - must match INTERNAL_FUNCTION_SECRET env var in Edge Function
  -- Option 1: Read from database setting (set via: ALTER DATABASE postgres SET app.internal_function_secret = 'your-secret';)
  v_secret := current_setting('app.internal_function_secret', true);
  
  -- Option 2: If not set, try reading from a config table (create it if needed)
  IF v_secret IS NULL OR v_secret = '' THEN
    BEGIN
      SELECT value INTO v_secret
      FROM public.app_config
      WHERE key = 'internal_function_secret'
      LIMIT 1;
    EXCEPTION
      WHEN OTHERS THEN
        -- Config table doesn't exist or error reading - will use empty string
        NULL;
    END;
  END IF;
  
  -- Option 3: If still not set, log warning and use empty (will cause auth failure but visible in logs)
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING 'INTERNAL_FUNCTION_SECRET not configured. Set it via: ALTER DATABASE postgres SET app.internal_function_secret = ''your-secret''; OR create app_config table and insert secret';
    v_secret := ''; -- Will cause 401 error, making the issue visible
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

    -- Wait a moment for async response (pg_net is async by default)
    -- In production, you might want to check the response status later via net.http_get_response
    -- For now, we'll log the request ID and update later if needed
    
    -- Try to get response status (this may not be immediately available)
    -- Note: net.http_post returns a request ID, not the response itself
    -- The actual response is available via net.http_get_response(v_response_id) but may be async
    
    -- Store request ID and timestamp in log
    v_log_data := jsonb_build_object(
      'request_id', v_response_id,
      'triggered_at', NOW(),
      'function_url', v_function_url,
      'status', 'requested',
      'note', 'Response may be async - check Edge Function logs for actual result'
    );

    -- Update order with trigger log
    UPDATE orders
    SET confirmation_email_trigger_log = v_log_data
    WHERE id = NEW.id;

    RAISE NOTICE 'Triggered confirmation email for order % (HTTP request ID: %)', NEW.id, v_response_id;

  EXCEPTION
    WHEN OTHERS THEN
      v_error_msg := SQLERRM;
      RAISE WARNING 'Failed to trigger confirmation email for order %: %', NEW.id, v_error_msg;
      
      -- Store error in log
      v_log_data := jsonb_build_object(
        'error', v_error_msg,
        'triggered_at', NOW(),
        'function_url', v_function_url,
        'status', 'error'
      );
      
      UPDATE orders
      SET 
        confirmation_email_error = 'Trigger error: ' || v_error_msg,
        confirmation_email_trigger_log = v_log_data
      WHERE id = NEW.id;
  END;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. RECREATE TRIGGER (to ensure it uses updated function)
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_order_confirmed_send_email ON public.orders;

CREATE TRIGGER trigger_order_confirmed_send_email
  AFTER UPDATE OF fulfillment_status ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status
    AND NEW.fulfillment_status = 'confirmed'
    AND NEW.confirmation_email_sent_at IS NULL
  )
  EXECUTE FUNCTION public.on_order_confirmed_send_email();

-- ============================================================================
-- SETUP INSTRUCTIONS:
-- ============================================================================
-- 
-- STEP 1: Set INTERNAL_FUNCTION_SECRET in Edge Function environment variables
--   - Go to Supabase Dashboard > Edge Functions > send-confirmation-email
--   - Add environment variable: INTERNAL_FUNCTION_SECRET = <your-secret-value>
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
--   UPDATE orders SET fulfillment_status = 'confirmed' WHERE id = '<test-order-id>';
--   Check orders.confirmation_email_trigger_log for request details
--   Check Edge Function logs in Supabase Dashboard for execution results
--
-- NOTES:
-- ============================================================================
-- 1. The secret MUST match between Edge Function env var and database setting/config
--
-- 2. pg_net.http_post is async - the response may not be immediately available
--    Check Edge Function logs in Supabase Dashboard for actual execution results
--
-- 3. The trigger_log column stores the request metadata (request_id, timestamp)
--    for debugging trigger calls
--
-- 4. Manual test via curl:
--    curl -X POST https://<project-ref>.supabase.co/functions/v1/send-confirmation-email \
--      -H "Content-Type: application/json" \
--      -H "X-Internal-Secret: <your-secret>" \
--      -d '{"order_id": "<order-id>"}'
--
-- ============================================================================
-- TESTING:
-- ============================================================================
--
-- SQL TEST - Update order to confirmed and verify trigger fires:
--   -- Reset an order for testing
--   UPDATE orders 
--   SET fulfillment_status = 'pending', 
--       confirmation_email_sent_at = NULL,
--       confirmation_email_error = NULL,
--       confirmation_email_trigger_log = NULL
--   WHERE id = '<test-order-id>';
--   
--   -- Trigger the confirmation
--   UPDATE orders 
--   SET fulfillment_status = 'confirmed' 
--   WHERE id = '<test-order-id>';
--   
--   -- Check trigger log
--   SELECT id, fulfillment_status, confirmation_email_sent_at, 
--          confirmation_email_error, confirmation_email_trigger_log
--   FROM orders 
--   WHERE id = '<test-order-id>';
--
-- CURL TEST - Call function directly:
--   curl -X POST https://usadgrhxgdhjmkznupri.supabase.co/functions/v1/send-confirmation-email \
--     -H "Content-Type: application/json" \
--     -H "X-Internal-Secret: <your-secret>" \
--     -d '{"order_id": "<test-order-id>"}'
--
--   Expected response (success):
--     {"success":true,"order_id":"...","resend_id":"...","sent_at":"...","correlation_id":"..."}
--
--   Check Edge Function logs in Supabase Dashboard for detailed logs with correlation_id
-- ============================================================================

