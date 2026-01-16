-- ============================================================================
-- Migration: Update RPC functions to use canonical columns (org_low_id, org_high_id)
-- Purpose: Refactor all connection queries to use org_low_id/org_high_id
--          instead of org_a_id/org_b_id for simpler, less bug-prone queries
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. UPDATE request_connection FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION request_connection(
  p_requester_org_id UUID,
  p_target_org_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_low_id UUID;
  v_org_high_id UUID;
  v_org_a_id UUID;
  v_org_b_id UUID;
  v_connection_id UUID;
  v_existing_status TEXT;
BEGIN
  -- Validate inputs
  IF p_requester_org_id = p_target_org_id THEN
    RAISE EXCEPTION 'Cannot connect org to itself';
  END IF;

  -- Canonicalize pair: org_low_id = LEAST, org_high_id = GREATEST
  v_org_low_id := LEAST(p_requester_org_id, p_target_org_id);
  v_org_high_id := GREATEST(p_requester_org_id, p_target_org_id);
  
  -- Also compute org_a_id/org_b_id for backward compatibility
  v_org_a_id := v_org_low_id;
  v_org_b_id := v_org_high_id;

  -- Check if connection already exists using canonical columns
  SELECT id, status INTO v_connection_id, v_existing_status
  FROM connections
  WHERE org_low_id = v_org_low_id AND org_high_id = v_org_high_id;

  IF v_connection_id IS NOT NULL THEN
    -- Connection exists
    IF v_existing_status = 'accepted' THEN
      RAISE EXCEPTION 'Already connected';
    ELSIF v_existing_status = 'pending' THEN
      RAISE EXCEPTION 'Connection request already pending';
    ELSIF v_existing_status = 'rejected' THEN
      -- Allow re-request: update status back to pending
      UPDATE connections
      SET 
        status = 'pending',
        requested_by_org_id = p_requester_org_id,
        created_at = NOW(),
        rejected_at = NULL
      WHERE id = v_connection_id;
      RETURN v_connection_id;
    ELSIF v_existing_status = 'blocked' THEN
      RAISE EXCEPTION 'Connection is blocked';
    END IF;
  END IF;

  -- Create new connection request
  INSERT INTO connections (
    org_a_id,
    org_b_id,
    org_low_id,
    org_high_id,
    status,
    requested_by_org_id
  ) VALUES (
    v_org_a_id,
    v_org_b_id,
    v_org_low_id,
    v_org_high_id,
    'pending',
    p_requester_org_id
  )
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$;

-- ============================================================================
-- 2. UPDATE get_connection_status FUNCTION
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
  v_org_low_id UUID;
  v_org_high_id UUID;
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

  -- Canonicalize pair: org_low_id = LEAST, org_high_id = GREATEST
  v_org_low_id := LEAST(p_my_org_id, p_target_org_id);
  v_org_high_id := GREATEST(p_my_org_id, p_target_org_id);

  -- Return connection status if exists using canonical columns
  RETURN QUERY
  SELECT 
    c.id AS connection_id,
    c.status,
    c.requested_by_org_id
  FROM connections c
  WHERE c.org_low_id = v_org_low_id 
  AND c.org_high_id = v_org_high_id;

  -- If no row found, return NULL (handled by RETURNS TABLE - returns empty result set)
END;
$$;

-- ============================================================================
-- 3. UPDATE get_connected_count FUNCTION
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

  -- Count accepted connections where p_org_id is either org_low_id or org_high_id
  SELECT COUNT(*) INTO v_count
  FROM connections
  WHERE status = 'accepted'
  AND (org_low_id = p_org_id OR org_high_id = p_org_id);

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ============================================================================
-- 4. UPDATE get_connected_count_public FUNCTION
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
  -- Count accepted connections where p_org_id is either org_low_id or org_high_id
  SELECT COUNT(*) INTO v_count
  FROM connections
  WHERE status = 'accepted'
  AND (org_low_id = p_org_id OR org_high_id = p_org_id);

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ============================================================================
-- 5. UPDATE get_connected_orgs FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_connected_orgs(
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

  -- Return connected orgs with details using canonical columns
  RETURN QUERY
  SELECT 
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END AS org_id,
    o.name AS name,
    COALESCE(o.slug, o.id::TEXT) AS handle,
    op.logo_url AS avatar_url,
    COALESCE(op.category, o.type, 'Other') AS category,
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
-- 6. UPDATE get_connected_orgs_public FUNCTION
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
  -- Return connected orgs with details using canonical columns
  RETURN QUERY
  SELECT 
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END AS org_id,
    o.name AS name,
    COALESCE(o.slug, o.id::TEXT) AS handle,
    op.logo_url AS avatar_url,
    COALESCE(op.category, o.type, 'Other') AS category,
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
-- 7. UPDATE get_pending_incoming_connections FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_incoming_connections(
  p_org_id UUID
)
RETURNS TABLE (
  connection_id UUID,
  other_org_id UUID,
  other_org_name TEXT,
  other_org_slug TEXT,
  other_org_logo_url TEXT,
  requested_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS connection_id,
    CASE 
      WHEN c.org_low_id = p_org_id THEN c.org_high_id
      ELSE c.org_low_id
    END AS other_org_id,
    o.name AS other_org_name,
    o.slug AS other_org_slug,
    op.logo_url AS other_org_logo_url,
    c.created_at AS requested_at
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
  WHERE c.status = 'pending'
  AND (c.org_low_id = p_org_id OR c.org_high_id = p_org_id)
  AND c.requested_by_org_id <> p_org_id
  ORDER BY c.created_at DESC;
END;
$$;

-- ============================================================================
-- 8. UPDATE respond_to_connection FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION respond_to_connection(
  p_connection_id UUID,
  p_action TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection RECORD;
  v_user_org_id UUID;
BEGIN
  -- Validate action
  IF p_action NOT IN ('accept', 'reject', 'block') THEN
    RAISE EXCEPTION 'Invalid action. Must be accept, reject, or block';
  END IF;

  -- Get connection and verify user is member of one of the orgs
  SELECT c.* INTO v_connection
  FROM connections c
  WHERE c.id = p_connection_id
  AND EXISTS (
    SELECT 1 FROM org_members
    WHERE org_members.org_id IN (c.org_low_id, c.org_high_id)
    AND org_members.user_id = auth.uid()
  );

  IF v_connection IS NULL THEN
    RAISE EXCEPTION 'Connection not found or access denied';
  END IF;

  -- Get user's org_id from the pair
  SELECT org_id INTO v_user_org_id
  FROM org_members
  WHERE org_id IN (v_connection.org_low_id, v_connection.org_high_id)
  AND user_id = auth.uid()
  LIMIT 1;

  IF v_user_org_id IS NULL THEN
    RAISE EXCEPTION 'User is not a member of either org in this connection';
  END IF;

  -- Handle different actions
  IF p_action = 'accept' THEN
    -- Only non-requester can accept
    IF v_user_org_id = v_connection.requested_by_org_id THEN
      RAISE EXCEPTION 'Cannot accept your own connection request';
    END IF;
    
    IF v_connection.status <> 'pending' THEN
      RAISE EXCEPTION 'Connection is not pending';
    END IF;

    UPDATE connections
    SET 
      status = 'accepted',
      accepted_at = NOW()
    WHERE id = p_connection_id;

  ELSIF p_action = 'reject' THEN
    -- Only non-requester can reject
    IF v_user_org_id = v_connection.requested_by_org_id THEN
      RAISE EXCEPTION 'Cannot reject your own connection request';
    END IF;
    
    IF v_connection.status <> 'pending' THEN
      RAISE EXCEPTION 'Connection is not pending';
    END IF;

    UPDATE connections
    SET 
      status = 'rejected',
      rejected_at = NOW()
    WHERE id = p_connection_id;

  ELSIF p_action = 'block' THEN
    -- Either side can block
    UPDATE connections
    SET 
      status = 'blocked',
      blocked_at = NOW(),
      blocked_by_org_id = v_user_org_id
    WHERE id = p_connection_id;

  END IF;
END;
$$;

COMMIT;
