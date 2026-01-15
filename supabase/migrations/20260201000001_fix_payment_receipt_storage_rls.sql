-- Migration: Fix storage RLS policies for payment receipt upload
-- 
-- ⚠️ IMPORTANT: This file CANNOT be run via normal migrations due to permissions.
-- Storage policies require superuser/service_role permissions.
--
-- ✅ RECOMMENDED: Run this SQL via Supabase Dashboard SQL Editor
--   1. Go to: https://supabase.com/dashboard/project/[YOUR_PROJECT]/sql/new
--   2. Copy and paste the entire contents of this file
--   3. Click "Run" (Dashboard SQL Editor runs with service_role automatically)
--
-- ❌ DO NOT run via: supabase migration up (will fail with permission error)
-- ❌ DO NOT run via: supabase db execute (unless you have superuser access)

-- ============================================================================
-- FIX STORAGE POLICY FOR PAYMENT RECEIPTS
-- ============================================================================

-- Drop existing storage policies
DROP POLICY IF EXISTS "Users can upload payment receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own payment receipts" ON storage.objects;

-- Create INSERT policy: Allow authenticated users and anonymous users (matching order email) to upload receipts
-- Path format: {order_id}/{timestamp}.{ext}
-- We check that the order belongs to the user OR was created in the last hour
CREATE POLICY "Users can upload payment receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-receipts' AND
  (
    -- Authenticated users: check if order belongs to them
    (
      auth.role() = 'authenticated' AND
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id::text = split_part(name, '/', 1)
        AND (
          o.buyer_user_id = auth.uid()
          OR
          (
            o.buyer_user_id IS NULL
            AND o.buyer_email IS NOT NULL
            AND (auth.jwt() ->> 'email') IS NOT NULL
            AND o.buyer_email = (auth.jwt() ->> 'email')
          )
          OR
          o.created_at > NOW() - INTERVAL '1 hour'
        )
      )
    )
    OR
    -- Anonymous users: allow if order email matches JWT email AND order was created in last hour
    (
      auth.role() = 'anon' AND
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id::text = split_part(name, '/', 1)
        AND o.buyer_user_id IS NULL
        AND o.buyer_email IS NOT NULL
        AND (auth.jwt() ->> 'email') IS NOT NULL
        AND o.buyer_email = (auth.jwt() ->> 'email')
        AND o.created_at > NOW() - INTERVAL '1 hour'
      )
    )
  )
);

-- Create SELECT policy: Allow users to view their own receipts
-- Also allow hosts (org members) to view receipts for orders in their events
CREATE POLICY "Users can view their own payment receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts' AND
  (
    -- Authenticated users can view receipts for their own orders
    (
      auth.role() = 'authenticated' AND
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id::text = split_part(name, '/', 1)
        AND (
          o.buyer_user_id = auth.uid()
          OR
          (
            o.buyer_user_id IS NULL
            AND o.buyer_email IS NOT NULL
            AND (auth.jwt() ->> 'email') IS NOT NULL
            AND o.buyer_email = (auth.jwt() ->> 'email')
          )
          OR
          o.created_at > NOW() - INTERVAL '1 hour'
        )
      )
    )
    OR
    -- Anonymous users can view receipts for their own orders (matching email, within 1 hour)
    (
      auth.role() = 'anon' AND
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id::text = split_part(name, '/', 1)
        AND o.buyer_user_id IS NULL
        AND o.buyer_email IS NOT NULL
        AND (auth.jwt() ->> 'email') IS NOT NULL
        AND o.buyer_email = (auth.jwt() ->> 'email')
        AND o.created_at > NOW() - INTERVAL '1 hour'
      )
    )
    OR
    -- Hosts (org members) can view receipts for orders in their events
    (
      auth.role() = 'authenticated' AND
      EXISTS (
        SELECT 1 FROM orders o
        JOIN events e ON e.id = o.event_id
        JOIN org_members om ON om.org_id = e.org_id
        WHERE o.id::text = split_part(name, '/', 1)
        AND om.user_id = auth.uid()
      )
    )
  )
);

COMMENT ON POLICY "Users can upload payment receipts" ON storage.objects IS 
  'Allows authenticated users and anonymous users (matching order email) to upload payment receipts to orders they own.';

COMMENT ON POLICY "Users can view their own payment receipts" ON storage.objects IS 
  'Allows users to view their own payment receipts and hosts to view receipts for orders in their events.';

