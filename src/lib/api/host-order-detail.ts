import type { OrderWithEvent } from '@/lib/api/bookings';
import { getOrderWithEvent } from '@/lib/api/bookings';
import type { OrderWithOrgAndProducts } from '@/lib/api/product-checkout';
import { getOrderWithOrgAndProducts } from '@/lib/api/product-checkout';

export type HostOrderDetailPayload =
  | { kind: 'product'; order: OrderWithOrgAndProducts }
  | { kind: 'event'; order: OrderWithEvent };

/**
 * Resolve order for host detail: product checkout first, then event/ticket RPC.
 */
export async function fetchHostOrderDetail(orderId: string): Promise<HostOrderDetailPayload | null> {
  const product = await getOrderWithOrgAndProducts(orderId);
  if (product) {
    return { kind: 'product', order: product };
  }
  const event = await getOrderWithEvent(orderId);
  if (event) {
    return { kind: 'event', order: event };
  }
  return null;
}
