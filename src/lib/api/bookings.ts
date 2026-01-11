/**
 * Booking API Functions
 * Handles event ticket booking creation
 */

import { supabase } from '@/integrations/supabase/client';
import type { BookingDraft, AttendeeInfo, ContactInfo } from '@/lib/types/booking';

export interface CreateBookingResponse {
  orderId: string;
  success: boolean;
}

export interface CreateBookingData {
  eventId: string;
  buyerUserId?: string | null;
  buyerContactInfo?: ContactInfo;
  totalAmount: number;
  currency: string;
  orderLines: Array<{
    ticketTypeId: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  attendees?: AttendeeInfo[];
}

/**
 * Create an event booking from a booking draft
 */
export async function createBooking(
  draft: BookingDraft,
  contactInfo: ContactInfo,
  attendees?: AttendeeInfo[],
  discountAmount: number = 0
): Promise<CreateBookingResponse> {
  // Get current user if authenticated
  const { data: { user } } = await supabase.auth.getUser();
  const buyerUserId = user?.id || null;

  // Prepare order lines from draft
  const orderLines = draft.lines
    .filter(line => line.qty > 0)
    .map(line => ({
      ticket_type_id: line.ticketTypeId,
      quantity: line.qty,
      unit_price: line.unitPrice,
      subtotal: line.unitPrice * line.qty,
    }));

  // Calculate total amount (subtotal - discount)
  const subtotal = draft.lines.reduce((sum, line) => sum + (line.unitPrice * line.qty), 0);
  const totalAmount = Math.max(0, subtotal - discountAmount);

  // Prepare attendees array if provided (per-ticket mode)
  let attendeesArray: any[] | null = null;
  if (attendees && attendees.length > 0) {
    attendeesArray = attendees.map(attendee => ({
      ticket_type_id: attendee.ticketTypeId,
      first_name: attendee.firstName,
      last_name: attendee.lastName,
      email: attendee.email,
    }));
  }

  // Call RPC function (parameters must be in order: required first, then optional with defaults)
  const { data: orderId, error } = await supabase.rpc('create_event_booking' as any, {
    p_event_id: draft.eventId,
    p_total_amount: totalAmount,
    p_order_lines: orderLines,
    p_buyer_user_id: buyerUserId,
    p_buyer_first_name: contactInfo.firstName || null,
    p_buyer_last_name: contactInfo.lastName || null,
    p_buyer_email: contactInfo.email || null,
    p_buyer_phone: contactInfo.phone || null,
    p_currency: draft.currency || 'HKD',
    p_attendees: attendeesArray,
  });

  if (error) {
    console.error('Error creating booking:', error);
    throw new Error(error.message || 'Failed to create booking');
  }

  return {
    orderId: orderId as string,
    success: true,
  };
}

