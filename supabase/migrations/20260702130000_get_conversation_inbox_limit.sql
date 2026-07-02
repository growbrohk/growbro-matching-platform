-- Add optional row limit to conversation inbox RPC (Enquiries feed cap)
DROP FUNCTION IF EXISTS public.get_conversation_inbox(uuid);

CREATE OR REPLACE FUNCTION public.get_conversation_inbox(
  p_org_id uuid,
  p_limit int DEFAULT 100
)
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
  v_limit int;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
    AND user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  v_limit := GREATEST(COALESCE(p_limit, 100), 1);

  RETURN QUERY
  WITH my_conversations AS (
    SELECT cp.conversation_id, cp.last_read_at
    FROM conversation_participants cp
    WHERE cp.org_id = p_org_id
  ),
  other_participants AS (
    SELECT
      cp.conversation_id,
      cp.org_id as other_org_id
    FROM conversation_participants cp
    INNER JOIN my_conversations mc ON mc.conversation_id = cp.conversation_id
    WHERE cp.org_id <> p_org_id
  ),
  last_messages AS (
    SELECT DISTINCT ON (cm.conversation_id)
      cm.conversation_id,
      cm.body as last_message_body,
      cm.created_at as last_message_at
    FROM conversation_messages cm
    INNER JOIN my_conversations mc ON mc.conversation_id = cm.conversation_id
    ORDER BY cm.conversation_id, cm.created_at DESC
  ),
  unread_counts AS (
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
  ORDER BY COALESCE(lm.last_message_at, c.last_message_at, c.created_at) DESC NULLS LAST
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_inbox(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.get_conversation_inbox(uuid, int) IS 'Returns inbox rows for conversations with unread counts, sorted by last message time. Optional p_limit caps rows for Enquiries feed.';
