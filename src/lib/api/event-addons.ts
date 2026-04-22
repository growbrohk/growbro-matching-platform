/**
 * Event Add-ons API
 * Fetch add-ons for checkout, manage event-addon associations
 */

import { supabase } from '@/integrations/supabase/client';
import { createProductWithVariants } from '@/lib/api/products';
import type { ProductType } from '@/lib/types';

export interface EventAddonVariant {
  id: string;
  name: string;
  price: number;
  /** When host enables stock display; null means not applicable */
  stock_remaining?: number | null;
}

export interface EventAddonForCheckout {
  product_id: string;
  product_title: string;
  /** Primary product image (products.image_url); optional for older RPC responses */
  product_image_url?: string | null;
  base_price: number;
  is_required: boolean;
  sort_order: number;
  fixed_quantity?: number | null;
  show_remaining_stock?: boolean;
  /** products.description; optional for older RPC responses */
  product_description?: string | null;
  /** products.metadata.gallery_urls; optional; older RPCs omit */
  gallery_urls?: string[] | null;
  /** products.metadata.product_details */
  product_details?: string | null;
  /** products.metadata.size_and_fit */
  size_and_fit?: string | null;
  variants: EventAddonVariant[];
}

/**
 * Get add-on products for an event (for checkout page)
 * Public - works for published events
 */
export async function getEventAddonsForCheckout(eventId: string): Promise<EventAddonForCheckout[]> {
  const { data, error } = await supabase.rpc('get_event_addons_for_checkout', {
    p_event_id: eventId,
  });

  if (error) {
    console.error('Error fetching event addons:', error);
    throw new Error(error.message || 'Failed to fetch event addons');
  }

  return (data || []) as EventAddonForCheckout[];
}

/**
 * Add a product as add-on to an event
 */
export async function addEventAddon(
  eventId: string,
  productId: string,
  isRequired: boolean = false,
  sortOrder: number = 0,
  fixedQuantity?: number | null
): Promise<void> {
  const { error } = await supabase.from('event_addon_products').insert({
    event_id: eventId,
    product_id: productId,
    is_required: isRequired,
    sort_order: sortOrder,
    fixed_quantity: fixedQuantity ?? null,
  });

  if (error) {
    if (error.code === '23505') {
      throw new Error('This product is already added as an add-on');
    }
    throw new Error(error.message || 'Failed to add add-on');
  }
}

/**
 * Update event addon (is_required, sort_order, fixed_quantity)
 */
export async function updateEventAddon(
  eventAddonId: string,
  updates: {
    is_required?: boolean;
    sort_order?: number;
    fixed_quantity?: number | null;
    show_remaining_stock?: boolean;
  }
): Promise<void> {
  const { error } = await supabase
    .from('event_addon_products')
    .update(updates)
    .eq('id', eventAddonId);

  if (error) throw new Error(error.message || 'Failed to update add-on');
}

/**
 * Remove add-on from event
 */
export async function removeEventAddon(eventAddonId: string): Promise<void> {
  const { error } = await supabase.from('event_addon_products').delete().eq('id', eventAddonId);

  if (error) throw new Error(error.message || 'Failed to remove add-on');
}

/**
 * Quick-create an add-on product (for event form inline creation)
 * Default type: addon. User can opt to also show in catalog (type: physical)
 */
export async function quickCreateAddonProduct(
  orgId: string,
  data: {
    title: string;
    basePrice: number;
    alsoShowInCatalog?: boolean;
    variantNames?: string[];
    variantPrices?: number[];
  }
): Promise<{ productId: string; variantIds: string[] }> {
  const type: ProductType = data.alsoShowInCatalog ? 'physical' : 'addon';
  const productData = {
    org_id: orgId,
    type,
    title: data.title,
    base_price: data.basePrice,
  };

  const variantData =
    data.variantNames && data.variantNames.length > 0
      ? data.variantNames.map((name, i) => ({
          name,
          price: data.variantPrices?.[i] ?? data.basePrice,
        }))
      : [{ name: 'Default', price: data.basePrice }];

  const { product, variants } = await createProductWithVariants(productData, variantData);
  return {
    productId: product.id,
    variantIds: variants.map((v) => v.id),
  };
}

/**
 * Get products for add-on picker (physical + addon, same org as event)
 */
export async function getProductsForAddonPicker(orgId: string): Promise<
  Array<{
    id: string;
    title: string;
    type: string;
    base_price: number | null;
    variants: Array<{ id: string; name: string; price: number | null }>;
  }>
> {
  const { data, error } = await supabase
    .from('products')
    .select(
      `
      id,
      title,
      type,
      base_price,
      product_variants (
        id,
        name,
        price
      )
    `
    )
    .eq('org_id', orgId)
    .in('type', ['physical', 'addon'])
    .order('title', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch products');

  return (data || []).map((p: any) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    base_price: p.base_price,
    variants: (p.product_variants || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      price: v.price,
    })),
  }));
}

/**
 * Get event addons (for event form - includes id for edit/delete)
 */
export async function getEventAddons(eventId: string): Promise<
    Array<{
    id: string;
    product_id: string;
    is_required: boolean;
    sort_order: number;
    fixed_quantity: number | null;
    show_remaining_stock: boolean;
    product: {
      id: string;
      title: string;
      type: string;
      base_price: number | null;
      variants: Array<{ id: string; name: string; price: number | null }>;
    };
  }>
> {
  const { data, error } = await supabase
    .from('event_addon_products')
    .select(
      `
      id,
      product_id,
      is_required,
      sort_order,
      fixed_quantity,
      show_remaining_stock,
      products (
        id,
        title,
        type,
        base_price,
        product_variants (
          id,
          name,
          price
        )
      )
    `
    )
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch event addons');

  const products = data || [];
  return products.map((row: any) => {
    const p = row.products;
    return {
      id: row.id,
      product_id: row.product_id,
      is_required: row.is_required,
      sort_order: row.sort_order,
      fixed_quantity: row.fixed_quantity ?? null,
      show_remaining_stock: row.show_remaining_stock ?? false,
      product: {
        id: p?.id,
        title: p?.title,
        type: p?.type,
        base_price: p?.base_price,
        variants: (p?.product_variants || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          price: v.price,
        })),
      },
    };
  });
}
