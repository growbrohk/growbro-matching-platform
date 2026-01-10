-- Migration: Create Conversations Tables for 1:1 Messaging
-- This creates the foundation for org-to-org messaging (Couchsurf-style)

-- ============================================================================
-- 1. CREATE TABLES
-- ============================================================================

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- Conversation participants table (junction table)
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, org_id)
);

-- Conversation messages table
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversation_participants_org_id ON conversation_participants(org_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id_created_at ON conversation_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_sender_org_id ON conversation_messages(sender_org_id);

-- ============================================================================
-- 3. CREATE RPC FUNCTION: get_or_create_conversation
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_conversation(p_org_a UUID, p_org_b UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_conversation_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Verify user is member of at least one of the orgs
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id IN (p_org_a, p_org_b)
    AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User must be member of at least one organization';
  END IF;

  -- Check if conversation already exists
  SELECT c.id INTO v_conversation_id
  FROM conversations c
  INNER JOIN conversation_participants cp1 ON cp1.conversation_id = c.id
  INNER JOIN conversation_participants cp2 ON cp2.conversation_id = c.id
  WHERE cp1.org_id = p_org_a
    AND cp2.org_id = p_org_b
  LIMIT 1;

  -- If conversation exists, return it
  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- Create new conversation
  INSERT INTO conversations (id)
  VALUES (gen_random_uuid())
  RETURNING id INTO v_conversation_id;

  -- Add both participants
  INSERT INTO conversation_participants (conversation_id, org_id)
  VALUES 
    (v_conversation_id, p_org_a),
    (v_conversation_id, p_org_b);

  RETURN v_conversation_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_or_create_conversation(UUID, UUID) TO authenticated;

-- ============================================================================
-- 4. CREATE TRIGGER FUNCTION: update_last_message_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_conversation_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_conversation_last_message_at ON conversation_messages;
CREATE TRIGGER trigger_update_conversation_last_message_at
  AFTER INSERT ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message_at();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can view conversations they participate in
CREATE POLICY "Users can view conversations they participate in"
  ON conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      INNER JOIN org_members om ON om.org_id = cp.org_id
      WHERE cp.conversation_id = conversations.id
      AND om.user_id = auth.uid()
    )
  );

-- Conversation participants: Users can view participants of their conversations
CREATE POLICY "Users can view participants of their conversations"
  ON conversation_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = conversation_participants.org_id
      AND om.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM conversation_participants cp2
      INNER JOIN org_members om2 ON om2.org_id = cp2.org_id
      WHERE cp2.conversation_id = conversation_participants.conversation_id
      AND om2.user_id = auth.uid()
    )
  );

-- Conversation messages: Users can view messages from conversations they participate in
CREATE POLICY "Users can view messages from their conversations"
  ON conversation_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      INNER JOIN org_members om ON om.org_id = cp.org_id
      WHERE cp.conversation_id = conversation_messages.conversation_id
      AND om.user_id = auth.uid()
    )
  );

-- Conversation messages: Users can insert messages if they are sender and participant
CREATE POLICY "Users can insert messages as sender"
  ON conversation_messages FOR INSERT
  WITH CHECK (
    -- User must be member of sender_org_id
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = conversation_messages.sender_org_id
      AND om.user_id = auth.uid()
    )
    -- And sender_org_id must be participant in the conversation
    AND EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = conversation_messages.conversation_id
      AND cp.org_id = conversation_messages.sender_org_id
    )
  );

