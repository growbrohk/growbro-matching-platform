-- =====================================================
-- Storage Bucket for Poster Spaces Photos
-- =====================================================

-- Create the bucket (if using Supabase CLI, this is done via: supabase storage create poster-spaces)
-- For SQL-based setup, insert into storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'poster-spaces',
  'poster-spaces',
  true,
  5242880, -- 5MB in bytes (5 * 1024 * 1024)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: Allow authenticated users to upload files for their org's spaces
-- Users can upload to their org's folder: {org_id}/{space_id}/{filename}
CREATE POLICY "Users can upload photos for their org's poster spaces"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'poster-spaces' AND
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

-- Anyone can view poster space photos (public bucket)
CREATE POLICY "Anyone can view poster space photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'poster-spaces');

-- Users can update/delete photos for their org's spaces
CREATE POLICY "Users can update photos for their org's poster spaces"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'poster-spaces' AND
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

CREATE POLICY "Users can delete photos for their org's poster spaces"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'poster-spaces' AND
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

