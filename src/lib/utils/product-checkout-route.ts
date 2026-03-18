/**
 * Product checkout route determination
 * Used by ProductPaymentPage and ProductCheckoutSuccessPage
 */

import type { OrderWithOrgAndProducts } from '@/lib/api/product-checkout';

export type ProductCheckoutRoute = 'success' | 'pending' | 'payment';

export function getProductCheckoutRoute(order: OrderWithOrgAndProducts['order'] | null): ProductCheckoutRoute {
  if (!order) return 'payment';

  const { payment_status, fulfillment_status, total_amount } = order;

  if (fulfillment_status === 'confirmed') return 'success';
  if (payment_status === 'submitted') return 'pending';
  if (payment_status === 'paid') return 'success';
  if (total_amount <= 0) return 'success';
  if (payment_status === 'unpaid') return 'payment';

  return 'payment';
}
