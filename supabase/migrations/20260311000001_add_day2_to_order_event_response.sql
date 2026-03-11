-- Add day_2_start_at and day_2_end_at to event object in get_order_with_event_and_tickets response
-- Required for multi-day event display on order/confirmation pages

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
  v_tickets JSONB;
  v_result JSONB;
BEGIN
  -- Validate order exists
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RETURN NULL;
  END IF;

  -- Fetch order
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
    'receipt_url', o.receipt_url,
    'payment_reference_link', o.payment_reference_link,
    'submitted_at', o.submitted_at,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  ) INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  -- Fetch event (include day_2 for multi-day display)
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
    'org_id', e.org_id
  ) INTO v_event
  FROM events e
  WHERE e.id = (v_order->>'event_id')::UUID
  AND (
    e.status = 'published'
    OR
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = e.org_id
      AND om.user_id = auth.uid()
    )
    OR
    (
      SELECT created_at FROM orders WHERE id = p_order_id
    ) > NOW() - INTERVAL '1 hour'
  );

  -- If event not accessible, return null
  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch order items (reuse same structure as original)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'ticket_type_id', oi.ticket_type_id,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'ticket_type', jsonb_build_object(
        'id', tt.id,
        'name', tt.name
      )
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb) INTO v_order_items
  FROM order_items oi
  LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
  WHERE oi.order_id = p_order_id;

  -- Fetch tickets
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'qr_code', t.qr_code,
      'status', t.status,
      'first_name', t.first_name,
      'last_name', t.last_name,
      'email', t.email,
      'phone', t.phone
    )
    ORDER BY t.created_at
  ), '[]'::jsonb) INTO v_tickets
  FROM tickets t
  WHERE t.order_id = p_order_id;

  -- Build result
  v_result := jsonb_build_object(
    'order', v_order,
    'event', v_event,
    'order_items', v_order_items,
    'tickets', v_tickets
  );

  RETURN v_result;
END;
$$;
