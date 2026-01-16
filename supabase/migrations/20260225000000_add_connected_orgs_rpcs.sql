-- ============================================================================
-- Migration: Add RPCs for connected orgs count and list
-- Purpose: Support Instagram-style Connected UX on Org Profile
-- ============================================================================

-- ============================================================================
-- 1. get_connected_count RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION get_connected_count(
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
  -- Verify caller is member of p_org_id
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is not a member of the specified org';
  END IF;

  -- Count accepted connections where p_org_id is either org_a_id or org_b_id
  SELECT COUNT(*) INTO v_count
  FROM connections
  WHERE status = 'accepted'
  AND (org_a_id = p_org_id OR org_b_id = p_org_id);

  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON FUNCTION get_connected_count IS 'Returns count of accepted connections for an org. Requires caller to be member of the org.';

-- ============================================================================
-- 2. get_connected_orgs RPC
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
  INNER JOIN orgs o ON (
    CASE 
      WHEN c.org_a_id = p_org_id THEN o.id = c.org_b_id
      ELSE o.id = c.org_a_id
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

COMMENT ON FUNCTION get_connected_orgs IS 'Returns list of connected orgs with details (name, handle, avatar, category). Requires caller to be member of the org. Ordered by accepted_at DESC.';
