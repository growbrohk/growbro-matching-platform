-- ============================================================================
-- Migration: Add public get_connected_orgs RPC (no membership required)
-- Purpose: Allow public profiles to display connected orgs list
-- ============================================================================

CREATE OR REPLACE FUNCTION get_connected_orgs_public(
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
  -- No membership check - public access
  -- Return connected orgs with details
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

COMMENT ON FUNCTION get_connected_orgs_public IS 'Returns list of connected orgs with details (name, handle, avatar, category). Public access - no membership required. Ordered by accepted_at DESC.';
