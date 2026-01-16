-- ============================================================================
-- Migration: Add public get_connected_count RPC (no membership required)
-- Purpose: Allow public profiles to display connection count
-- ============================================================================

CREATE OR REPLACE FUNCTION get_connected_count_public(
  p_org_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- No membership check - public access
  -- Count accepted connections where p_org_id is either org_a_id or org_b_id
  SELECT COUNT(*) INTO v_count
  FROM connections
  WHERE status = 'accepted'
  AND (org_a_id = p_org_id OR org_b_id = p_org_id);

  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON FUNCTION get_connected_count_public IS 'Returns count of accepted connections for an org. Public access - no membership required.';
