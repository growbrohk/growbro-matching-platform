-- =====================================================
-- Storage Bucket for Product Images
-- =====================================================

-- Create the bucket (if using Supabase CLI, this is done via: supabase storage create product-images)
-- For SQL-based setup, insert into storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  3145728, -- 3MB in bytes (3 * 1024 * 1024)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: Allow authenticated users to upload files for their org's products
-- Users can upload to their org's folder: {orgId}/products/{productId or draftId}/{timestamp}.jpg
-- Drop existing policies if they exist (to handle re-running migration)
DROP POLICY IF EXISTS "Users can upload product images for their org's products" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update product images for their org's products" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete product images for their org's products" ON storage.objects;

CREATE POLICY "Users can upload product images for their org's products"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' AND
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

-- Anyone can view product images (public bucket)
CREATE POLICY "Anyone can view product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Users can update/delete product images for their org's products
CREATE POLICY "Users can update product images for their org's products"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images' AND
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

CREATE POLICY "Users can delete product images for their org's products"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images' AND
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
