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
 * - else if payment_status === 'submitted' → pending (PayMe/FPS receipt uploaded, waiting for host)
 * - else if payment_method in (payme,fps) && payment_status === 'pending' && fulfillment_status === 'pending_confirmation' → pending
 * - else if amount_total > 0 && payment_status === 'unpaid' → payment
 * - else if amount_total === 0 && fulfillment_status === 'confirmed' → success (free tickets, confirmed)
 * - else if amount_total === 0 → success (free tickets, auto-confirmed)
 * - else → payment (fallback)
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

  // Rule 2: Payment submitted (PayMe/FPS receipt uploaded) → pending
  // This is the NEW flow: receipt upload sets payment_status='submitted', waiting for host confirmation
  if (payment_status === 'submitted') {
    return 'pending';
  }

  // Rule 3: PayMe/FPS pending confirmation (legacy flow with payment_status='pending') → pending
  if (
    (payment_method === 'payme' || payment_method === 'fps') &&
    payment_status === 'pending' &&
    fulfillment_status === 'pending_confirmation'
  ) {
    return 'pending';
  }

  // Rule 4: Free tickets (amount_total === 0) → success
  // Free tickets are auto-confirmed, so they go straight to success
  if (total_amount === 0 || (total_amount <= 0 && fulfillment_status === 'confirmed')) {
    return 'success';
  }

  // Rule 5: Paid tickets that need payment → payment
  if (total_amount > 0 && payment_status === 'unpaid') {
    return 'payment';
  }

  // Default fallback: if payment_status='paid' but not confirmed, or other edge cases → payment
  // This ensures we don't show success page prematurely
  return 'payment';
}

