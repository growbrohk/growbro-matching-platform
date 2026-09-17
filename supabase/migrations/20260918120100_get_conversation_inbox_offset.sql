-- Enquiries Phase 2: true offset paging for conversation inbox (drop 2-arg overload to avoid ambiguity)

DROP FUNCTION IF EXISTS public.get_conversation_inbox(uuid, int);

CREATE OR REPLACE FUNCTION public.get_conversation_inbox(
  p_org_id uuid,
  p_limit int DEFAULT 30,
  p_offset int DEFAULT 0
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
  v_offset int;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RETURN;
  END IF;

  v_limit := GREATEST(COALESCE(p_limit, 30), 1);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  WITH my_conversations AS (
    SELECT cp.conversation_id, cp.last_read_at
    FROM conversation_participants cp
    WHERE cp.org_id = p_org_id
  ),
  other_participants AS (
    SELECT
      cp.conversation_id,
      cp.org_id AS other_org_id
    FROM conversation_participants cp
    INNER JOIN my_conversations mc ON mc.conversation_id = cp.conversation_id
    WHERE cp.org_id <> p_org_id
  ),
  last_messages AS (
    SELECT DISTINCT ON (cm.conversation_id)
      cm.conversation_id,
      cm.body AS last_message_body,
      cm.created_at AS last_message_at
    FROM conversation_messages cm
    INNER JOIN my_conversations mc ON mc.conversation_id = cm.conversation_id
    ORDER BY cm.conversation_id, cm.created_at DESC
  ),
  unread_counts AS (
    SELECT
      cp.conversation_id,
      COUNT(*)::int AS unread_count
    FROM conversation_participants cp
    INNER JOIN conversation_messages m ON m.conversation_id = cp.conversation_id
    WHERE cp.org_id = p_org_id
      AND m.sender_org_id <> p_org_id
      AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
    GROUP BY cp.conversation_id
  ),
  org_profiles AS (
    SELECT
      o.id AS org_id,
      o.name AS org_name,
      op.logo_url
    FROM orgs o
    LEFT JOIN org_profiles op ON op.org_id = o.id
  )
  SELECT
    mc.conversation_id,
    op.other_org_id,
    COALESCE(org_profiles.org_name, 'Unknown') AS other_org_name,
    org_profiles.logo_url AS other_org_logo_url,
    COALESCE(lm.last_message_body, '') AS last_message_body,
    COALESCE(lm.last_message_at, c.last_message_at, c.created_at) AS last_message_at,
    COALESCE(uc.unread_count, 0) AS unread_count
  FROM my_conversations mc
  INNER JOIN conversations c ON c.id = mc.conversation_id
  LEFT JOIN other_participants op ON op.conversation_id = mc.conversation_id
  LEFT JOIN org_profiles ON org_profiles.org_id = op.other_org_id
  LEFT JOIN last_messages lm ON lm.conversation_id = mc.conversation_id
  LEFT JOIN unread_counts uc ON uc.conversation_id = mc.conversation_id
  WHERE op.other_org_id IS NOT NULL
  ORDER BY COALESCE(lm.last_message_at, c.last_message_at, c.created_at) DESC NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_inbox(uuid, int, int) TO authenticated;

COMMENT ON FUNCTION public.get_conversation_inbox(uuid, int, int) IS
  'Inbox rows for Enquiries messages feed with limit and offset paging.';
