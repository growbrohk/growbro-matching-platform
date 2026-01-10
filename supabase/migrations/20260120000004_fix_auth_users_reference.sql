-- Migration: Fix RLS policy referencing auth.users table
-- Problem: Policy "Users can view their own booking requests" queries auth.users
--          Client roles cannot read auth.users, causing 42501 permission denied errors
-- Solution: Replace auth.users query with auth.jwt() email claim

-- ============================================================================
-- FIX poster_space_booking_requests SELECT POLICY
-- ============================================================================

-- Drop the existing policy that references auth.users
DROP POLICY IF EXISTS "Users can view their own booking requests"
ON public.poster_space_booking_requests;

-- Recreate policy using auth.jwt() email claim instead of auth.users query
CREATE POLICY "Users can view their own booking requests"
ON public.poster_space_booking_requests
FOR SELECT
TO authenticated
USING (
  requester_user_id = auth.uid()
  OR (
    requester_email IS NOT NULL
    AND (auth.jwt() ->> 'email') IS NOT NULL
    AND requester_email = (auth.jwt() ->> 'email')
  )
);

-- ============================================================================
-- VERIFICATION NOTES
-- ============================================================================
-- After applying this migration:
-- 1. Enquiries page should load without 42501 errors
-- 2. Users can view their own booking requests by:
--    - requester_user_id matching their auth.uid(), OR
--    - requester_email matching their JWT email claim
-- 3. No other policies reference auth.users (verified)
-- 4. All other booking request policies remain unchanged

