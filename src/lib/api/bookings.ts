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
 * Uses RPC function to ensure tickets are ALWAYS returned (works for anon users)
 */
export async function getOrderWithEvent(orderId: string): Promise<OrderWithEvent | null> {
  // Use RPC function for secure fetching (works for anon users)
  // Type assertion needed because RPC function is not yet in generated types
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_order_with_event_and_tickets' as any, {
    p_order_id: orderId,
  }) as { data: any; error: any };

  if (rpcError) {
    console.error('Error fetching order via RPC:', rpcError);
    throw new Error(rpcError.message || 'Failed to fetch order');
  }

  if (!rpcData || !rpcData.order) {
    return null;
  }

  // Transform RPC JSONB response to OrderWithEvent format
  const orderData = rpcData.order;
  const eventData = rpcData.event;
  const orderItems = rpcData.order_items || [];
  const tickets = rpcData.tickets || [];

  // Ensure tickets array is always present (this is the source of truth for quantity)
  if (!Array.isArray(tickets)) {
    console.warn('Tickets data is not an array:', tickets);
  }

  const result: OrderWithEvent = {
    id: orderData.id,
    event_id: orderData.event_id,
    buyer_user_id: orderData.buyer_user_id,
    buyer_first_name: orderData.buyer_first_name,
    buyer_last_name: orderData.buyer_last_name,
    buyer_email: orderData.buyer_email,
    buyer_phone: orderData.buyer_phone,
    total_amount: Number(orderData.total_amount),
    currency: orderData.currency || 'HKD',
    status: orderData.status,
    payment_method: orderData.payment_method,
    payment_status: orderData.payment_status,
    receipt_url: orderData.receipt_url,
    payment_reference_link: orderData.payment_reference_link,
    submitted_at: orderData.submitted_at,
    created_at: orderData.created_at,
    updated_at: orderData.updated_at,
    event: {
      id: eventData.id,
      title: eventData.title,
      start_at: eventData.start_at,
      end_at: eventData.end_at,
      location_text: eventData.location_text,
      enable_stripe: eventData.enable_stripe,
      enable_payme: eventData.enable_payme,
      enable_fps: eventData.enable_fps,
      payme_link: eventData.payme_link,
      fps_link: eventData.fps_link,
      org_id: eventData.org_id,
    },
    order_items: orderItems.map((item: any) => ({
      id: item.id,
      ticket_type_id: item.ticket_type_id,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
      ticket_type: {
        id: item.ticket_type.id,
        name: item.ticket_type.name,
      },
    })),
    tickets: Array.isArray(tickets) ? tickets.map((ticket: any) => ({
      id: ticket.id,
      first_name: ticket.first_name,
      last_name: ticket.last_name,
      email: ticket.email,
      phone: ticket.phone,
    })) : [],
  };

  return result;
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
