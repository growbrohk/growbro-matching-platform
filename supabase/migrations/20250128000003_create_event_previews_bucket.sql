-- Migration: Create storage bucket for event preview images
-- Note: Storage buckets are typically created via Supabase Dashboard or CLI
-- This SQL creates the bucket if it doesn't exist and sets up policies

-- Create the bucket (if using Supabase CLI, this is done via: supabase storage create event-previews)
-- For SQL-based setup, insert into storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-previews',
  'event-previews',
  true,
  524288, -- 500KB in bytes (500 * 1024)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: Allow authenticated users to upload files for their org's events
-- Users can upload to their org's folder
CREATE POLICY "Users can upload preview images for their org's events"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'event-previews' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM orgs
    WHERE EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = orgs.id
      AND org_members.user_id = auth.uid()
    )
  )
);

-- Users can view preview images (public bucket)
CREATE POLICY "Anyone can view preview images"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-previews');

-- Users can update/delete preview images for their org's events
CREATE POLICY "Users can update preview images for their org's events"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'event-previews' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM orgs
    WHERE EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = orgs.id
      AND org_members.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete preview images for their org's events"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'event-previews' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM orgs
    WHERE EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = orgs.id
      AND org_members.user_id = auth.uid()
    )
  )
);

