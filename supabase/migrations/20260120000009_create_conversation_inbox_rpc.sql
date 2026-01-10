-- =====================================================
-- Create RPC Function: get_conversation_inbox
-- =====================================================
-- Returns inbox rows for conversations with unread counts
-- Used for WhatsApp-style message list in Enquiries page

CREATE OR REPLACE FUNCTION public.get_conversation_inbox(p_org_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  other_org_id uuid,
  other_org_name text,
  other_org_logo_url text,
  last_message_body text,
  last_message_at timestamptz,
  unread_count int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Verify user is member of the org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
    AND user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH my_conversations AS (
    -- Get all conversations for this org
    SELECT cp.conversation_id, cp.last_read_at
    FROM conversation_participants cp
    WHERE cp.org_id = p_org_id
  ),
  other_participants AS (
    -- Get the other org in each conversation
    SELECT 
      cp.conversation_id,
      cp.org_id as other_org_id
    FROM conversation_participants cp
    INNER JOIN my_conversations mc ON mc.conversation_id = cp.conversation_id
    WHERE cp.org_id <> p_org_id
  ),
  last_messages AS (
    -- Get the last message for each conversation
    SELECT DISTINCT ON (cm.conversation_id)
      cm.conversation_id,
      cm.body as last_message_body,
      cm.created_at as last_message_at
    FROM conversation_messages cm
    INNER JOIN my_conversations mc ON mc.conversation_id = cm.conversation_id
    ORDER BY cm.conversation_id, cm.created_at DESC
  ),
  unread_counts AS (
    -- Count unread messages per conversation
    SELECT 
      cp.conversation_id,
      COUNT(*)::int as unread_count
    FROM conversation_participants cp
    INNER JOIN conversation_messages m ON m.conversation_id = cp.conversation_id
    WHERE cp.org_id = p_org_id
      AND m.sender_org_id <> p_org_id
      AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
    GROUP BY cp.conversation_id
  ),
  org_profiles AS (
    -- Get org names and logos (org_id is PK in org_profiles, so one row per org)
    SELECT 
      o.id as org_id,
      o.name as org_name,
      op.logo_url
    FROM orgs o
    LEFT JOIN org_profiles op ON op.org_id = o.id
  )
  SELECT 
    mc.conversation_id,
    op.other_org_id,
    COALESCE(org_profiles.org_name, 'Unknown') as other_org_name,
    org_profiles.logo_url as other_org_logo_url,
    COALESCE(lm.last_message_body, '') as last_message_body,
    COALESCE(lm.last_message_at, c.last_message_at, c.created_at) as last_message_at,
    COALESCE(uc.unread_count, 0) as unread_count
  FROM my_conversations mc
  INNER JOIN conversations c ON c.id = mc.conversation_id
  LEFT JOIN other_participants op ON op.conversation_id = mc.conversation_id
  LEFT JOIN org_profiles ON org_profiles.org_id = op.other_org_id
  LEFT JOIN last_messages lm ON lm.conversation_id = mc.conversation_id
  LEFT JOIN unread_counts uc ON uc.conversation_id = mc.conversation_id
  WHERE op.other_org_id IS NOT NULL
  ORDER BY COALESCE(lm.last_message_at, c.last_message_at, c.created_at) DESC NULLS LAST;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_conversation_inbox(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_conversation_inbox(uuid) IS 'Returns inbox rows for conversations with unread counts, sorted by last message time. Used for WhatsApp-style message list.';

