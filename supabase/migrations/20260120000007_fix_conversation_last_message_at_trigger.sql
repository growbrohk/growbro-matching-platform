-- =====================================================
-- Fix conversation last_message_at trigger
-- =====================================================
-- Problem: Trigger function is not SECURITY DEFINER, so RLS blocks UPDATE
-- Solution: Make trigger function SECURITY DEFINER to bypass RLS
-- Also backfill existing conversations with messages but NULL last_message_at

-- =====================================================
-- 1. FIX TRIGGER FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION update_conversation_last_message_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- =====================================================
-- 2. BACKFILL EXISTING CONVERSATIONS
-- =====================================================

-- Update conversations that have messages but NULL last_message_at
UPDATE conversations c
SET last_message_at = (
  SELECT MAX(created_at)
  FROM conversation_messages cm
  WHERE cm.conversation_id = c.id
)
WHERE c.last_message_at IS NULL
AND EXISTS (
  SELECT 1
  FROM conversation_messages cm
  WHERE cm.conversation_id = c.id
);

-- =====================================================
-- 3. COMMENTS
-- =====================================================

COMMENT ON FUNCTION update_conversation_last_message_at() IS 'Trigger function to update conversations.last_message_at when messages are inserted. Uses SECURITY DEFINER to bypass RLS.';

