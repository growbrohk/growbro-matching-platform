import { supabase } from '@/integrations/supabase/client';
import type { ProductCategory, ProductTag, ProductTagLink } from '@/lib/types';

// Re-export types for convenience
export type { ProductCategory, ProductTag, ProductTagLink } from '@/lib/types';

// ============================================================================
// PRODUCT CATEGORIES API
// ============================================================================

export interface CategoryWithCount extends ProductCategory {
  product_count?: number;
}

/**
 * Get all categories for an org
 */
export async function getCategories(orgId: string): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get all categories for an org with product counts
 */
export async function getCategoriesWithCounts(orgId: string): Promise<CategoryWithCount[]> {
  const { data, error } = await supabase
    .from('product_categories')
    .select(`
      *,
      products:products(count)
    `)
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  // Transform the response to include product_count
  return (data || []).map((cat: any) => ({
    ...cat,
    product_count: cat.products?.[0]?.count || 0,
    products: undefined, // Remove nested products field
  }));
}

/**
 * Get a single category by ID
 */
export async function getCategory(categoryId: string): Promise<ProductCategory | null> {
  const { data, error } = await supabase
    .from('product_categories')
    .select('*')
    .eq('id', categoryId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

/**
 * Create a new category
 */
export async function createCategory(
  orgId: string,
  name: string,
  slug?: string
): Promise<ProductCategory> {
  const categorySlug = slug || slugify(name);

  const { data, error } = await supabase
    .from('product_categories')
    .insert({
      org_id: orgId,
      name,
      slug: categorySlug,
      sort_order: 0, // Will be adjusted if needed
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a category
 */
export async function updateCategory(
  categoryId: string,
  updates: Partial<Pick<ProductCategory, 'name' | 'slug' | 'sort_order'>>
): Promise<ProductCategory> {
  const { data, error } = await supabase
    .from('product_categories')
    .update(updates)
    .eq('id', categoryId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a category
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase
    .from('product_categories')
    .delete()
    .eq('id', categoryId);

  if (error) throw error;
}

/**
 * Reassign products from one category to another (or to null)
 */
export async function reassignProductsCategory(
  fromCategoryId: string,
  toCategoryId: string | null
): Promise<number> {
  const { data, error } = await supabase
    .from('products')
    .update({ category_id: toCategoryId })
    .eq('category_id', fromCategoryId)
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

/**
 * Update sort order for multiple categories
 */
export async function updateCategoriesSortOrder(
  updates: Array<{ id: string; sort_order: number }>
): Promise<void> {
  // Update each category's sort order
  const promises = updates.map((update) =>
    supabase
      .from('product_categories')
      .update({ sort_order: update.sort_order })
      .eq('id', update.id)
  );

  const results = await Promise.all(promises);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    throw errors[0].error;
  }
}

// ============================================================================
// PRODUCT TAGS API
// ============================================================================

export interface TagWithCount extends ProductTag {
  product_count?: number;
}

/**
 * Get all tags for an org
 */
export async function getTags(orgId: string): Promise<ProductTag[]> {
  const { data, error } = await supabase
    .from('product_tags')
    .select('*')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get all tags for an org with product counts
 */
export async function getTagsWithCounts(orgId: string): Promise<TagWithCount[]> {
  const { data, error } = await supabase
    .from('product_tags')
    .select(`
      *,
      product_tag_links(count)
    `)
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  if (error) throw error;

  // Transform the response to include product_count
  return (data || []).map((tag: any) => ({
    ...tag,
    product_count: tag.product_tag_links?.[0]?.count || 0,
    product_tag_links: undefined, // Remove nested field
  }));
}

/**
 * Get a single tag by ID
 */
export async function getTag(tagId: string): Promise<ProductTag | null> {
  const { data, error } = await supabase
    .from('product_tags')
    .select('*')
    .eq('id', tagId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

/**
 * Create a new tag
 */
export async function createTag(
  orgId: string,
  name: string,
  slug?: string
): Promise<ProductTag> {
  const tagSlug = slug || slugify(name);

  const { data, error } = await supabase
    .from('product_tags')
    .insert({
      org_id: orgId,
      name,
      slug: tagSlug,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a tag
 */
export async function updateTag(
  tagId: string,
  updates: Partial<Pick<ProductTag, 'name' | 'slug'>>
): Promise<ProductTag> {
  const { data, error } = await supabase
    .from('product_tags')
    .update(updates)
    .eq('id', tagId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a tag (cascade deletes all product_tag_links)
 */
export async function deleteTag(tagId: string): Promise<void> {
  const { error } = await supabase
    .from('product_tags')
    .delete()
    .eq('id', tagId);

  if (error) throw error;
}

// ============================================================================
// PRODUCT TAG LINKS API
// ============================================================================

/**
 * Get all tags for a product
 */
export async function getProductTags(productId: string): Promise<ProductTag[]> {
  const { data, error } = await supabase
    .from('product_tag_links')
    .select('product_tags(*)')
    .eq('product_id', productId);

  if (error) throw error;
  return (data || []).map((link: any) => link.product_tags).filter(Boolean);
}

/**
 * Get all tag IDs for a product (lighter query)
 */
export async function getProductTagIds(productId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('product_tag_links')
    .select('tag_id')
    .eq('product_id', productId);

  if (error) throw error;
  return (data || []).map((link) => link.tag_id);
}

/**
 * Add a tag to a product
 */
export async function addProductTag(
  productId: string,
  tagId: string
): Promise<ProductTagLink> {
  const { data, error } = await supabase
    .from('product_tag_links')
    .insert({
      product_id: productId,
      tag_id: tagId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Remove a tag from a product
 */
export async function removeProductTag(
  productId: string,
  tagId: string
): Promise<void> {
  const { error } = await supabase
    .from('product_tag_links')
    .delete()
    .eq('product_id', productId)
    .eq('tag_id', tagId);

  if (error) throw error;
}

/**
 * Sync product tags - adds/removes tags to match the provided tag IDs
 * This is a diff-based operation that's efficient for updating tags
 */
export async function syncProductTags(
  productId: string,
  tagIds: string[]
): Promise<void> {
  // Get current tag IDs
  const currentTagIds = await getProductTagIds(productId);

  // Calculate diffs
  const toAdd = tagIds.filter((id) => !currentTagIds.includes(id));
  const toRemove = currentTagIds.filter((id) => !tagIds.includes(id));

  // Execute additions
  if (toAdd.length > 0) {
    const { error: addError } = await supabase
      .from('product_tag_links')
      .insert(toAdd.map((tagId) => ({ product_id: productId, tag_id: tagId })));

    if (addError) throw addError;
  }

  // Execute removals
  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from('product_tag_links')
      .delete()
      .eq('product_id', productId)
      .in('tag_id', toRemove);

    if (removeError) throw removeError;
  }
}

/**
 * Remove all tags from a product
 */
export async function removeAllProductTags(productId: string): Promise<void> {
  const { error } = await supabase
    .from('product_tag_links')
    .delete()
    .eq('product_id', productId);

  if (error) throw error;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert a string to a URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

