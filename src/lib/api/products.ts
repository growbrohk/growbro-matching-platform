/**
 * Products API Layer
 * Handles all product CRUD operations for org-based multi-tenant system
 */

import { supabase } from '@/integrations/supabase/client';
import { Product, ProductType, ProductVariant } from '@/lib/types';
import { collectProductPhotoUrls } from '@/lib/utils/product-media';
import { DEFAULT_LIST_LIMIT } from '@/lib/constants/query-limits';

const PRODUCT_LIST_SELECT =
  'id, org_id, type, title, description, base_price, metadata, category_id, is_on_sale, image_url, cost, created_at, updated_at';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateProductData {
  org_id: string;
  type: ProductType;
  title: string;
  description?: string;
  base_price?: number;
  category_id?: string;
  metadata?: Record<string, any>;
}

export interface UpdateProductData extends Partial<Omit<CreateProductData, 'org_id'>> {
  id: string;
}

export interface CreateVariantData {
  product_id: string;
  name: string;
  sku?: string;
  price?: number;
  metadata?: Record<string, any>;
}

export interface UpdateVariantData extends Partial<Omit<CreateVariantData, 'product_id'>> {
  id: string;
}

export type ProductAccessVariantVisibility = 'public' | 'code' | 'affiliate' | 'hidden';

export interface ProductAccessVariant {
  id: string;
  product_id: string;
  visibility_mode: ProductAccessVariantVisibility;
  access_code: string | null;
  allowed_affiliates: string[] | null;
  price_override: number | null;
  discount_percent: number | null;
  quota: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductAccessVariantInput {
  visibility_mode: ProductAccessVariantVisibility;
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  price_override?: number | null;
  discount_percent?: number | null;
  quota?: number | null;
  is_active?: boolean;
}

// ============================================================================
// PRODUCTS
// ============================================================================

/**
 * Get all products for an org
 */
export async function getProducts(orgId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_LIST_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(DEFAULT_LIST_LIMIT);

  if (error) throw error;
  return data || [];
}

/**
 * Get a single product by ID
 */
export async function getProduct(productId: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

/**
 * Create a new product
 */
export async function createProduct(data: CreateProductData): Promise<Product> {
  const productData: any = {
    org_id: data.org_id,
    type: data.type,
    title: data.title,
    description: data.description || null,
    base_price: data.base_price || null,
    category_id: data.category_id || null,
    metadata: data.metadata || {},
  };

  const { data: product, error } = await supabase
    .from('products')
    .insert(productData)
    .select()
    .single();

  if (error) throw error;
  return product;
}

/**
 * Update an existing product
 */
export async function updateProduct(data: UpdateProductData): Promise<Product> {
  const { id, ...updates } = data;

  const updateData: any = {};
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description || null;
  if (updates.base_price !== undefined) updateData.base_price = updates.base_price;
  if (updates.category_id !== undefined) updateData.category_id = updates.category_id || null;
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

  const { data: product, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return product;
}

/**
 * Delete a product
 */
export async function deleteProduct(productId: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId);

  if (error) throw error;
}

/**
 * Get products by category
 */
export async function getProductsByCategory(
  orgId: string,
  categoryId: string
): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('org_id', orgId)
    .eq('category_id', categoryId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get products by type
 */
export async function getProductsByType(
  orgId: string,
  type: ProductType
): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('org_id', orgId)
    .eq('type', type)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export type RelatedProductSummary = {
  id: string;
  title: string;
  image_url: string | null;
  metadata: Record<string, unknown>;
  base_price: number | null;
};

/** Resolve image URL for carousel cards (image_url, metadata.photos, metadata.image). */
export function relatedProductCardImageUrl(p: RelatedProductSummary): string | null {
  if (p.image_url) return p.image_url;
  const meta = p.metadata as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== 'object') return null;
  const photos = meta.photos;
  if (Array.isArray(photos) && typeof photos[0] === 'string') return photos[0];
  const img = meta.image;
  return typeof img === 'string' ? img : null;
}

/**
 * Other physical products from the same org (e.g. PDP “You may also like”).
 */
export async function getRelatedPhysicalProducts(
  orgId: string,
  excludeProductId: string,
  opts?: { inSaleOnly?: boolean; limit?: number },
): Promise<RelatedProductSummary[]> {
  const limit = opts?.limit ?? 12;
  let query = supabase
    .from('products')
    .select('id, title, image_url, metadata, base_price')
    .eq('org_id', orgId)
    .eq('type', 'physical')
    .neq('id', excludeProductId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.inSaleOnly) {
    query = query.eq('is_on_sale', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as RelatedProductSummary[]) || [];
}

/**
 * Physical products for carousels (e.g. bag “You may also like”) with optional excludes.
 */
export async function getPhysicalProductSummariesForOrg(
  orgId: string,
  opts?: { inSaleOnly?: boolean; limit?: number; excludeIds?: string[] },
): Promise<RelatedProductSummary[]> {
  const want = opts?.limit ?? 12;
  const exclude = new Set(opts?.excludeIds ?? []);
  const fetchLimit = Math.min(want + exclude.size + 12, 48);

  let query = supabase
    .from('products')
    .select('id, title, image_url, metadata, base_price')
    .eq('org_id', orgId)
    .eq('type', 'physical')
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (opts?.inSaleOnly) {
    query = query.eq('is_on_sale', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as RelatedProductSummary[]) || [];
  return rows.filter((p) => !exclude.has(p.id)).slice(0, want);
}

/**
 * Primary gallery image per product id (for cart lines missing imageUrl, e.g. legacy localStorage).
 */
export async function getProductPrimaryPhotoUrlsByIds(productIds: string[]): Promise<Record<string, string>> {
  if (productIds.length === 0) return {};
  const unique = [...new Set(productIds)];
  const { data, error } = await supabase
    .from('products')
    .select('id, image_url, metadata')
    .in('id', unique);

  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data || []) {
    const urls = collectProductPhotoUrls(row as { image_url?: string | null; metadata?: Record<string, unknown> });
    const first = urls[0];
    if (first) out[row.id] = first;
  }
  return out;
}

// ============================================================================
// PRODUCT VARIANTS
// ============================================================================

/**
 * Get all variants for a product
 */
export async function getProductVariants(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .eq('active', true)
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get a single variant by ID
 */
export async function getVariant(variantId: string): Promise<ProductVariant | null> {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('id', variantId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

/**
 * Create a new variant
 */
export async function createVariant(data: CreateVariantData): Promise<ProductVariant> {
  const variantData: any = {
    product_id: data.product_id,
    name: data.name,
    sku: data.sku || null,
    price: data.price || null,
    metadata: data.metadata || {},
    active: true,
  };

  const { data: variant, error } = await supabase
    .from('product_variants')
    .insert(variantData)
    .select()
    .single();

  if (error) throw error;
  return variant;
}

/**
 * Update an existing variant
 */
export async function updateVariant(data: UpdateVariantData): Promise<ProductVariant> {
  const { id, ...updates } = data;

  const updateData: any = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.sku !== undefined) updateData.sku = updates.sku || null;
  if (updates.price !== undefined) updateData.price = updates.price;
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

  const { data: variant, error } = await supabase
    .from('product_variants')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return variant;
}

/**
 * Archive a variant (soft delete)
 */
export async function archiveVariant(variantId: string): Promise<void> {
  const { error } = await supabase
    .from('product_variants')
    .update({
      active: false,
      archived_at: new Date().toISOString(),
    })
    .eq('id', variantId);

  if (error) throw error;
}

/**
 * Unarchive a variant
 */
export async function unarchiveVariant(variantId: string): Promise<void> {
  const { error } = await supabase
    .from('product_variants')
    .update({
      active: true,
      archived_at: null,
    })
    .eq('id', variantId);

  if (error) throw error;
}

/**
 * Delete a variant (hard delete)
 */
export async function deleteVariant(variantId: string): Promise<void> {
  const { error } = await supabase
    .from('product_variants')
    .delete()
    .eq('id', variantId);

  if (error) throw error;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get product with its variants
 */
export async function getProductWithVariants(
  productId: string
): Promise<{ product: Product; variants: ProductVariant[] } | null> {
  const [product, variants] = await Promise.all([
    getProduct(productId),
    getProductVariants(productId),
  ]);

  if (!product) return null;

  return { product, variants };
}

/**
 * Create product with variants in one transaction
 */
export async function createProductWithVariants(
  productData: CreateProductData,
  variantsData: Omit<CreateVariantData, 'product_id'>[]
): Promise<{ product: Product; variants: ProductVariant[] }> {
  // Create product first
  const product = await createProduct(productData);

  // Create variants if provided
  const variants: ProductVariant[] = [];
  if (variantsData && variantsData.length > 0) {
    for (const variantData of variantsData) {
      const variant = await createVariant({
        ...variantData,
        product_id: product.id,
      });
      variants.push(variant);
    }
  } else {
    // Create a default variant if none provided
    const defaultVariant = await createVariant({
      product_id: product.id,
      name: 'Default',
      price: productData.base_price || null,
    });
    variants.push(defaultVariant);
  }

  return { product, variants };
}

/**
 * Duplicate a product with its variants
 */
export async function duplicateProduct(
  productId: string,
  newTitle?: string
): Promise<{ product: Product; variants: ProductVariant[] }> {
  const original = await getProductWithVariants(productId);
  if (!original) throw new Error('Product not found');

  // Create new product
  const newProduct = await createProduct({
    org_id: original.product.org_id,
    type: original.product.type,
    title: newTitle || `${original.product.title} (Copy)`,
    description: original.product.description,
    base_price: original.product.base_price,
    category_id: original.product.category_id,
    metadata: original.product.metadata,
  });

  // Duplicate variants
  const newVariants: ProductVariant[] = [];
  for (const variant of original.variants) {
    const newVariant = await createVariant({
      product_id: newProduct.id,
      name: variant.name,
      sku: variant.sku ? `${variant.sku}-copy` : undefined,
      price: variant.price,
      metadata: variant.metadata,
    });
    newVariants.push(newVariant);
  }

  return { product: newProduct, variants: newVariants };
}

// ============================================================================
// PRODUCT ACCESS VARIANTS (promo / code links)
// ============================================================================

export async function getProductAccessVariants(productId: string): Promise<ProductAccessVariant[]> {
  const { data, error } = await supabase
    .from('product_access_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to fetch product access variants');
  }

  return (data || []) as ProductAccessVariant[];
}

/**
 * Replace all access variants for a product (full sync).
 */
export async function replaceProductAccessVariants(
  productId: string,
  variants: ProductAccessVariantInput[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from('product_access_variants')
    .delete()
    .eq('product_id', productId);

  if (delErr) {
    throw new Error(delErr.message || 'Failed to clear product access variants');
  }

  if (variants.length === 0) return;

  const rows = variants.map((v) => ({
    product_id: productId,
    visibility_mode: v.visibility_mode,
    access_code: v.visibility_mode === 'code' ? (v.access_code || null) : null,
    allowed_affiliates: v.visibility_mode === 'affiliate' ? (v.allowed_affiliates || null) : null,
    price_override: v.price_override ?? null,
    discount_percent: v.discount_percent ?? null,
    quota: v.quota ?? null,
    is_active: v.is_active !== false,
  }));

  const { error: insErr } = await supabase.from('product_access_variants').insert(rows);

  if (insErr) {
    throw new Error(insErr.message || 'Failed to save product access variants');
  }
}
