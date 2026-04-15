-- Set org slug at creation time (public profile / Preview button) and backfill any NULLs.
-- Relies on generate_org_slug from 20251226001000_add_org_slug_and_public_policies.sql

CREATE OR REPLACE FUNCTION create_org(p_name TEXT)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  INSERT INTO orgs (name, slug)
  VALUES (p_name, generate_org_slug(p_name))
  RETURNING id INTO v_org_id;

  INSERT INTO org_members (org_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  INSERT INTO warehouses (org_id, name)
  VALUES (v_org_id, 'Main Warehouse');

  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION create_org IS 'Creates an org with URL slug, adds creator as owner, and creates default warehouse.';

-- Orgs created before this migration may still have slug IS NULL
UPDATE orgs
SET slug = generate_org_slug(name)
WHERE slug IS NULL;
