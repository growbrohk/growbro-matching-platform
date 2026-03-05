-- Migration: Minimal storage policy for payment receipt upload
--
-- Fix: Users (including anonymous/incognito) cannot upload receipt photos in PayMe/FPS flow
-- because the previous policy required auth.role() = 'authenticated' or JWT email matching.
--
-- Solution: Minimal INSERT policy - allow anyone to upload to payment-receipts bucket.
-- Security: RPC submit_payment_receipt still validates order state; host verifies receipts.
-- Bucket limits (10MB, allowed MIME types) mitigate storage abuse.
--
-- ⚠️ IMPORTANT: Storage policies require superuser/service_role permissions.
-- Run via Supabase Dashboard SQL Editor if migration fails:
--   https://supabase.com/dashboard/project/[YOUR_PROJECT]/sql/new
--
-- Note: If applied manually via Storage UI, the policy may have a different name
-- (e.g. anyone_can_upload_receipts_*). The migration DROPs "Users can upload payment receipts".

-- ============================================================================
-- REPLACE INSERT POLICY WITH MINIMAL VERSION
-- ============================================================================

DROP POLICY IF EXISTS "Users can upload payment receipts" ON storage.objects;

CREATE POLICY "Users can upload payment receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-receipts');

COMMENT ON POLICY "Users can upload payment receipts" ON storage.objects IS
  'Allows anyone (including anonymous users) to upload payment receipts. RPC validates order state; host verifies receipts.';
