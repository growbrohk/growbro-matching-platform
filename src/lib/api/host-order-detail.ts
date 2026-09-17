import type { OrderWithEvent } from '@/lib/api/bookings';
import { getOrderWithEvent } from '@/lib/api/bookings';
import type { OrderWithOrgAndProducts } from '@/lib/api/product-checkout';
import { getOrderWithOrgAndProducts } from '@/lib/api/product-checkout';

export type HostOrderDetailPayload =
  | { kind: 'product'; order: OrderWithOrgAndProducts }
  | { kind: 'event'; order: OrderWithEvent };

export type HostOrderDetailFetchOptions = {
  /** When known from the orders list, skip the other RPC probe. */
  preferKind?: 'product' | 'event';
};

/**
 * Resolve order for host detail: product checkout first, then event/ticket RPC.
 */
export async function fetchHostOrderDetail(
  orderId: string,
  options?: HostOrderDetailFetchOptions
): Promise<HostOrderDetailPayload | null> {
  const prefer = options?.preferKind;

  if (prefer === 'event') {
    const event = await getOrderWithEvent(orderId);
    return event ? { kind: 'event', order: event } : null;
  }

  if (prefer === 'product') {
    const product = await getOrderWithOrgAndProducts(orderId);
    return product ? { kind: 'product', order: product } : null;
  }

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
