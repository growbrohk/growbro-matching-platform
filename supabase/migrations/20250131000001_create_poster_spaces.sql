-- =====================================================
-- Poster Spaces System Migration
-- =====================================================
-- Creates tables for poster space inventory and booking requests
-- This is a specialized flow for Type='Space' booking resources

-- =====================================================
-- 1. CREATE TABLES
-- =====================================================

-- Poster Spaces table
CREATE TABLE IF NOT EXISTS poster_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'poster' CHECK (category IN ('poster', 'shelf', 'booth', 'counter', 'other')),
  short_description text,
  bullets text[] DEFAULT '{}'::text[],
  photos text[] DEFAULT '{}'::text[], -- storage paths or public URLs
  booking_unit text NOT NULL DEFAULT 'week' CHECK (booking_unit IN ('week', 'day', 'month')),
  allowed_durations int[] DEFAULT '{1,2,4}'::int[],
  price_cents int NULL, -- null => Inquiry
  currency text NOT NULL DEFAULT 'HKD',
  approval_flow text NOT NULL DEFAULT 'request_approve' CHECK (approval_flow = 'request_approve'),
  blackout_ranges jsonb DEFAULT '[]'::jsonb, -- [{start:'YYYY-MM-DD', end:'YYYY-MM-DD'}]
  tracking_enabled boolean NOT NULL DEFAULT true,
  tracking_prefix text NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Poster Space Booking Requests table
CREATE TABLE IF NOT EXISTS poster_space_booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_space_id uuid NOT NULL REFERENCES poster_spaces(id) ON DELETE CASCADE,
  requester_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_name text NULL,
  requester_email text NULL,
  message text NULL,
  requested_start_date date NOT NULL,
  duration_units int NOT NULL,
  computed_end_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_poster_spaces_org_id ON poster_spaces(org_id);
CREATE INDEX IF NOT EXISTS idx_poster_spaces_status ON poster_spaces(status) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_poster_spaces_org_status ON poster_spaces(org_id, status);

CREATE INDEX IF NOT EXISTS idx_poster_space_booking_requests_space_id ON poster_space_booking_requests(poster_space_id);
CREATE INDEX IF NOT EXISTS idx_poster_space_booking_requests_status ON poster_space_booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_poster_space_booking_requests_requester ON poster_space_booking_requests(requester_user_id) WHERE requester_user_id IS NOT NULL;

-- =====================================================
-- 3. CREATE TRIGGERS
-- =====================================================

-- Trigger for updated_at on poster_spaces
CREATE TRIGGER update_poster_spaces_updated_at
  BEFORE UPDATE ON poster_spaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE poster_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE poster_space_booking_requests ENABLE ROW LEVEL SECURITY;

-- Poster Spaces Policies
-- Public can view published spaces
CREATE POLICY "Public can view published poster spaces"
  ON poster_spaces FOR SELECT
  USING (status = 'published');

-- Org members can view all spaces from their orgs
CREATE POLICY "Org members can view their org's poster spaces"
  ON poster_spaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = poster_spaces.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- Org members can insert spaces for their orgs
CREATE POLICY "Org members can create poster spaces"
  ON poster_spaces FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = poster_spaces.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- Org members can update spaces for their orgs
CREATE POLICY "Org members can update their org's poster spaces"
  ON poster_spaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = poster_spaces.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- Org members can delete spaces for their orgs
CREATE POLICY "Org members can delete their org's poster spaces"
  ON poster_spaces FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = poster_spaces.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- Booking Requests Policies
-- Allow INSERT for authenticated and anonymous users
CREATE POLICY "Anyone can create booking requests"
  ON poster_space_booking_requests FOR INSERT
  WITH CHECK (true);

-- Org members can view requests for spaces they own
CREATE POLICY "Org members can view booking requests for their spaces"
  ON poster_space_booking_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM poster_spaces ps
      JOIN org_members om ON om.org_id = ps.org_id
      WHERE ps.id = poster_space_booking_requests.poster_space_id
      AND om.user_id = auth.uid()
    )
  );

-- Users can view their own requests
CREATE POLICY "Users can view their own booking requests"
  ON poster_space_booking_requests FOR SELECT
  USING (
    requester_user_id = auth.uid()
    OR (requester_email IS NOT NULL AND requester_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  );

-- Org members can update requests for spaces they own
CREATE POLICY "Org members can update booking requests for their spaces"
  ON poster_space_booking_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM poster_spaces ps
      JOIN org_members om ON om.org_id = ps.org_id
      WHERE ps.id = poster_space_booking_requests.poster_space_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 5. COMMENTS
-- =====================================================

COMMENT ON TABLE poster_spaces IS 'Poster space inventory for Type=Space booking resources';
COMMENT ON COLUMN poster_spaces.photos IS 'Array of storage paths or public URLs for space photos';
COMMENT ON COLUMN poster_spaces.blackout_ranges IS 'JSONB array of date ranges when space is unavailable: [{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}]';
COMMENT ON COLUMN poster_spaces.price_cents IS 'Price in cents. NULL means pricing by inquiry only';
COMMENT ON TABLE poster_space_booking_requests IS 'Booking requests for poster spaces';
COMMENT ON COLUMN poster_space_booking_requests.computed_end_date IS 'End date computed based on booking_unit and duration_units';

