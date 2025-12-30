import { supabase } from '@/integrations/supabase/client';
import type { Event, TicketType } from '@/lib/types';

export interface CreateEventData {
  org_id: string;
  venue_org_id?: string | null;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  status?: 'draft' | 'published' | 'cancelled' | 'completed';
  metadata?: Record<string, any>;
}

export interface UpdateEventData extends Partial<Omit<CreateEventData, 'org_id'>> {
  id: string;
}

export interface CreateTicketTypeData {
  event_id: string;
  name: string;
  price: number;
  quota: number;
  metadata?: Record<string, any>;
}

export interface UpdateTicketTypeData extends Partial<Omit<CreateTicketTypeData, 'event_id'>> {
  id: string;
}

/**
 * Create a new event using the RPC function
 */
export async function createEvent(data: CreateEventData): Promise<Event> {
  const { data: eventId, error } = await supabase.rpc('create_event', {
    p_org_id: data.org_id,
    p_venue_org_id: data.venue_org_id || null,
    p_title: data.title,
    p_start_at: data.start_at,
    p_end_at: data.end_at,
    p_metadata: data.metadata || {},
  });

  if (error) {
    throw new Error(error.message || 'Failed to create event');
  }

  // Fetch the created event
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message || 'Failed to fetch created event');
  }

  // Update status if provided
  if (data.status && data.status !== 'draft') {
    const { error: updateError } = await supabase
      .from('events')
      .update({ status: data.status, description: data.description })
      .eq('id', eventId);

    if (updateError) {
      console.warn('Failed to update event status:', updateError);
    }
  } else if (data.description) {
    const { error: updateError } = await supabase
      .from('events')
      .update({ description: data.description })
      .eq('id', eventId);

    if (updateError) {
      console.warn('Failed to update event description:', updateError);
    }
  }

  // Fetch updated event
  const { data: updatedEvent, error: finalError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (finalError) {
    throw new Error(finalError.message || 'Failed to fetch updated event');
  }

  return updatedEvent as Event;
}

/**
 * Update an existing event
 */
export async function updateEvent(data: UpdateEventData): Promise<Event> {
  const { id, ...updateData } = data;

  const { data: event, error } = await supabase
    .from('events')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to update event');
  }

  return event as Event;
}

/**
 * Get a single event by ID
 */
export async function getEvent(eventId: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message || 'Failed to fetch event');
  }

  return data as Event;
}

/**
 * Create a ticket type using the RPC function
 */
export async function createTicketType(data: CreateTicketTypeData): Promise<TicketType> {
  const { data: ticketTypeId, error } = await supabase.rpc('create_ticket_type', {
    p_event_id: data.event_id,
    p_name: data.name,
    p_price: data.price,
    p_quota: data.quota,
  });

  if (error) {
    throw new Error(error.message || 'Failed to create ticket type');
  }

  // Fetch the created ticket type
  const { data: ticketType, error: fetchError } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('id', ticketTypeId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message || 'Failed to fetch created ticket type');
  }

  // Update metadata if provided
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    const { error: updateError } = await supabase
      .from('ticket_types')
      .update({ metadata: data.metadata })
      .eq('id', ticketTypeId);

    if (updateError) {
      console.warn('Failed to update ticket type metadata:', updateError);
    }

    const { data: updatedTicketType, error: finalError } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('id', ticketTypeId)
      .single();

    if (finalError) {
      throw new Error(finalError.message || 'Failed to fetch updated ticket type');
    }

    return updatedTicketType as TicketType;
  }

  return ticketType as TicketType;
}

/**
 * Update an existing ticket type
 */
export async function updateTicketType(data: UpdateTicketTypeData): Promise<TicketType> {
  const { id, ...updateData } = data;

  const { data: ticketType, error } = await supabase
    .from('ticket_types')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to update ticket type');
  }

  return ticketType as TicketType;
}

/**
 * Delete a ticket type
 */
export async function deleteTicketType(ticketTypeId: string): Promise<void> {
  const { error } = await supabase
    .from('ticket_types')
    .delete()
    .eq('id', ticketTypeId);

  if (error) {
    throw new Error(error.message || 'Failed to delete ticket type');
  }
}

/**
 * Get all ticket types for an event
 */
export async function getTicketTypes(eventId: string): Promise<TicketType[]> {
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to fetch ticket types');
  }

  return (data || []) as TicketType[];
}

