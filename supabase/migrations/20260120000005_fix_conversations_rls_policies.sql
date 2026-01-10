-- Migration: Fix RLS policies for conversations and conversation_participants
-- Problem: Users cannot SELECT conversations/conversation_participants after sending messages
-- Root Cause: conversation_participants policy only allows seeing rows where user is member of that participant's org,
--             preventing users from seeing the OTHER participant in a conversation
-- Solution: Use SECURITY DEFINER function to break recursion, allowing users to see all participants
--           in conversations where they're a member of any participating org

-- ============================================================================
-- 1. CREATE HELPER FUNCTION (SECURITY DEFINER to bypass RLS and break recursion)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_can_access_conversation(p_conversation_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Check if current user is a member of any org participating in this conversation
  -- SECURITY DEFINER bypasses RLS, so we can query conversation_participants directly
  RETURN EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.org_members om ON om.org_id = cp.org_id
    WHERE cp.conversation_id = p_conversation_id
      AND om.user_id = auth.uid()
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.user_can_access_conversation(UUID) TO authenticated;

-- ============================================================================
-- 2. FIX conversations SELECT POLICY
-- ============================================================================

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

CREATE POLICY "Users can view their conversations"
ON public.conversations FOR SELECT TO authenticated
USING (public.user_can_access_conversation(conversations.id));

-- ============================================================================
-- 3. FIX conversation_participants SELECT POLICY
-- ============================================================================

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cp_select_if_member" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;

-- Allow SELECT if:
-- 1. User is a member of the participant's org (can see their own org's participation), OR
-- 2. User can access the conversation (via helper function - breaks recursion)
CREATE POLICY "cp_select_if_member"
ON public.conversation_participants FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND om.org_id = conversation_participants.org_id
  )
  OR public.user_can_access_conversation(conversation_participants.conversation_id)
);

