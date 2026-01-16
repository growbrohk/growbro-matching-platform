-- ============================================================================
-- Migration: Create org-to-org connections table
-- Purpose: Enable Instagram-style connection requests between organizations
-- ============================================================================

-- ============================================================================
-- 1. CREATE TABLE
-- ============================================================================

CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_a_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  org_b_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  requested_by_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ NULL,
  rejected_at TIMESTAMPTZ NULL,
  blocked_at TIMESTAMPTZ NULL,
  blocked_by_org_id UUID NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- Ensure canonical ordering: org_a_id < org_b_id
  CONSTRAINT connections_org_order_check CHECK (org_a_id < org_b_id),
  
  -- Ensure orgs are different
  CONSTRAINT connections_different_orgs_check CHECK (org_a_id <> org_b_id),
  
  -- Ensure requested_by_org_id is one of the pair
  CONSTRAINT connections_requested_by_check CHECK (requested_by_org_id IN (org_a_id, org_b_id)),
  
  -- Ensure blocked_by_org_id is one of the pair (if set)
  CONSTRAINT connections_blocked_by_check CHECK (
    blocked_by_org_id IS NULL OR blocked_by_org_id IN (org_a_id, org_b_id)
  ),
  
  -- Unique pair constraint (canonical ordering ensures no duplicates)
  CONSTRAINT connections_unique_pair UNIQUE (org_a_id, org_b_id)
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

-- Index for querying by org_a_id and status
CREATE INDEX idx_connections_org_a_status ON connections(org_a_id, status);

-- Index for querying by org_b_id and status
CREATE INDEX idx_connections_org_b_status ON connections(org_b_id, status);

-- Index for querying pending connections by creation date
CREATE INDEX idx_connections_status_created_at ON connections(status, created_at DESC);

-- Index for requested_by lookups
CREATE INDEX idx_connections_requested_by ON connections(requested_by_org_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- SELECT: Allow if user is member of either org_a_id or org_b_id
CREATE POLICY "Users can view connections for their orgs"
  ON connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id IN (connections.org_a_id, connections.org_b_id)
      AND org_members.user_id = auth.uid()
    )
  );

-- INSERT: Allow if user is member of requested_by_org_id
-- Note: Actual canonicalization and validation happens in RPC function
CREATE POLICY "Users can create connection requests for their orgs"
  ON connections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = connections.requested_by_org_id
      AND org_members.user_id = auth.uid()
    )
    AND connections.status = 'pending'
  );

-- UPDATE: 
-- - Accept/reject: only the NON-requester side can update from pending -> accepted/rejected
-- - Block: either side can set status='blocked', but blocked_by_org_id must be one of user's orgs
CREATE POLICY "Users can update connections for their orgs"
  ON connections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id IN (connections.org_a_id, connections.org_b_id)
      AND org_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Prevent changes to immutable fields
    OLD.org_a_id = NEW.org_a_id
    AND OLD.org_b_id = NEW.org_b_id
    AND OLD.requested_by_org_id = NEW.requested_by_org_id
    -- Ensure blocked_by_org_id is set correctly if blocking
    AND (
      NEW.status <> 'blocked' 
      OR (
        NEW.blocked_by_org_id IN (NEW.org_a_id, NEW.org_b_id)
        AND EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.org_id = NEW.blocked_by_org_id
          AND org_members.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- 4. RPC FUNCTIONS
-- ============================================================================

-- Function A: request_connection
-- Canonicalizes pair, handles upsert logic, returns connection_id
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
  v_org_a_id UUID;
  v_org_b_id UUID;
  v_connection_id UUID;
  v_existing_status TEXT;
BEGIN
  -- Validate inputs
  IF p_requester_org_id = p_target_org_id THEN
    RAISE EXCEPTION 'Cannot connect org to itself';
  END IF;

  -- Canonicalize pair: org_a_id = LEAST, org_b_id = GREATEST
  v_org_a_id := LEAST(p_requester_org_id, p_target_org_id);
  v_org_b_id := GREATEST(p_requester_org_id, p_target_org_id);

  -- Check if connection already exists
  SELECT id, status INTO v_connection_id, v_existing_status
  FROM connections
  WHERE org_a_id = v_org_a_id AND org_b_id = v_org_b_id;

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
    status,
    requested_by_org_id
  ) VALUES (
    v_org_a_id,
    v_org_b_id,
    'pending',
    p_requester_org_id
  )
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$;

-- Function B: respond_to_connection
-- Handles accept/reject/block actions
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
    WHERE org_members.org_id IN (c.org_a_id, c.org_b_id)
    AND org_members.user_id = auth.uid()
  );

  IF v_connection IS NULL THEN
    RAISE EXCEPTION 'Connection not found or access denied';
  END IF;

  -- Get user's org_id from the pair
  SELECT org_id INTO v_user_org_id
  FROM org_members
  WHERE org_id IN (v_connection.org_a_id, v_connection.org_b_id)
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

-- Function C: get_pending_incoming_connections
-- Returns pending connections where p_org_id is the recipient (not requester)
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
      WHEN c.org_a_id = p_org_id THEN c.org_b_id
      ELSE c.org_a_id
    END AS other_org_id,
    o.name AS other_org_name,
    o.slug AS other_org_slug,
    op.logo_url AS other_org_logo_url,
    c.created_at AS requested_at
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
  WHERE c.status = 'pending'
  AND p_org_id IN (c.org_a_id, c.org_b_id)
  AND c.requested_by_org_id <> p_org_id
  ORDER BY c.created_at DESC;
END;
$$;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE connections IS 'Org-to-org connection requests and relationships. Uses canonical ordering (org_a_id < org_b_id) to prevent duplicates.';
COMMENT ON COLUMN connections.org_a_id IS 'Canonical pair: smaller UUID';
COMMENT ON COLUMN connections.org_b_id IS 'Canonical pair: larger UUID';
COMMENT ON COLUMN connections.status IS 'Connection status: pending, accepted, rejected, or blocked';
COMMENT ON COLUMN connections.requested_by_org_id IS 'Org that initiated the connection request (must be either org_a_id or org_b_id)';
COMMENT ON COLUMN connections.blocked_by_org_id IS 'Org that blocked the connection (if status=blocked)';
COMMENT ON FUNCTION request_connection IS 'Creates or updates a connection request with canonical ordering. Returns connection_id.';
COMMENT ON FUNCTION respond_to_connection IS 'Responds to a connection request (accept/reject/block). Enforces permissions.';
COMMENT ON FUNCTION get_pending_incoming_connections IS 'Returns pending incoming connection requests for an org with other org details.';
