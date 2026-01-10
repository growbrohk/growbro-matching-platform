-- Migration: Fix infinite recursion in conversation_participants RLS policy
-- The policy was querying conversation_participants within itself, causing recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON conversation_participants;

-- Recreate with a simpler approach that avoids recursion
-- Users can see participants if:
-- 1. They're a member of that participant's org, OR
-- 2. They're a member of an org that has sent/received messages in this conversation
--    (checking via conversation_messages avoids recursion)
CREATE POLICY "Users can view participants of their conversations"
  ON conversation_participants FOR SELECT
  USING (
    -- User is a member of the participant org (can see their own org's participation)
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = conversation_participants.org_id
      AND om.user_id = auth.uid()
    )
    -- OR user is a member of an org that has sent messages in this conversation
    -- This avoids recursion by checking conversation_messages instead of conversation_participants
    OR EXISTS (
      SELECT 1 FROM org_members om
      INNER JOIN conversation_messages cm ON cm.sender_org_id = om.org_id
      WHERE om.user_id = auth.uid()
      AND cm.conversation_id = conversation_participants.conversation_id
    )
  );

