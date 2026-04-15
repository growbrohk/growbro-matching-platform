import { compressReceiptImage } from '@/lib/images/compressReceiptImage';
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'brand-page-assets';
const MAX_RAW_BYTES = 5 * 1024 * 1024;

/**
 * Uploads a profile logo to Supabase Storage (brand-page-assets) and returns the public URL.
 * Path: `{orgId}/profile/logo.webp` (upsert replaces previous logo).
 */
export async function uploadOrgProfileLogo(file: File, orgId: string): Promise<string> {
  if (file.size > MAX_RAW_BYTES) {
    throw new Error('Image must be less than 5MB');
  }

  const compressed = await compressReceiptImage(file, {
    targetSizeBytes: 300 * 1024,
    maxDimension: 512,
  });

  const path = `${orgId}/profile/logo.webp`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, { upsert: true, contentType: 'image/webp' });

  if (error) {
    throw new Error(error.message || 'Failed to upload logo');
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
