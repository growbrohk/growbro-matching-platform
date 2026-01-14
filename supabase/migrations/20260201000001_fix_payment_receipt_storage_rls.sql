-- Migration: Fix storage RLS policies for payment receipt upload
-- This file should be run with elevated permissions (superuser or service_role)
-- Run via: supabase db execute --file supabase/migrations/20260201000001_fix_payment_receipt_storage_rls.sql
-- Or via Supabase Dashboard SQL Editor with service_role key

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

