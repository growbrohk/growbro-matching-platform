-- =====================================================
-- Unread Enquiries Badge Feature
-- =====================================================
-- Adds support for tracking unread enquiries (messages + booking requests)
-- and displaying a badge count on the Enquiries tab

-- =====================================================
-- 1. ADD host_seen_at COLUMN TO poster_space_booking_requests
-- =====================================================

ALTER TABLE public.poster_space_booking_requests
ADD COLUMN IF NOT EXISTS host_seen_at timestamptz;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_poster_space_booking_requests_host_seen_at 
ON poster_space_booking_requests(poster_space_id, host_seen_at) 
WHERE host_seen_at IS NULL;

-- =====================================================
-- 2. CREATE RPC FUNCTION: get_unread_enquiries_count
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

  -- Count unread messages
  SELECT COUNT(*) INTO unread_msg_count
  FROM conversation_participants cp
  JOIN conversations c ON c.id = cp.conversation_id
  WHERE cp.org_id = p_org_id
    AND c.last_message_at IS NOT NULL
    AND (cp.last_read_at IS NULL OR c.last_message_at > cp.last_read_at);

  -- Count unread booking requests
  SELECT COUNT(*) INTO unread_booking_count
  FROM poster_space_booking_requests r
  JOIN poster_spaces s ON s.id = r.poster_space_id
  WHERE s.org_id = p_org_id
    AND r.host_seen_at IS NULL;

  RETURN COALESCE(unread_msg_count, 0) + COALESCE(unread_booking_count, 0);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_unread_enquiries_count(uuid) TO authenticated;

-- =====================================================
-- 3. ADD UPDATE POLICIES
-- =====================================================

-- Policy: Org members can update conversation_participants.last_read_at for their own org
CREATE POLICY "Org members can update their own last_read_at"
  ON conversation_participants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = conversation_participants.org_id
      AND org_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = conversation_participants.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- Policy: Host org can update poster_space_booking_requests.host_seen_at
-- (This policy already exists for UPDATE, but we ensure it allows updating host_seen_at)
-- The existing UPDATE policy "Org members can update booking requests for their spaces"
-- already covers this, but we'll add a comment to clarify

COMMENT ON COLUMN poster_space_booking_requests.host_seen_at IS 'Timestamp when the host org first viewed this booking request. NULL means unread.';

-- =====================================================
-- 4. COMMENTS
-- =====================================================

COMMENT ON FUNCTION public.get_unread_enquiries_count(uuid) IS 'Returns total count of unread enquiries (messages + booking requests) for an org';

