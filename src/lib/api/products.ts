/**
 * Product API Layer
 * Handles all product CRUD operations with proper validation and permissions
 */

import { supabase } from '@/integrations/supabase/client';
import { Product, ProductOwnerType, ProductClass, Profile } from '@/lib/types';

export interface CreateProductData {
  name: string;
  slug?: string;
  product_class: ProductClass;
  owner_type?: ProductOwnerType; // Auto-determined if not provided
  short_description?: string;
  full_description?: string;
  category?: string;
  thumbnail_url?: string;
  price_in_cents?: number;
  currency?: string;
  is_purchasable?: boolean;
  is_public?: boolean;
  is_active?: boolean;
  suitable_collab_types?: string[];
  margin_notes?: string;
  inventory_notes?: string;
}

export interface UpdateProductData extends Partial<CreateProductData> {
  id: string;
}

/**
 * Generate slug from product name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Validate product data before save
 */
function validateProductData(
  data: CreateProductData,
  profile: Profile,
  isUpdate: boolean = false
): { valid: boolean; error?: string } {
  // Name is required
  if (!data.name || !data.name.trim()) {
    return { valid: false, error: 'Product name is required' };
  }

  // Product class is required
  if (!data.product_class) {
    return { valid: false, error: 'Product class is required' };
  }

  // Validate product class
  const validClasses: ProductClass[] = ['physical', 'ticket', 'booking', 'service', 'space'];
  if (!validClasses.includes(data.product_class)) {
    return { valid: false, error: 'Invalid product class' };
  }

  // Validate owner_type
  let ownerType = data.owner_type;
  if (!ownerType) {
    // Auto-determine: default to brand
    ownerType = 'brand';
  }

  // Venue products can only be created by venue users
  if (ownerType === 'venue' && !profile.is_venue) {
    return {
      valid: false,
      error: 'Only venue users can create venue products',
    };
  }

  // Price validation
  if (data.price_in_cents !== undefined && data.price_in_cents < 0) {
    return { valid: false, error: 'Price must be 0 or greater' };
  }

  return { valid: true };
}

/**
 * Create a new product
 */
export async function createProduct(
  data: CreateProductData,
  profile: Profile
): Promise<{ data: Product | null; error: Error | null }> {
  try {
    // Validate
    const validation = validateProductData(data, profile, false);
    if (!validation.valid) {
      return { data: null, error: new Error(validation.error) };
    }

    // Determine owner_type
    let ownerType: ProductOwnerType = data.owner_type || 'brand';
    if (!profile.is_venue) {
      ownerType = 'brand'; // Force brand if user is not a venue
    }

    // Generate slug if not provided
    const slug = data.slug || generateSlug(data.name);

    // Check slug uniqueness
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      // Append timestamp if slug exists
      const uniqueSlug = `${slug}-${Date.now().toString().slice(-6)}`;
      data.slug = uniqueSlug;
    } else {
      data.slug = slug;
    }

    // Prepare product data
    const productData: any = {
      brand_user_id: profile.id, // Required legacy field
      owner_type: ownerType,
      owner_user_id: profile.id,
      product_class: data.product_class,
      product_type: (data as any).product_type || 'simple', // Default to simple if not specified
      name: data.name.trim(),
      slug: data.slug,
      short_description: data.short_description || null,
      full_description: data.full_description || null,
      category: data.category || null,
      thumbnail_url: data.thumbnail_url || null,
      price_in_cents: data.price_in_cents || 0,
      currency: data.currency || 'hkd',
      is_purchasable: data.is_purchasable ?? false,
      is_public: data.is_public ?? false,
      is_active: data.is_active ?? true,
      suitable_collab_types: data.suitable_collab_types || [],
      margin_notes: data.margin_notes || null,
      inventory_notes: data.inventory_notes || null,
    };

    // Insert product
    const { data: product, error } = await supabase
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) throw error;

    return { data: product as Product, error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Update an existing product
 */
export async function updateProduct(
  data: UpdateProductData,
  profile: Profile
): Promise<{ data: Product | null; error: Error | null }> {
  try {
    // First, verify ownership
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', data.id)
      .eq('owner_user_id', profile.id)
      .single();

    if (fetchError || !existingProduct) {
      return {
        data: null,
        error: new Error('Product not found or you do not have permission to edit it'),
      };
    }

    // Validate
    const validation = validateProductData(
      { ...existingProduct, ...data } as CreateProductData,
      profile,
      true
    );
    if (!validation.valid) {
      return { data: null, error: new Error(validation.error) };
    }

    // Prepare update data
    const updateData: any = {};

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
      // Regenerate slug if name changed
      if (data.name !== existingProduct.name) {
        const newSlug = data.slug || generateSlug(data.name);
        // Check uniqueness
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('slug', newSlug)
          .neq('id', data.id)
          .maybeSingle();

        updateData.slug = existing ? `${newSlug}-${Date.now().toString().slice(-6)}` : newSlug;
      }
    }

    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.product_class !== undefined) updateData.product_class = data.product_class;
    if ((data as any).product_type !== undefined) updateData.product_type = (data as any).product_type;
    if (data.short_description !== undefined) updateData.short_description = data.short_description || null;
    if (data.full_description !== undefined) updateData.full_description = data.full_description || null;
    if (data.category !== undefined) updateData.category = data.category || null;
    if (data.thumbnail_url !== undefined) updateData.thumbnail_url = data.thumbnail_url || null;
    if (data.price_in_cents !== undefined) updateData.price_in_cents = data.price_in_cents;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.is_purchasable !== undefined) updateData.is_purchasable = data.is_purchasable;
    if (data.is_public !== undefined) updateData.is_public = data.is_public;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.suitable_collab_types !== undefined) updateData.suitable_collab_types = data.suitable_collab_types;
    if (data.margin_notes !== undefined) updateData.margin_notes = data.margin_notes || null;
    if (data.inventory_notes !== undefined) updateData.inventory_notes = data.inventory_notes || null;

    // Owner type can only be changed if user is venue
    if (data.owner_type !== undefined) {
      if (data.owner_type === 'venue' && !profile.is_venue) {
        return {
          data: null,
          error: new Error('Only venue users can create venue products'),
        };
      }
      updateData.owner_type = data.owner_type;
    }

    // Update product
    const { data: product, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', data.id)
      .eq('owner_user_id', profile.id) // Ensure ownership
      .select()
      .single();

    if (error) throw error;

    return { data: product as Product, error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Delete a product
 */
export async function deleteProduct(
  productId: string,
  profile: Profile
): Promise<{ error: Error | null }> {
  try {
    // Verify ownership before deleting
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('owner_user_id', profile.id)
      .single();

    if (fetchError || !product) {
      return {
        error: new Error('Product not found or you do not have permission to delete it'),
      };
    }

    // Delete product
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('owner_user_id', profile.id);

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    return { error: error as Error };
  }
}

/**
 * Get products by owner type (brand or venue)
 */
export async function getMyProducts(
  profile: Profile,
  ownerType: ProductOwnerType
): Promise<{ data: Product[] | null; error: Error | null }> {
  try {
    // Validate: venue products can only be fetched by venue users
    if (ownerType === 'venue' && !profile.is_venue) {
      return {
        data: null,
        error: new Error('Only venue users can access venue products'),
      };
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('owner_user_id', profile.id)
      .eq('owner_type', ownerType)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { data: (data as Product[]) || [], error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get a single product by ID (with ownership check)
 */
export async function getProductById(
  productId: string,
  profile: Profile
): Promise<{ data: Product | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('owner_user_id', profile.id)
      .single();

    if (error) throw error;

    return { data: data as Product, error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get all products (both brand and venue) for a user
 */
export async function getAllMyProducts(
  profile: Profile
): Promise<{ data: Product[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('owner_user_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { data: (data as Product[]) || [], error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

