-- ============================================================================
-- Migration: Fix get_connected_orgs and get_connected_orgs_public RPCs
-- Purpose: Remove reference to non-existent orgs.type column
--          Use COALESCE(op.category, 'Other') instead of COALESCE(op.category, o.type, 'Other')
--          Ensure no ambiguous column references in ORDER BY/WHERE clauses
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FIX get_connected_orgs_public FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_connected_orgs_public(p_org_id uuid)
RETURNS TABLE (
  org_id uuid,
  name text,
  handle text,
  avatar_url text,
  category text,
  accepted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No membership check - public access
  -- Return connected orgs with details using canonical columns org_low_id/org_high_id
  RETURN QUERY
  SELECT 
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END AS org_id,
    o.name AS name,
    COALESCE(o.slug, o.id::text) AS handle,
    op.logo_url AS avatar_url,
    COALESCE(op.category, 'Other') AS category,
    c.accepted_at
  FROM connections c
  INNER JOIN orgs o ON o.id = (
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END
  )
  LEFT JOIN org_profiles op ON op.org_id = (
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END
  )
  WHERE c.status = 'accepted'
  AND (c.org_low_id = p_org_id OR c.org_high_id = p_org_id)
  ORDER BY c.accepted_at DESC;
END;
$$;

-- ============================================================================
-- 2. FIX get_connected_orgs FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_connected_orgs(p_org_id uuid)
RETURNS TABLE (
  org_id uuid,
  name text,
  handle text,
  avatar_url text,
  category text,
  accepted_at timestamptz
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

  -- Return connected orgs with details using canonical columns org_low_id/org_high_id
  RETURN QUERY
  SELECT 
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END AS org_id,
    o.name AS name,
    COALESCE(o.slug, o.id::text) AS handle,
    op.logo_url AS avatar_url,
    COALESCE(op.category, 'Other') AS category,
    c.accepted_at
  FROM connections c
  INNER JOIN orgs o ON o.id = (
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END
  )
  LEFT JOIN org_profiles op ON op.org_id = (
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END
  )
  WHERE c.status = 'accepted'
  AND (c.org_low_id = p_org_id OR c.org_high_id = p_org_id)
  ORDER BY c.accepted_at DESC;
END;
$$;

-- ============================================================================
-- 3. GRANT EXECUTE PERMISSIONS
-- ============================================================================

-- Grant execute on public function to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_connected_orgs_public(uuid) TO anon, authenticated;

-- Grant execute on member-only function to authenticated
GRANT EXECUTE ON FUNCTION public.get_connected_orgs(uuid) TO authenticated;

COMMIT;

-- IMPORTANT:
-- orgs table does NOT have a `type` column.
-- Do NOT reference o.type here or the RPC will fail silently in prod.
