/**
 * Product checkout API
 * create_product_order, get_order_with_org_and_products
 */

import { supabase } from '@/integrations/supabase/client';

export interface CreateProductOrderItem {
  product_id: string;
  variant_id?: string | null;
  qty: number;
  unit_price: number;
  product_name: string;
  variant_label?: string | null;
}

export interface CreateProductOrderContact {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
}

export type ProductDeliveryMethod = 'door' | 'sf_locker' | 'event_pickup';

export interface CreateProductOrderDeliveryDetails {
  country?: string;
  building?: string;
  street?: string;
  region?: string;
  district?: string;
  sf_locker_address?: string;
  sf_locker_code?: string;
}

export interface CreateProductOrderDelivery {
  delivery_method: ProductDeliveryMethod;
  delivery_details: CreateProductOrderDeliveryDetails;
}

export interface OrderWithOrgAndProducts {
  order: {
    id: string;
    order_type: string;
    host_org_id: string | null;
    buyer_user_id: string | null;
    buyer_first_name: string | null;
    buyer_last_name: string | null;
    buyer_email: string | null;
    buyer_phone: string | null;
    total_amount: number;
    currency: string;
    order_no: string | null;
    status: string;
    payment_status: string;
    payment_method: string | null;
    fulfillment_status: string | null;
    receipt_url: string | null;
    submitted_at: string | null;
    paid_at: string | null;
    created_at: string;
    metadata?: Record<string, unknown>;
  };
  org: {
    id: string;
    name: string;
    slug: string | null;
    enable_stripe: boolean;
    enable_payme: boolean;
    enable_fps: boolean;
    payme_link: string | null;
    fps_link: string | null;
  };
  order_items: Array<{
    id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    metadata: Record<string, unknown>;
    product_name: string;
    variant_label: string | null;
  }>;
}

export async function createProductOrder(
  orgId: string,
  items: CreateProductOrderItem[],
  contact: CreateProductOrderContact,
  buyerUserId?: string | null,
  delivery?: CreateProductOrderDelivery
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = buyerUserId ?? user?.id ?? null;

  const pItems = items.map((i) => ({
    product_id: i.product_id,
    variant_id: i.variant_id || null,
    qty: i.qty,
    unit_price: i.unit_price,
    product_name: i.product_name,
    variant_label: i.variant_label || null,
  }));

  const pContact = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email || null,
    phone: contact.phone || null,
  };

  const pDelivery = delivery
    ? {
        delivery_method: delivery.delivery_method,
        delivery_details: delivery.delivery_details,
      }
    : {};

  const { data, error } = await supabase.rpc('create_product_order', {
    p_org_id: orgId,
    p_items: pItems,
    p_contact: pContact,
    p_buyer_user_id: uid,
    p_delivery: pDelivery,
  });

  if (error) throw error;
  if (!data) throw new Error('No order ID returned');
  return data as string;
}

export async function getOrderWithOrgAndProducts(orderId: string): Promise<OrderWithOrgAndProducts | null> {
  const { data, error } = await supabase.rpc('get_order_with_org_and_products', {
    p_order_id: orderId,
  });

  if (error || !data) return null;
  return data as OrderWithOrgAndProducts;
}
