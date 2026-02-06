/**
 * Categories and Tags API Layer
 * Handles product categories and tags for org-based multi-tenant system
 */

import { supabase } from '@/integrations/supabase/client';
import type { ProductCategory } from '@/lib/types';

// Re-export types for convenience
export type { ProductCategory } from '@/lib/types';

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

