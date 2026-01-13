-- =====================================================
-- Fix Unread Message Logic
-- =====================================================
-- Problem: Current logic uses conversations.last_message_at > last_read_at
--         This treats sender's own messages as unread
-- Solution: Count conversations where there exists a message from OTHER org
--           that was sent after last_read_at (or if last_read_at is null)

-- =====================================================
-- 1. UPDATE RPC FUNCTION: get_unread_enquiries_count
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_unread_enquiries_count(p_org_id uuid)
RETURNS int
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  unread_msg_count int;
  unread_booking_count int;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Verify user is member of the org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
    AND user_id = v_user_id
  ) THEN
    RETURN 0;
  END IF;

  -- Count unread message conversations
  -- A conversation is unread if there exists a message from another org
  -- that was sent after last_read_at (or if last_read_at is null)
  SELECT COUNT(DISTINCT cp.conversation_id) INTO unread_msg_count
  FROM conversation_participants cp
  WHERE cp.org_id = p_org_id
    AND EXISTS (
      SELECT 1
      FROM conversation_messages m
      WHERE m.conversation_id = cp.conversation_id
        AND m.sender_org_id <> p_org_id
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
    );

  -- Count unread booking requests (unchanged)
  SELECT COUNT(*) INTO unread_booking_count
  FROM poster_space_booking_requests r
  JOIN poster_spaces s ON s.id = r.poster_space_id
  WHERE s.org_id = p_org_id
    AND r.host_seen_at IS NULL;

  RETURN COALESCE(unread_msg_count, 0) + COALESCE(unread_booking_count, 0);
END;
$$;

-- =====================================================
-- 2. ADD INDEX FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv_sender_created
ON public.conversation_messages (conversation_id, sender_org_id, created_at DESC);

-- =====================================================
-- 3. COMMENTS
-- =====================================================

COMMENT ON FUNCTION public.get_unread_enquiries_count(uuid) IS 'Returns total count of unread enquiries. Unread messages = conversations with messages from OTHER orgs after last_read_at. Unread bookings = requests with host_seen_at IS NULL.';


