-- Migration: Fix infinite recursion in RLS policies
-- Problem: conversation_messages <-> conversation_participants cycle causes recursion
-- Solution: Break cycle by ensuring policies never reference conversation_messages
--           All access decisions go through org_members + conversation_participants only

-- ============================================================================
-- 1. FIX conversation_messages SELECT POLICY
-- ============================================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view messages from their conversations"
ON public.conversation_messages;

-- Create safe policy that only references conversation_participants + org_members
CREATE POLICY "Users can view messages from their conversations"
ON public.conversation_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.org_members om
      ON om.org_id = cp.org_id
    WHERE cp.conversation_id = conversation_messages.conversation_id
      AND om.user_id = auth.uid()
  )
);

-- ============================================================================
-- 2. FIX conversation_messages INSERT POLICY
-- ============================================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users can insert messages as sender"
ON public.conversation_messages;

-- Create safe policy that only references org_members + conversation_participants
CREATE POLICY "Users can insert messages as sender"
ON public.conversation_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND om.org_id = sender_org_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_messages.conversation_id
      AND cp.org_id = sender_org_id
  )
);

-- ============================================================================
-- 3. FIX conversation_participants SELECT POLICY (CRITICAL)
-- ============================================================================

-- Drop ALL existing SELECT policies on conversation_participants
DROP POLICY IF EXISTS "Users can view participants of their conversations"
ON public.conversation_participants;

DROP POLICY IF EXISTS "cp_select_if_member"
ON public.conversation_participants;

-- Create safe policy that ONLY references org_members (NO conversation_messages)
-- Users can see participant rows where they're a member of that participant's org
CREATE POLICY "cp_select_if_member"
ON public.conversation_participants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND om.org_id = conversation_participants.org_id
  )
);

-- ============================================================================
-- 4. VERIFY org_members SELECT POLICY (should already be correct)
-- ============================================================================

-- Drop and recreate to ensure it's correct and doesn't reference conversation_messages
DROP POLICY IF EXISTS "org_members_select_own"
ON public.org_members;

CREATE POLICY "org_members_select_own"
ON public.org_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Note: The existing "Users can view members of their orgs" policy (line 65-73 in create_orgs.sql)
-- is fine as it only references org_members itself, not conversation_messages

