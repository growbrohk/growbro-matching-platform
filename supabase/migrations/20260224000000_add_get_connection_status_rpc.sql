-- ============================================================================
-- Migration: Add get_connection_status RPC
-- Purpose: Fetch connection status between two orgs for UI state management
-- ============================================================================

CREATE OR REPLACE FUNCTION get_connection_status(
  p_my_org_id UUID,
  p_target_org_id UUID
)
RETURNS TABLE (
  connection_id UUID,
  status TEXT,
  requested_by_org_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_a_id UUID;
  v_org_b_id UUID;
BEGIN
  -- Validate inputs
  IF p_my_org_id = p_target_org_id THEN
    RAISE EXCEPTION 'Cannot check connection status with self';
  END IF;

  -- Verify caller is member of p_my_org_id
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_my_org_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is not a member of the specified org';
  END IF;

  -- Canonicalize pair: org_a_id = LEAST, org_b_id = GREATEST
  v_org_a_id := LEAST(p_my_org_id, p_target_org_id);
  v_org_b_id := GREATEST(p_my_org_id, p_target_org_id);

  -- Return connection status if exists
  RETURN QUERY
  SELECT 
    c.id AS connection_id,
    c.status,
    c.requested_by_org_id
  FROM connections c
  WHERE c.org_a_id = v_org_a_id 
  AND c.org_b_id = v_org_b_id;

  -- If no row found, return NULL (handled by RETURNS TABLE - returns empty result set)
END;
$$;

COMMENT ON FUNCTION get_connection_status IS 'Returns connection status between two orgs. Returns empty result set if no connection exists.';
