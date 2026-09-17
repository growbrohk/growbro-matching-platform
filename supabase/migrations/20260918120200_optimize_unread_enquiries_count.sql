-- Enquiries Phase 2: faster unread badge count (single join for messages)

CREATE OR REPLACE FUNCTION public.get_unread_enquiries_count(p_org_id uuid)
RETURNS int
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  unread_msg_count int;
  unread_booking_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RETURN 0;
  END IF;

  SELECT COUNT(DISTINCT cp.conversation_id)::int INTO unread_msg_count
  FROM public.conversation_participants cp
  INNER JOIN public.conversation_messages m ON m.conversation_id = cp.conversation_id
  WHERE cp.org_id = p_org_id
    AND m.sender_org_id <> p_org_id
    AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at);

  SELECT COUNT(*)::int INTO unread_booking_count
  FROM public.poster_space_booking_requests r
  INNER JOIN public.poster_spaces s ON s.id = r.poster_space_id
  WHERE s.org_id = p_org_id
    AND r.host_seen_at IS NULL;

  RETURN COALESCE(unread_msg_count, 0) + COALESCE(unread_booking_count, 0);
END;
$$;

COMMENT ON FUNCTION public.get_unread_enquiries_count(uuid) IS
  'Unread enquiries: distinct conversations with messages from other orgs after last_read_at, plus unseen booking requests.';
