-- Migration: Create affiliate_requests table for tracking affiliate link requests
-- This table stores requests sent from host orgs to affiliate orgs
-- When affiliate org confirms/rejects, the tracking_link status is updated

-- ============================================================================
-- 1. CREATE affiliate_requests TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_link_id UUID NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  host_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  affiliate_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================
CREATE INDEX idx_affiliate_requests_tracking_link_id ON affiliate_requests(tracking_link_id);
CREATE INDEX idx_affiliate_requests_host_org_id ON affiliate_requests(host_org_id);
CREATE INDEX idx_affiliate_requests_affiliate_org_id ON affiliate_requests(affiliate_org_id);
CREATE INDEX idx_affiliate_requests_status ON affiliate_requests(status);
CREATE INDEX idx_affiliate_requests_status_pending ON affiliate_requests(status) WHERE status = 'pending';

-- ============================================================================
-- 3. ENABLE RLS
-- ============================================================================
ALTER TABLE affiliate_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

-- SELECT: Users can view requests where their org is host OR affiliate
CREATE POLICY "Users can view affiliate_requests for their orgs"
  ON affiliate_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = affiliate_requests.host_org_id
      AND om.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = affiliate_requests.affiliate_org_id
      AND om.user_id = auth.uid()
    )
  );

-- INSERT: Only members of host_org_id can create requests
CREATE POLICY "Users can create affiliate_requests for their host org"
  ON affiliate_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = affiliate_requests.host_org_id
      AND om.user_id = auth.uid()
    )
  );

-- UPDATE: Only members of affiliate_org_id can respond (accept/reject)
CREATE POLICY "Users can update affiliate_requests for their affiliate org"
  ON affiliate_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = affiliate_requests.affiliate_org_id
      AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = affiliate_requests.affiliate_org_id
      AND om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. CREATE TRIGGER TO UPDATE tracking_links.status ON ACCEPT/REJECT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_affiliate_request_response()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only process if status changed from pending
  IF OLD.status = 'pending' AND NEW.status != 'pending' THEN
    -- Update tracking_link status based on response
    IF NEW.status = 'accepted' THEN
      UPDATE tracking_links
      SET status = 'active'
      WHERE id = NEW.tracking_link_id;
    ELSIF NEW.status = 'rejected' THEN
      UPDATE tracking_links
      SET status = 'inactive'
      WHERE id = NEW.tracking_link_id;
    END IF;
    
    -- Set responded_at timestamp
    NEW.responded_at = now();
  END IF;
  
  -- Update updated_at
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER affiliate_request_response_trigger
  BEFORE UPDATE ON affiliate_requests
  FOR EACH ROW
  EXECUTE FUNCTION handle_affiliate_request_response();

-- ============================================================================
-- 6. CREATE TRIGGER TO AUTO-UPDATE updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_affiliate_requests_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER affiliate_requests_updated_at_trigger
  BEFORE UPDATE ON affiliate_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_affiliate_requests_updated_at();

COMMENT ON TABLE affiliate_requests IS 'Stores affiliate link requests sent from host orgs to affiliate orgs. When affiliate org accepts/rejects, the linked tracking_link status is updated.';
