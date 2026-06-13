-- Stripe credit card service charge bearer: host absorbs fee vs buyer pays fee on top.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS stripe_fee_bearer TEXT NOT NULL DEFAULT 'host'
  CHECK (stripe_fee_bearer IN ('host', 'user'));

COMMENT ON COLUMN events.stripe_fee_bearer IS
  'Who bears Stripe card processing fee (3.4% + HK$2.35): host or user (buyer).';

ALTER TABLE org_profiles
  ADD COLUMN IF NOT EXISTS stripe_fee_bearer TEXT NOT NULL DEFAULT 'host'
  CHECK (stripe_fee_bearer IN ('host', 'user'));

COMMENT ON COLUMN org_profiles.stripe_fee_bearer IS
  'Default for product checkout: who bears Stripe card processing fee (host or user).';

-- Extend get_order_with_event_and_tickets: include stripe_fee_bearer on event
CREATE OR REPLACE FUNCTION get_order_with_event_and_tickets(p_order_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order JSONB;
  v_event JSONB;
  v_order_items JSONB;
  v_order_addon_items JSONB;
  v_tickets JSONB;
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', o.id,
    'event_id', o.event_id,
    'buyer_user_id', o.buyer_user_id,
    'buyer_first_name', o.buyer_first_name,
    'buyer_last_name', o.buyer_last_name,
    'buyer_email', o.buyer_email,
    'buyer_phone', o.buyer_phone,
    'total_amount', o.total_amount,
    'currency', o.currency,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status,
    'order_no', o.order_no,
    'metadata', COALESCE(o.metadata, '{}'::jsonb),
    'receipt_url', o.receipt_url,
    'payment_reference_link', o.payment_reference_link,
    'submitted_at', o.submitted_at,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  ) INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  IF (v_order->>'event_id') IS NULL OR (v_order->>'event_id') = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'start_at', e.start_at,
    'end_at', e.end_at,
    'day_2_start_at', e.day_2_start_at,
    'day_2_end_at', e.day_2_end_at,
    'location_text', e.location_text,
    'enable_stripe', e.enable_stripe,
    'enable_payme', e.enable_payme,
    'enable_fps', e.enable_fps,
    'payme_link', e.payme_link,
    'fps_link', e.fps_link,
    'stripe_fee_bearer', COALESCE(e.stripe_fee_bearer, 'host'),
    'org_id', e.org_id
  ) INTO v_event
  FROM events e
  WHERE e.id = (v_order->>'event_id')::UUID
  AND (
    e.status = 'published'
    OR EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = e.org_id AND om.user_id = auth.uid())
    OR (SELECT created_at FROM orders WHERE id = p_order_id) > NOW() - INTERVAL '1 hour'
    OR public.collab_can_access_order(p_order_id, 'viewer', true)
  );

  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'ticket_type_id', oi.ticket_type_id,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'metadata', COALESCE(oi.metadata, '{}'::jsonb),
      'ticket_type_access_variant_id', oi.ticket_type_access_variant_id,
      'access_variant', CASE WHEN ttv.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ttv.id,
        'visibility_mode', ttv.visibility_mode,
        'access_code', ttv.access_code,
        'price_override', ttv.price_override,
        'discount_percent', ttv.discount_percent
      ) END,
      'ticket_type', CASE WHEN tt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', tt.id,
        'name', tt.name,
        'valid_for_days', tt.valid_for_days
      ) END
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb) INTO v_order_items
  FROM order_items oi
  LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
  LEFT JOIN ticket_type_access_variants ttv ON ttv.id = oi.ticket_type_access_variant_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oai.id,
      'product_id', oai.product_id,
      'product_variant_id', oai.product_variant_id,
      'quantity', oai.quantity,
      'unit_price', oai.unit_price,
      'subtotal', oai.subtotal,
      'label', oai.label,
      'variant_label', oai.variant_label,
      'ticket_id', oai.ticket_id,
      'shipped_at', oai.shipped_at,
      'carrier_tracking_number', oai.carrier_tracking_number
    )
    ORDER BY oai.created_at
  ), '[]'::jsonb) INTO v_order_addon_items
  FROM order_addon_items oai
  WHERE oai.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'ticket_type_id', t.ticket_type_id,
      'qr_code', t.qr_code,
      'status', t.status,
      'first_name', t.first_name,
      'last_name', t.last_name,
      'email', t.email,
      'phone', t.phone,
      'ticket_type', CASE WHEN tt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', tt.id,
        'name', tt.name,
        'valid_for_days', tt.valid_for_days
      ) END
    )
    ORDER BY t.created_at
  ), '[]'::jsonb) INTO v_tickets
  FROM tickets t
  LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
  WHERE t.order_id = p_order_id;

  v_result := jsonb_build_object(
    'order', v_order,
    'event', v_event,
    'order_items', v_order_items,
    'order_addon_items', v_order_addon_items,
    'tickets', v_tickets
  );

  RETURN v_result;
END;
$$;

-- Extend get_order_with_org_and_products: include stripe_fee_bearer on org
CREATE OR REPLACE FUNCTION get_order_with_org_and_products(p_order_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order JSONB;
  v_org JSONB;
  v_order_items JSONB;
  v_result JSONB;
  v_org_id UUID;
  v_ok BOOLEAN;
BEGIN
  SELECT o.host_org_id INTO v_org_id
  FROM orders o
  WHERE o.id = p_order_id AND o.order_type = 'product';

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT
      EXISTS (
        SELECT 1 FROM org_members om
        WHERE om.org_id = v_org_id AND om.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = p_order_id
        AND o.buyer_user_id IS NOT NULL
        AND o.buyer_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = p_order_id
        AND o.buyer_user_id IS NULL
        AND o.buyer_email IS NOT NULL
        AND (auth.jwt() ->> 'email') IS NOT NULL
        AND o.buyer_email = (auth.jwt() ->> 'email')
      )
      OR EXISTS (SELECT 1 FROM orders o WHERE o.id = p_order_id AND o.created_at > NOW() - INTERVAL '1 hour')
      OR public.collab_can_access_order(p_order_id, 'viewer', true)
    INTO v_ok;

    IF NOT v_ok THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'id', o.id,
    'order_type', o.order_type,
    'host_org_id', o.host_org_id,
    'buyer_user_id', o.buyer_user_id,
    'buyer_first_name', o.buyer_first_name,
    'buyer_last_name', o.buyer_last_name,
    'buyer_email', o.buyer_email,
    'buyer_phone', o.buyer_phone,
    'total_amount', o.total_amount,
    'currency', o.currency,
    'order_no', o.order_no,
    'status', o.status,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'fulfillment_status', o.fulfillment_status,
    'receipt_url', o.receipt_url,
    'submitted_at', o.submitted_at,
    'paid_at', o.paid_at,
    'created_at', o.created_at,
    'shipped_at', o.shipped_at,
    'carrier_tracking_number', o.carrier_tracking_number,
    'metadata', COALESCE(o.metadata, '{}'::jsonb)
  ) INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    'enable_stripe', COALESCE(op.enable_stripe, false),
    'enable_payme', COALESCE(op.enable_payme, false),
    'enable_fps', COALESCE(op.enable_fps, false),
    'payme_link', op.payme_link,
    'fps_link', op.fps_link,
    'stripe_fee_bearer', COALESCE(op.stripe_fee_bearer, 'host')
  ) INTO v_org
  FROM orgs o
  LEFT JOIN org_profiles op ON op.org_id = o.id
  WHERE o.id = v_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'metadata', COALESCE(oi.metadata, '{}'::jsonb),
      'product_name', COALESCE(oi.metadata->>'product_name', 'Item'),
      'variant_label', oi.metadata->>'variant_label',
      'product_access_variant', CASE
        WHEN pav.id IS NOT NULL THEN jsonb_build_object(
          'id', pav.id,
          'visibility_mode', pav.visibility_mode,
          'access_code', pav.access_code,
          'price_override', pav.price_override,
          'discount_percent', pav.discount_percent
        )
        ELSE NULL
      END
    )
  ), '[]'::jsonb) INTO v_order_items
  FROM order_items oi
  LEFT JOIN product_access_variants pav ON pav.id = oi.product_access_variant_id
  WHERE oi.order_id = p_order_id;

  v_result := jsonb_build_object(
    'order', v_order,
    'org', v_org,
    'order_items', v_order_items
  );

  RETURN v_result;
END;
$$;
