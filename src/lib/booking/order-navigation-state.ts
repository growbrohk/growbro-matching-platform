import type { OrderWithEvent } from '@/lib/api/bookings';

/** Router location.state payload to skip redundant get_order_with_event_and_tickets on redirect */
export type BookingOrderNavigationState = {
  orderWithEvent?: OrderWithEvent;
};

export function readBookingOrderFromNavigationState(
  state: unknown,
  orderId: string
): OrderWithEvent | null {
  if (!state || typeof state !== 'object') return null;
  const payload = state as BookingOrderNavigationState;
  const order = payload.orderWithEvent;
  if (!order || order.id !== orderId) return null;
  return order;
}

export function bookingOrderNavigationState(order: OrderWithEvent): BookingOrderNavigationState {
  return { orderWithEvent: order };
}
