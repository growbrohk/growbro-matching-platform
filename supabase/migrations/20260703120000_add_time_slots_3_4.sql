-- =====================================================
-- Add optional Time Slots 3 and 4 to events
-- Extend valid_for_days for per-slot and all-slots tickets
-- =====================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS day_3_start_at timestamptz;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS day_3_end_at timestamptz;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS day_4_start_at timestamptz;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS day_4_end_at timestamptz;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_day_3_times_check;

ALTER TABLE events
  ADD CONSTRAINT events_day_3_times_check CHECK (
    (day_3_start_at IS NULL AND day_3_end_at IS NULL)
    OR
    (day_3_start_at IS NOT NULL AND day_3_end_at IS NOT NULL AND day_3_end_at > day_3_start_at)
  );

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_day_4_times_check;

ALTER TABLE events
  ADD CONSTRAINT events_day_4_times_check CHECK (
    (day_4_start_at IS NULL AND day_4_end_at IS NULL)
    OR
    (day_4_start_at IS NOT NULL AND day_4_end_at IS NOT NULL AND day_4_end_at > day_4_start_at)
  );

COMMENT ON COLUMN events.day_3_start_at IS 'Optional Time Slot 3 start time. When set, day_3_end_at must also be set.';
COMMENT ON COLUMN events.day_3_end_at IS 'Optional Time Slot 3 end time. When set, day_3_start_at must also be set.';
COMMENT ON COLUMN events.day_4_start_at IS 'Optional Time Slot 4 start time. When set, day_4_end_at must also be set.';
COMMENT ON COLUMN events.day_4_end_at IS 'Optional Time Slot 4 end time. When set, day_4_start_at must also be set.';

ALTER TABLE ticket_types
  DROP CONSTRAINT IF EXISTS ticket_types_valid_for_days_check;

ALTER TABLE ticket_types
  ADD CONSTRAINT ticket_types_valid_for_days_check
  CHECK (valid_for_days IN ('day_1', 'day_2', 'day_3', 'day_4', 'both', 'all'));

COMMENT ON COLUMN ticket_types.valid_for_days IS 'Which time slot(s) this ticket grants access: day_1..day_4, both (legacy 2-slot), or all configured slots.';

-- Extend get_order_with_event_and_tickets: include day_3 and day_4 on event
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
    'day_3_start_at', e.day_3_start_at,
    'day_3_end_at', e.day_3_end_at,
    'day_4_start_at', e.day_4_start_at,
    'day_4_end_at', e.day_4_end_at,
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
