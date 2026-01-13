-- Migration: Add automatic confirmation email sending when order becomes confirmed
-- This implements idempotent email sending via DB trigger → Edge Function → Resend

-- ============================================================================
-- NOTE: Project reference is set from config.toml project_id
-- If you need to change it, update the v_project_ref variable below
-- ============================================================================

-- ============================================================================
-- 1. ADD EMAIL TRACKING FIELDS TO ORDERS TABLE
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmation_email_resend_id TEXT,
ADD COLUMN IF NOT EXISTS confirmation_email_error TEXT,
ADD COLUMN IF NOT EXISTS confirmation_email_attempts INTEGER DEFAULT 0;

-- Add index for querying orders that need email sending
CREATE INDEX IF NOT EXISTS idx_orders_confirmation_email_sent_at 
ON orders(confirmation_email_sent_at) 
WHERE confirmation_email_sent_at IS NOT NULL;

COMMENT ON COLUMN orders.confirmation_email_sent_at IS 'Timestamp when confirmation email was successfully sent';
COMMENT ON COLUMN orders.confirmation_email_resend_id IS 'Resend API message ID for tracking';
COMMENT ON COLUMN orders.confirmation_email_error IS 'Error message if email sending failed';
COMMENT ON COLUMN orders.confirmation_email_attempts IS 'Number of attempts to send confirmation email';

-- ============================================================================
-- 2. ENABLE PG_NET EXTENSION (for HTTP requests from triggers)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 3. CREATE TRIGGER FUNCTION TO CALL EDGE FUNCTION
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
  v_response_id BIGINT;
BEGIN
  -- Only proceed if fulfillment_status transitioned to 'confirmed'
  IF OLD.fulfillment_status = NEW.fulfillment_status THEN
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

  -- Call Edge Function via pg_net
  -- Note: Edge Function has verify_jwt = false in config.toml, so no auth header needed
  -- For additional security, you can add a secret header check in the Edge Function
  SELECT net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'order_id', NEW.id::text
    )
  ) INTO v_response_id;

  -- Log the HTTP request ID (for debugging)
  RAISE NOTICE 'Triggered confirmation email for order % (HTTP request ID: %)', NEW.id, v_response_id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to trigger confirmation email for order %: %', NEW.id, SQLERRM;
    -- Store error in the order record
    UPDATE orders
    SET confirmation_email_error = SQLERRM
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. CREATE TRIGGER ON ORDERS TABLE
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
-- NOTES:
-- ============================================================================
-- 1. The trigger fires AFTER UPDATE, so the order is already committed
-- 2. The Edge Function will handle idempotency by checking confirmation_email_sent_at
-- 3. The trigger increments confirmation_email_attempts before calling the function
-- 4. Errors are logged but don't fail the transaction
-- 5. Replace <PROJECT_REF> with your actual Supabase project reference before deploying
-- ============================================================================

