/**
 * Unified booking route determination logic
 * Used by PaymentPage and SuccessPage to prevent redirect loops
 */

import type { OrderWithEvent } from '@/lib/api/bookings';

export type BookingRoute = 'success' | 'pending' | 'payment';

/**
 * Determines the correct route for an order based on its state
 * 
 * Rules:
 * - if payment_status === 'paid' && fulfillment_status === 'confirmed' → success
 * - else if payment_status === 'paid' && fulfillment_status === 'pending_confirmation' → success (with status query param)
 * - else if payment_method in (payme,fps) && payment_status === 'pending' && fulfillment_status === 'pending_confirmation' → pending
 * - else if amount_total > 0 && payment_status === 'unpaid' → payment
 * - else if amount_total === 0 → success (guardrail fallback for free tickets)
 */
export function getBookingRoute(order: OrderWithEvent | null): BookingRoute {
  if (!order) {
    return 'payment'; // Default fallback
  }

  const { payment_status, fulfillment_status, payment_method, total_amount } = order;

  // Rule 1: Paid and confirmed → success
  if (payment_status === 'paid' && fulfillment_status === 'confirmed') {
    return 'success';
  }

  // Rule 2: Paid but pending confirmation (PayMe/FPS manual payment) → success
  // This handles the case where user has paid but host hasn't confirmed yet
  if (payment_status === 'paid' && fulfillment_status === 'pending_confirmation') {
    return 'success';
  }

  // Rule 3: PayMe/FPS pending confirmation (old flow) → pending
  if (
    (payment_method === 'payme' || payment_method === 'fps') &&
    (payment_status === 'pending' || payment_status === 'submitted') &&
    fulfillment_status === 'pending_confirmation'
  ) {
    return 'pending';
  }

  // Rule 4: Free tickets (amount_total === 0) → success (guardrail fallback)
  if (total_amount === 0) {
    return 'success';
  }

  // Rule 5: Paid tickets that need payment → payment
  if (total_amount > 0 && payment_status === 'unpaid') {
    return 'payment';
  }

  // Default fallback: if already paid but not confirmed, or other states → success
  // This handles edge cases where order might be in transition
  return 'success';
}

