/**
 * Shared helpers for product primary image + gallery (PDP + admin).
 */

export const MAX_PRODUCT_GALLERY_EXTRA = 10;

type MetadataLike = Record<string, unknown> | null | undefined;

export function mergeProductDetailMetadata(
  base: Record<string, unknown>,
  opts: {
    galleryUrls: string[];
    productDetails: string;
    sizeAndFit: string;
  },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const u of opts.galleryUrls) {
    const t = String(u).trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    merged.push(t);
    if (merged.length >= MAX_PRODUCT_GALLERY_EXTRA) break;
  }
  if (merged.length) out.gallery_urls = merged;
  else delete out.gallery_urls;

  const pd = opts.productDetails.trim();
  if (pd) out.product_details = pd;
  else delete out.product_details;

  const sf = opts.sizeAndFit.trim();
  if (sf) out.size_and_fit = sf;
  else delete out.size_and_fit;

  return out;
}

/** Ordered, deduped URLs for public gallery: primary image_url, then gallery_urls, then legacy metadata. */
export function collectProductPhotoUrls(product: {
  image_url?: string | null;
  metadata?: MetadataLike;
}): string[] {
  const urls: string[] = [];
  const push = (u: unknown) => {
    if (typeof u !== 'string') return;
    const t = u.trim();
    if (!t || urls.includes(t)) return;
    urls.push(t);
  };

  push(product.image_url);

  const meta = product.metadata;
  if (meta && typeof meta === 'object') {
    const g = (meta as Record<string, unknown>).gallery_urls;
    if (Array.isArray(g)) g.forEach(push);
    const photos = (meta as Record<string, unknown>).photos;
    if (Array.isArray(photos)) photos.forEach(push);
    const single = (meta as Record<string, unknown>).image;
    push(single);
  }

  return urls;
}

/** Single image URL from variant metadata (if your catalog stores per-variant photos). */
export function collectVariantPhotoUrl(variant: { metadata?: MetadataLike }): string | null {
  const m = variant.metadata;
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  for (const key of ['image_url', 'image', 'photo_url', 'thumbnail_url']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
