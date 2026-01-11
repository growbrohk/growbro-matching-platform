-- Migration: Fix booking quantity to derive from tickets count
-- Problem: BookingSuccessPage shows "No items found" because tickets RLS blocks anon users
-- Solution: 
-- 1. Create SECURITY DEFINER RPC to fetch order with tickets (works for anon)
-- 2. Update tickets RLS to allow viewing tickets for orders created in last 1 hour (guest checkout)
-- 3. Update order_items RLS to match orders RLS for guest checkout

-- ============================================================================
-- 1. CREATE RPC FUNCTION: get_order_with_event_and_tickets
-- ============================================================================
-- This RPC allows secure fetching of orders with tickets for guest checkout
-- Validates that the order exists and event is published/public

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

  -- Fetch event (only if published, user has access, or order was created recently for guest checkout)
  SELECT jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'start_at', e.start_at,
    'end_at', e.end_at,
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
    -- Allow if event is published (public)
    e.status = 'published'
    OR
    -- Allow if user is authenticated and has org access
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = e.org_id
      AND om.user_id = auth.uid()
    )
    OR
    -- Allow if order was created in last 1 hour (for guest checkout immediate access)
    -- This allows viewing the success page immediately after booking creation
    (
      SELECT created_at FROM orders WHERE id = p_order_id
    ) > NOW() - INTERVAL '1 hour'
  );

  -- If event not accessible, return null
  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch order items
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

  -- Fetch tickets (ALWAYS return tickets - this is the source of truth for quantity)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_order_with_event_and_tickets TO authenticated;
GRANT EXECUTE ON FUNCTION get_order_with_event_and_tickets TO anon;

COMMENT ON FUNCTION get_order_with_event_and_tickets IS 
'Fetches order with event and tickets. Works for anon users if:
- Order was created in last 1 hour (guest checkout)
- Event is published (public)
Returns JSONB with order, event, order_items, and tickets arrays.';

-- ============================================================================
-- 2. UPDATE TICKETS RLS FOR GUEST CHECKOUT
-- ============================================================================
-- Allow viewing tickets for orders that match the same conditions as orders RLS

DROP POLICY IF EXISTS "Users can view their own tickets" ON tickets;

CREATE POLICY "Users can view their own tickets"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = tickets.order_id
      AND (
        -- Authenticated users can view tickets where buyer_user_id matches
        (o.buyer_user_id IS NOT NULL AND o.buyer_user_id = auth.uid())
        OR
        -- Guest checkout: users can view tickets where buyer_email matches their JWT email
        (
          o.buyer_user_id IS NULL
          AND o.buyer_email IS NOT NULL
          AND (auth.jwt() ->> 'email') IS NOT NULL
          AND o.buyer_email = (auth.jwt() ->> 'email')
        )
        OR
        -- Allow viewing tickets for orders created in the last 1 hour (for immediate success page access)
        -- This allows users to view their tickets immediately after creation
        -- even if they're not logged in or email doesn't match yet
        -- Limited to 1 hour for security
        (
          o.created_at > NOW() - INTERVAL '1 hour'
        )
      )
    )
  );

-- ============================================================================
-- 3. UPDATE ORDER_ITEMS RLS FOR GUEST CHECKOUT
-- ============================================================================
-- Allow viewing order_items for orders that match the same conditions as orders RLS

DROP POLICY IF EXISTS "Users can view order items for their orders or events in their orgs" ON order_items;

CREATE POLICY "Users can view order items for their orders or events in their orgs"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND (
        -- Authenticated users can view order items where buyer_user_id matches
        (o.buyer_user_id IS NOT NULL AND o.buyer_user_id = auth.uid())
        OR
        -- Guest checkout: users can view order items where buyer_email matches their JWT email
        (
          o.buyer_user_id IS NULL
          AND o.buyer_email IS NOT NULL
          AND (auth.jwt() ->> 'email') IS NOT NULL
          AND o.buyer_email = (auth.jwt() ->> 'email')
        )
        OR
        -- Allow viewing order items for orders created in the last 1 hour (for immediate success page access)
        (
          o.created_at > NOW() - INTERVAL '1 hour'
        )
        OR
        -- Org members can view order items for events in their orgs
        EXISTS (
          SELECT 1 FROM events e
          JOIN org_members om ON om.org_id = e.org_id
          WHERE e.id = o.event_id
          AND om.user_id = auth.uid()
        )
      )
    )
  );

