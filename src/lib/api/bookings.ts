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

export interface OrderWithEvent {
  id: string;
  event_id: string;
  buyer_user_id: string | null;
  buyer_first_name: string | null;
  buyer_last_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  total_amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  payment_method: 'stripe' | 'payme' | 'fps' | null;
  payment_status: 'unpaid' | 'submitted' | 'paid' | 'failed' | 'refunded' | null;
  receipt_url: string | null;
  payment_reference_link: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  event: {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    location_text: string | null;
    enable_stripe: boolean | null;
    enable_payme: boolean | null;
    enable_fps: boolean | null;
    payme_link: string | null;
    fps_link: string | null;
    org_id: string;
  };
  order_items: Array<{
    id: string;
    ticket_type_id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    ticket_type: {
      id: string;
      name: string;
    };
  }>;
  tickets: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  }>;
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
      phone: attendee.phone,
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

/**
 * Get order by ID with event and payment config
 */
export async function getOrderWithEvent(orderId: string): Promise<OrderWithEvent | null> {
  // Try to fetch order - this will work for authenticated users or if RLS allows
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      event:events (
        id,
        title,
        start_at,
        end_at,
        location_text,
        enable_stripe,
        enable_payme,
        enable_fps,
        payme_link,
        fps_link,
        org_id
      ),
      order_items (
        id,
        ticket_type_id,
        quantity,
        unit_price,
        subtotal,
        ticket_type:ticket_types (
          id,
          name
        )
      ),
      tickets (
        id,
        first_name,
        last_name,
        email,
        phone
      )
    `)
    .eq('id', orderId)
    .single();

  if (error) {
    console.error('Error fetching order:', error);
    // If it's a permission error, it might be RLS blocking access
    if (error.code === 'PGRST116') {
      return null;
    }
    // Log the full error for debugging
    console.error('Full error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message || 'Failed to fetch order');
  }

  if (!data) {
    return null;
  }

  // Type assertion - Supabase returns the correct structure but TypeScript needs help
  return data as unknown as OrderWithEvent;
}

/**
 * Update order payment information
 */
export async function updateOrderPayment(
  orderId: string,
  paymentMethod: 'stripe' | 'payme' | 'fps',
  receiptUrl?: string,
  paymentReferenceLink?: string
): Promise<void> {
  const updateData: any = {
    payment_method: paymentMethod,
    payment_status: 'submitted',
    submitted_at: new Date().toISOString(),
  };

  if (receiptUrl) {
    updateData.receipt_url = receiptUrl;
  }

  if (paymentReferenceLink) {
    updateData.payment_reference_link = paymentReferenceLink;
  }

  const { error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  if (error) {
    throw new Error(error.message || 'Failed to update order payment');
  }
}
