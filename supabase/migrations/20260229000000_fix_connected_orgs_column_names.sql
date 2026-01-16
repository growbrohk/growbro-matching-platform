-- ============================================================================
-- Migration: Fix get_connected_orgs column names to match public version
-- Purpose: Fix bug where member RPC returns different column names than
--          what the frontend expects, causing empty list even with count > 0
-- ============================================================================

-- Drop the existing function first since we're changing the return type
DROP FUNCTION IF EXISTS get_connected_orgs(UUID);

-- Recreate with correct column names
CREATE FUNCTION get_connected_orgs(
  p_org_id UUID
)
RETURNS TABLE (
  org_id UUID,
  name TEXT,
  handle TEXT,
  avatar_url TEXT,
  category TEXT,
  accepted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is member of p_org_id
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is not a member of the specified org';
  END IF;

  -- Return connected orgs with details
  -- Fixed column names to match get_connected_orgs_public (org_id, name, handle, avatar_url)
  RETURN QUERY
  SELECT 
    CASE 
      WHEN c.org_a_id = p_org_id THEN c.org_b_id
      ELSE c.org_a_id
    END AS org_id,
    o.name AS name,
    COALESCE(o.slug, o.id::TEXT) AS handle,
    op.logo_url AS avatar_url,
    COALESCE(op.category, o.type, 'Other') AS category,
    c.accepted_at
  FROM connections c
  INNER JOIN orgs o ON o.id = (
    CASE 
      WHEN c.org_a_id = p_org_id THEN c.org_b_id
      ELSE c.org_a_id
    END
  )
  LEFT JOIN org_profiles op ON op.org_id = (
    CASE 
      WHEN c.org_a_id = p_org_id THEN c.org_b_id
      ELSE c.org_a_id
    END
  )
  WHERE c.status = 'accepted'
  AND p_org_id IN (c.org_a_id, c.org_b_id)
  ORDER BY c.accepted_at DESC;
END;
$$;

COMMENT ON FUNCTION get_connected_orgs IS 'Returns list of connected orgs with details (name, handle, avatar, category). Requires caller to be member of the org. Ordered by accepted_at DESC. Fixed column names to match public version.';
