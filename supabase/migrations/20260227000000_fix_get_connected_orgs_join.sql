-- ============================================================================
-- Migration: Fix get_connected_orgs JOIN condition
-- Purpose: Fix bug where JOIN condition incorrectly uses CASE statement,
--          causing empty results even when connections exist
-- ============================================================================

CREATE OR REPLACE FUNCTION get_connected_orgs(
  p_org_id UUID
)
RETURNS TABLE (
  other_org_id UUID,
  other_org_name TEXT,
  other_org_handle TEXT,
  other_org_avatar_url TEXT,
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
  -- FIX: Changed JOIN condition from CASE returning boolean to CASE returning UUID value
  RETURN QUERY
  SELECT 
    CASE 
      WHEN c.org_a_id = p_org_id THEN c.org_b_id
      ELSE c.org_a_id
    END AS other_org_id,
    o.name AS other_org_name,
    COALESCE(o.slug, o.id::TEXT) AS other_org_handle,
    op.logo_url AS other_org_avatar_url,
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

COMMENT ON FUNCTION get_connected_orgs IS 'Returns list of connected orgs with details (name, handle, avatar, category). Requires caller to be member of the org. Ordered by accepted_at DESC. Fixed JOIN condition bug.';
