-- Migration: Add payment fields to orders table
-- This enables payment method selection and receipt upload for manual payments

-- ============================================================================
-- 1. ADD PAYMENT FIELDS TO ORDERS TABLE
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('stripe', 'payme', 'fps')),
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'submitted', 'paid', 'failed', 'refunded')),
ADD COLUMN IF NOT EXISTS receipt_url TEXT,
ADD COLUMN IF NOT EXISTS payment_reference_link TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- ============================================================================
-- 2. ADD PAYMENT CONFIG FIELDS TO EVENTS TABLE
-- ============================================================================

ALTER TABLE events
ADD COLUMN IF NOT EXISTS enable_stripe BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_payme BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_fps BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payme_link TEXT,
ADD COLUMN IF NOT EXISTS fps_link TEXT;

-- ============================================================================
-- 3. CREATE STORAGE BUCKET FOR PAYMENT RECEIPTS
-- ============================================================================

-- Create the bucket (if using Supabase CLI, this is done via: supabase storage create payment-receipts)
-- For SQL-based setup, insert into storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  false, -- Private bucket, only accessible via signed URLs
  10485760, -- 10MB in bytes (10 * 1024 * 1024)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: Allow authenticated users to upload receipt files
DROP POLICY IF EXISTS "Users can upload payment receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own payment receipts" ON storage.objects;

CREATE POLICY "Users can upload payment receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-receipts' AND
  auth.role() = 'authenticated'
);

CREATE POLICY "Users can view their own payment receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts' AND
  auth.role() = 'authenticated'
);

