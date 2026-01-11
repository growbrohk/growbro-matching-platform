import { supabase } from '@/integrations/supabase/client';
import type { Event, TicketType } from '@/lib/types';

/**
 * Convert a string to a URL-friendly slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a unique slug for an event within an org
 */
async function generateUniqueEventSlug(orgId: string, title: string): Promise<string> {
  const baseSlug = slugify(title) || 'event';
  let finalSlug = baseSlug;
  let counter = 0;

  // Check for uniqueness and append counter if needed
  while (true) {
    const { data, error } = await supabase
      .from('events')
      .select('id')
      .eq('org_id', orgId)
      .eq('slug', finalSlug)
      .single();

    if (error && error.code === 'PGRST116') {
      // No existing event with this slug, we're good
      break;
    }

    if (!error) {
      // Slug exists, try next
      counter++;
      finalSlug = `${baseSlug}-${counter}`;
    } else {
      // Some other error, break and use current slug
      break;
    }
  }

  return finalSlug;
}

export interface CreateEventData {
  org_id: string;
  venue_org_id?: string | null;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  status?: 'draft' | 'published' | 'cancelled' | 'completed';
  location_text?: string | null;
  instagram_post_url?: string | null;
  instagram_preview_image_url?: string | null;
  collect_attendee_info?: 'primary' | 'per_ticket';
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
  visibility_mode?: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  is_active?: boolean;
  availability_mode?: 'always' | 'scheduled';
  available_start_at?: string | null;
  available_end_at?: string | null;
}

export interface UpdateTicketTypeData extends Partial<Omit<CreateTicketTypeData, 'event_id'>> {
  id: string;
  visibility_mode?: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  is_active?: boolean;
  availability_mode?: 'always' | 'scheduled';
  available_start_at?: string | null;
  available_end_at?: string | null;
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

  // Update status, description, location_text, instagram_post_url, instagram_preview_image_url, and collect_attendee_info if provided
  const updateFields: any = {};
  if (data.status && data.status !== 'draft') {
    updateFields.status = data.status;
  }
  if (data.description) {
    updateFields.description = data.description;
  }
  if (data.location_text !== undefined) {
    updateFields.location_text = data.location_text;
  }
  if (data.instagram_post_url !== undefined) {
    updateFields.instagram_post_url = data.instagram_post_url;
  }
  if (data.instagram_preview_image_url !== undefined) {
    updateFields.instagram_preview_image_url = data.instagram_preview_image_url;
  }
  if (data.collect_attendee_info !== undefined) {
    updateFields.collect_attendee_info = data.collect_attendee_info;
  }

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabase
      .from('events')
      .update(updateFields)
      .eq('id', eventId);

    if (updateError) {
      console.warn('Failed to update event fields:', updateError);
    }
  }

  // Generate and set slug if not already set
  // Note: Using RPC or direct SQL since slug column may not be in types yet
  try {
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    const eventWithSlug = eventData as any;
    if (!eventWithSlug?.slug) {
      const generatedSlug = await generateUniqueEventSlug(data.org_id, data.title);
      const { error: slugError } = await supabase
        .from('events')
        .update({ slug: generatedSlug } as any)
        .eq('id', eventId);

      if (slugError) {
        console.warn('Failed to set event slug:', slugError);
      }
    }
  } catch (err) {
    // If slug column doesn't exist yet, skip (migration may not have run)
    console.warn('Could not check/set slug:', err);
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

  return updatedEvent as Event & { slug?: string };
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

  // Update metadata and visibility fields if provided
  const updateFields: any = {};
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    updateFields.metadata = data.metadata;
  }
  if (data.visibility_mode !== undefined) {
    updateFields.visibility_mode = data.visibility_mode;
  }
  if (data.access_code !== undefined) {
    updateFields.access_code = data.access_code;
  }
  if (data.allowed_affiliates !== undefined) {
    updateFields.allowed_affiliates = data.allowed_affiliates;
  }
  if (data.is_active !== undefined) {
    updateFields.is_active = data.is_active;
  }
  if (data.availability_mode !== undefined) {
    updateFields.availability_mode = data.availability_mode;
  }
  if (data.available_start_at !== undefined) {
    updateFields.available_start_at = data.available_start_at;
  }
  if (data.available_end_at !== undefined) {
    updateFields.available_end_at = data.available_end_at;
  }

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabase
      .from('ticket_types')
      .update(updateFields)
      .eq('id', ticketTypeId);

    if (updateError) {
      console.warn('Failed to update ticket type fields:', updateError);
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

/**
 * Get organization by slug
 */
export async function getOrgBySlug(orgSlug: string) {
  const { data, error } = await supabase
    .from('orgs')
    .select('*')
    .eq('slug', orgSlug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message || 'Failed to fetch organization');
  }

  return data;
}

/**
 * Get published event by org slug and event slug
 * Used for public event pages
 */
export async function getPublicEventBySlugs(orgSlug: string, eventSlug: string): Promise<Event | null> {
  // First, get the org by slug
  const org = await getOrgBySlug(orgSlug);
  if (!org) {
    return null;
  }

  // Then, get the published event by org_id and slug
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('org_id', org.id)
    .eq('slug', eventSlug)
    .eq('status', 'published')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(error.message || 'Failed to fetch event');
  }

  return data as Event;
}

