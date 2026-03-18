-- Migration: Add host org as participant for product orders in get_or_create_order_conversation
-- Product orders have event_id = NULL and host_org_id = seller org. The host must be a participant
-- to receive payment_submitted notifications and see the conversation.

CREATE OR REPLACE FUNCTION get_or_create_order_conversation(p_order_id UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_conversation_id UUID;
  v_order orders%ROWTYPE;
BEGIN
  -- Get order details
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Check if conversation already exists for this order
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE order_id = p_order_id
  LIMIT 1;

  -- If conversation exists, return it
  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- Create new conversation for this order
  INSERT INTO conversations (id, order_id)
  VALUES (gen_random_uuid(), p_order_id)
  RETURNING id INTO v_conversation_id;

  -- Add participants: buyer's org (if exists) and host org (event or product)
  -- Get buyer's org_id from buyer_user_id (if authenticated)
  IF v_order.buyer_user_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, org_id)
    SELECT DISTINCT v_conversation_id, om.org_id
    FROM org_members om
    WHERE om.user_id = v_order.buyer_user_id
    LIMIT 1
    ON CONFLICT DO NOTHING;
  END IF;

  -- Add event's org as participant (event orders)
  INSERT INTO conversation_participants (conversation_id, org_id)
  SELECT DISTINCT v_conversation_id, e.org_id
  FROM events e
  WHERE e.id = v_order.event_id
  ON CONFLICT DO NOTHING;

  -- Add host org for product orders (when event_id is NULL)
  IF v_order.event_id IS NULL AND v_order.host_org_id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, org_id)
    VALUES (v_conversation_id, v_order.host_org_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_conversation_id;
END;
$$;

COMMENT ON FUNCTION get_or_create_order_conversation(UUID) IS 'Gets or creates a conversation for an order. Adds buyer org, event org (event orders), or host org (product orders) as participants.';
