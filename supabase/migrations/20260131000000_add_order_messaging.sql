-- Migration: Add order-based messaging system
-- Creates conversations linked to orders and messages table with sender_type support
-- Enables automatic system messages when orders are created

-- ============================================================================
-- 1. ADD ORDER_ID TO CONVERSATIONS TABLE
-- ============================================================================

-- Add order_id column to conversations (unique, one conversation per order)
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE;

-- Create unique index to ensure one conversation per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_order_id 
ON conversations(order_id) 
WHERE order_id IS NOT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_order_id_lookup 
ON conversations(order_id);

-- ============================================================================
-- 2. CREATE MESSAGES TABLE
-- ============================================================================

-- Messages table for system and user messages linked to conversations
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('system', 'user', 'org')),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) <= 2000),
  metadata JSONB DEFAULT '{}'::jsonb, -- Store fulfillment_status, order info, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at 
ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_type 
ON messages(sender_type);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
ON messages(conversation_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES FOR MESSAGES
-- ============================================================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users and system can insert messages" ON messages;

-- Users can view messages from conversations they participate in
-- (via conversation_participants or via order ownership)
CREATE POLICY "Users can view messages from their conversations"
  ON messages FOR SELECT
  USING (
    -- User is participant in the conversation
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      INNER JOIN org_members om ON om.org_id = cp.org_id
      WHERE cp.conversation_id = messages.conversation_id
      AND om.user_id = auth.uid()
    )
    -- OR user owns the order linked to the conversation
    OR EXISTS (
      SELECT 1 FROM conversations c
      INNER JOIN orders o ON o.id = c.order_id
      WHERE c.id = messages.conversation_id
      AND o.buyer_user_id = auth.uid()
    )
  );

-- System can insert messages (via service role or edge function)
-- Users/orgs can insert messages if they're participants
CREATE POLICY "Users and system can insert messages"
  ON messages FOR INSERT
  WITH CHECK (
    -- System messages (sender_type = 'system') - allowed via service role
    sender_type = 'system'
    -- OR user is member of sender_org_id and org is participant
    OR (
      sender_type = 'org'
      AND EXISTS (
        SELECT 1 FROM org_members om
        WHERE om.org_id = messages.sender_org_id
        AND om.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
        AND cp.org_id = messages.sender_org_id
      )
    )
    -- OR user is sender and owns the order
    OR (
      sender_type = 'user'
      AND sender_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM conversations c
        INNER JOIN orders o ON o.id = c.order_id
        WHERE c.id = messages.conversation_id
        AND o.buyer_user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 4. UPDATE CONVERSATION LAST_MESSAGE_AT TRIGGER TO INCLUDE MESSAGES
-- ============================================================================

-- Create trigger function to update conversation last_message_at from messages table
CREATE OR REPLACE FUNCTION update_conversation_last_message_at_from_messages()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for messages table
DROP TRIGGER IF EXISTS trigger_update_conversation_last_message_at_from_messages ON messages;
CREATE TRIGGER trigger_update_conversation_last_message_at_from_messages
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message_at_from_messages();

-- ============================================================================
-- 5. CREATE FUNCTION TO GET OR CREATE CONVERSATION FOR ORDER
-- ============================================================================

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

  -- Add participants: buyer's org (if exists) and event's org
  -- Get buyer's org_id from buyer_user_id (if authenticated)
  IF v_order.buyer_user_id IS NOT NULL THEN
    -- Try to find buyer's org membership
    INSERT INTO conversation_participants (conversation_id, org_id)
    SELECT DISTINCT v_conversation_id, om.org_id
    FROM org_members om
    WHERE om.user_id = v_order.buyer_user_id
    LIMIT 1
    ON CONFLICT DO NOTHING;
  END IF;

  -- Add event's org as participant
  INSERT INTO conversation_participants (conversation_id, org_id)
  SELECT DISTINCT v_conversation_id, e.org_id
  FROM events e
  WHERE e.id = v_order.event_id
  ON CONFLICT DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_or_create_order_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_order_conversation(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_or_create_order_conversation(UUID) TO service_role;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. Conversations are now linked to orders via order_id (unique constraint)
-- 2. Messages table supports sender_type: 'system', 'user', 'org'
-- 3. System messages are inserted by edge functions with service_role
-- 4. RLS policies allow:
--    - Buyers to view messages for their orders
--    - Event hosts to view messages for orders in their events
--    - System to insert messages (via service_role)
-- 5. The get_or_create_order_conversation function creates conversations
--    and adds participants automatically

