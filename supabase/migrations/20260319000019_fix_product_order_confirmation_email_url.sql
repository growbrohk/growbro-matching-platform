-- Fix: on_product_order_confirmed_send_email was calling send-confirmation-email
-- (event function) instead of send-product-order-confirmation-email. Product orders
-- have no tickets, so the event function returned 400 "No tickets found" and no
-- email was sent. This re-applies the function with the correct Edge Function URL.
--
-- ============================================================================
-- REPLACE FUNCTION WITH CORRECT URL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.on_product_order_confirmed_send_email()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_ref TEXT := 'pbtupzbqtuxzznwummep'; -- From config.toml project_id
  v_function_url TEXT;
  v_secret TEXT;
  v_response_id BIGINT;
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

  -- Only for product orders
  IF NEW.order_type != 'product' THEN
    RETURN NEW;
  END IF;

  -- Only send if email hasn't been sent yet (idempotency check)
  IF NEW.confirmation_email_sent_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Increment attempt counter
  UPDATE orders
  SET confirmation_email_attempts = COALESCE(confirmation_email_attempts, 0) + 1
  WHERE id = NEW.id;

  -- Build Edge Function URL (MUST be send-product-order-confirmation-email, not send-confirmation-email)
  v_function_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/send-product-order-confirmation-email';

  -- Get secret (same as event confirmation email)
  v_secret := current_setting('app.internal_function_secret', true);
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
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING 'INTERNAL_FUNCTION_SECRET not configured for product order confirmation email';
    v_secret := '';
  END IF;

  -- Call Edge Function via pg_net
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

    v_log_data := jsonb_build_object(
      'request_id', v_response_id,
      'triggered_at', NOW(),
      'function_url', v_function_url,
      'status', 'requested',
      'note', 'Response may be async - check Edge Function logs for actual result'
    );

    UPDATE orders
    SET confirmation_email_trigger_log = v_log_data
    WHERE id = NEW.id;

    RAISE NOTICE 'Triggered product order confirmation email for order % (HTTP request ID: %)', NEW.id, v_response_id;

  EXCEPTION
    WHEN OTHERS THEN
      v_error_msg := SQLERRM;
      RAISE WARNING 'Failed to trigger product order confirmation email for order %: %', NEW.id, v_error_msg;

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

COMMENT ON FUNCTION public.on_product_order_confirmed_send_email() IS 'Trigger function: calls send-product-order-confirmation-email Edge Function when product order fulfillment_status transitions to confirmed.';
