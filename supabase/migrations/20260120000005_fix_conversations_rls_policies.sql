-- Migration: Fix RLS policies for conversations and conversation_participants
-- Problem: Users cannot SELECT conversations/conversation_participants after sending messages
-- Root Cause: conversation_participants policy only allows seeing rows where user is member of that participant's org,
--             preventing users from seeing the OTHER participant in a conversation
-- Solution: Update policies to allow SELECT if user belongs to ANY org participating in the conversation

-- ============================================================================
-- 1. FIX conversations SELECT POLICY
-- ============================================================================

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

CREATE POLICY "Users can view their conversations"
ON public.conversations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.org_members om ON om.org_id = cp.org_id
    WHERE cp.conversation_id = conversations.id
      AND om.user_id = auth.uid()
  )
);

-- ============================================================================
-- 2. FIX conversation_participants SELECT POLICY
-- ============================================================================

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cp_select_if_member" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;

-- Allow SELECT if:
-- 1. User is a member of the participant's org (can see their own org's participation), OR
-- 2. User is a member of ANY org participating in the same conversation (can see other participants)
CREATE POLICY "cp_select_if_member"
ON public.conversation_participants FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND om.org_id = conversation_participants.org_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.conversation_participants cp2
    JOIN public.org_members om2 ON om2.org_id = cp2.org_id
    WHERE cp2.conversation_id = conversation_participants.conversation_id
      AND om2.user_id = auth.uid()
  )
);

