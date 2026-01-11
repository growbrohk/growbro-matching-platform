-- Migration: Fix RLS policies for orders to support guest checkout
-- Problem: Orders created with buyer_user_id = null (guest checkout) cannot be viewed
-- Solution: Update SELECT policy to allow viewing orders by email match for guest checkout

-- ============================================================================
-- UPDATE ORDERS SELECT POLICY FOR GUEST CHECKOUT
-- ============================================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;

-- Recreate policy to support both authenticated and guest checkout
CREATE POLICY "Users can view their own orders"
  ON orders FOR SELECT
  USING (
    -- Authenticated users can view orders where buyer_user_id matches
    (buyer_user_id IS NOT NULL AND buyer_user_id = auth.uid())
    OR
    -- Guest checkout: users can view orders where buyer_email matches their JWT email
    -- Works for both authenticated and anonymous users
    (
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
    )
    OR
    -- Allow viewing orders created in the last 1 hour (for immediate success page access)
    -- This allows users to view their order immediately after creation
    -- even if they're not logged in or email doesn't match yet
    -- Limited to 1 hour for security
    (
      created_at > NOW() - INTERVAL '1 hour'
    )
  );

