-- =====================================================
-- Fix Poster Space Booking Requests FK Permission Issue
-- =====================================================
-- Problem: FK constraint requester_user_id -> auth.users blocks FK checks
-- because client roles cannot read auth.users table.
--
-- Solution:
-- 1) Drop FK constraint
-- 2) Add RLS insert policy for authenticated users (with check requester_user_id = auth.uid())
-- 3) Add BEFORE INSERT trigger to set requester_user_id = auth.uid() when null
-- 4) Update existing INSERT policy to ensure public booking only targets published spaces

-- =====================================================
-- 1. DROP FOREIGN KEY CONSTRAINT
-- =====================================================

-- Find and drop the FK constraint
ALTER TABLE poster_space_booking_requests
DROP CONSTRAINT IF EXISTS poster_space_booking_requests_requester_user_id_fkey;

-- =====================================================
-- 2. CREATE TRIGGER FUNCTION
-- =====================================================

-- Function to auto-set requester_user_id for authenticated users
CREATE OR REPLACE FUNCTION set_requester_user_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- If requester_user_id is NULL and user is authenticated, set it to auth.uid()
  IF NEW.requester_user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.requester_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. CREATE TRIGGER
-- =====================================================

-- Trigger to auto-set requester_user_id before insert
CREATE TRIGGER set_requester_user_id_trigger
  BEFORE INSERT ON poster_space_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_requester_user_id_on_insert();

-- =====================================================
-- 4. UPDATE RLS POLICIES
-- =====================================================

-- Drop the existing "Anyone can create booking requests" policy
DROP POLICY IF EXISTS "Anyone can create booking requests" ON poster_space_booking_requests;

-- Policy for authenticated users: must set requester_user_id = auth.uid()
-- Can create requests for published spaces OR spaces from their org
CREATE POLICY "Authenticated users can create booking requests"
  ON poster_space_booking_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Requester must be the authenticated user (or NULL, which trigger will set)
    (requester_user_id = auth.uid() OR requester_user_id IS NULL)
    -- Space must be published OR user must be member of the org
    AND (
      EXISTS (
        SELECT 1 FROM poster_spaces ps
        WHERE ps.id = poster_space_booking_requests.poster_space_id
        AND ps.status = 'published'
      )
      OR EXISTS (
        SELECT 1 FROM poster_spaces ps
        JOIN org_members om ON om.org_id = ps.org_id
        WHERE ps.id = poster_space_booking_requests.poster_space_id
        AND om.user_id = auth.uid()
      )
    )
  );

-- Policy for anonymous users: can create requests but only for published spaces
CREATE POLICY "Anonymous users can create booking requests for published spaces"
  ON poster_space_booking_requests FOR INSERT
  TO anon
  WITH CHECK (
    -- Ensure the poster space is published
    EXISTS (
      SELECT 1 FROM poster_spaces ps
      WHERE ps.id = poster_space_booking_requests.poster_space_id
      AND ps.status = 'published'
    )
    -- Anonymous users cannot set requester_user_id
    AND requester_user_id IS NULL
  );

-- =====================================================
-- 5. COMMENTS
-- =====================================================

COMMENT ON FUNCTION set_requester_user_id_on_insert() IS 'Automatically sets requester_user_id to auth.uid() for authenticated users when inserting booking requests';
COMMENT ON TRIGGER set_requester_user_id_trigger ON poster_space_booking_requests IS 'Auto-sets requester_user_id before insert for authenticated users';

