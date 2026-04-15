-- PL/pgSQL: RETURNS TABLE (org_id ...) defines an output variable named org_id.
-- Unqualified "org_id" in the membership subquery was ambiguous vs org_members.org_id.

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
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is not a member of the specified org';
  END IF;

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
