-- =====================================================
-- Storage Bucket for Brand Page Assets
-- =====================================================
-- Hero banner, description gallery images, logo uploads
-- Path: {org_id}/hero.webp, {org_id}/description/1.webp, etc.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-page-assets',
  'brand-page-assets',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload brand page assets for their org" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view brand page assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update brand page assets for their org" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete brand page assets for their org" ON storage.objects;

CREATE POLICY "Users can upload brand page assets for their org"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brand-page-assets' AND
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

CREATE POLICY "Anyone can view brand page assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-page-assets');

CREATE POLICY "Users can update brand page assets for their org"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'brand-page-assets' AND
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

CREATE POLICY "Users can delete brand page assets for their org"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brand-page-assets' AND
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
