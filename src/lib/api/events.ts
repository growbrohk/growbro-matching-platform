import { supabase } from '@/integrations/supabase/client';
import type { Event, TicketType, TicketTypeAccessVariant } from '@/lib/types';

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
  day_2_start_at?: string | null;
  day_2_end_at?: string | null;
  status?: 'draft' | 'published' | 'cancelled' | 'completed';
  location_text?: string | null;
  instagram_preview_image_url?: string | null;
  /** Landscape image for Facebook/WhatsApp OG (preferred over instagram preview) */
  og_preview_image_url?: string | null;
  collect_attendee_info?: 'primary' | 'per_ticket';
  enable_stripe?: boolean | null;
  enable_payme?: boolean | null;
  enable_fps?: boolean | null;
  payme_link?: string | null;
  fps_link?: string | null;
  stripe_fee_bearer?: 'host' | 'user' | null;
  metadata?: Record<string, any>;
}

export interface UpdateEventData extends Partial<Omit<CreateEventData, 'org_id'>> {
  id: string;
}

export interface TicketTypeAccessVariantInput {
  visibility_mode: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  price_override?: number | null;
  discount_percent?: number | null;
  quota?: number | null;
  is_active?: boolean;
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
  access_variants?: TicketTypeAccessVariantInput[];
  is_active?: boolean;
  availability_mode?: 'always' | 'scheduled';
  available_start_at?: string | null;
  available_end_at?: string | null;
  valid_for_days?: 'day_1' | 'day_2' | 'both';
  show_remaining_count?: boolean;
  threshold_to_show?: number | null;
  description?: string | null;
}

export interface UpdateTicketTypeData extends Partial<Omit<CreateTicketTypeData, 'event_id'>> {
  id: string;
  visibility_mode?: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  access_variants?: TicketTypeAccessVariantInput[];
  is_active?: boolean;
  availability_mode?: 'always' | 'scheduled';
  available_start_at?: string | null;
  available_end_at?: string | null;
  valid_for_days?: 'day_1' | 'day_2' | 'both';
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

  // Update status, description, location_text, instagram_preview_image_url, collect_attendee_info, and payment fields if provided
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
  if (data.instagram_preview_image_url !== undefined) {
    updateFields.instagram_preview_image_url = data.instagram_preview_image_url;
  }
  if (data.og_preview_image_url !== undefined) {
    updateFields.og_preview_image_url = data.og_preview_image_url;
  }
  if (data.collect_attendee_info !== undefined) {
    updateFields.collect_attendee_info = data.collect_attendee_info;
  }
  if (data.enable_stripe !== undefined) {
    updateFields.enable_stripe = data.enable_stripe;
  }
  if (data.enable_payme !== undefined) {
    updateFields.enable_payme = data.enable_payme;
  }
  if (data.enable_fps !== undefined) {
    updateFields.enable_fps = data.enable_fps;
  }
  if (data.payme_link !== undefined) {
    updateFields.payme_link = data.payme_link;
  }
  if (data.fps_link !== undefined) {
    updateFields.fps_link = data.fps_link;
  }
  if (data.stripe_fee_bearer !== undefined) {
    updateFields.stripe_fee_bearer = data.stripe_fee_bearer;
  }
  if (data.metadata !== undefined && data.metadata !== null) {
    updateFields.metadata = data.metadata;
  }
  if (data.day_2_start_at !== undefined) {
    updateFields.day_2_start_at = data.day_2_start_at;
  }
  if (data.day_2_end_at !== undefined) {
    updateFields.day_2_end_at = data.day_2_end_at;
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
  const { id, ...rest } = data;
  const updateData = { ...rest } as Record<string, unknown>;
  delete updateData.org_id;

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
 * Delete an event and all related data (orders, receipt photos, event preview photos).
 * CASCADE removes: orders, order_items, order_addon_items, tickets, ticket_types, event_addon_products.
 */
export async function deleteEvent(eventId: string, orgId: string): Promise<void> {
  // 1. Fetch orders for the event (before delete - we need order IDs and receipt_url)
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, receipt_url')
    .eq('event_id', eventId);

  if (ordersError) {
    throw new Error(ordersError.message || 'Failed to fetch orders');
  }

  // 2. Delete payment receipt files for each order
  if (orders && orders.length > 0) {
    const receiptDeletePromises = orders
      .filter((o) => o.receipt_url && String(o.receipt_url).trim())
      .map(async (order) => {
        let path = String(order.receipt_url!).trim();
        if (path.startsWith('payment-receipts/')) {
          path = path.replace(/^payment-receipts\//, '');
        }
        if (path.startsWith('http://') || path.startsWith('https://')) {
          try {
            const url = new URL(path);
            const pathParts = url.pathname.split('/');
            const bucketIndex = pathParts.findIndex((p) => p === 'payment-receipts');
            if (bucketIndex !== -1) {
              path = pathParts.slice(bucketIndex + 1).join('/');
            }
          } catch {
            return;
          }
        }
        try {
          await supabase.storage.from('payment-receipts').remove([path]);
        } catch (err) {
          console.warn('Failed to delete receipt file:', path, err);
        }
      });
    await Promise.all(receiptDeletePromises);
  }

  // 3. Delete event preview photos from event-previews bucket
  const previewPrefix = `${orgId}/${eventId}`;
  try {
    const { data: files, error: listError } = await supabase.storage
      .from('event-previews')
      .list(previewPrefix, { limit: 100 });

    if (!listError && files && files.length > 0) {
      const pathsToRemove = files
        .filter((f) => f.name)
        .map((f) => `${previewPrefix}/${f.name}`);
      if (pathsToRemove.length > 0) {
        await supabase.storage.from('event-previews').remove(pathsToRemove);
      }
    }
  } catch (err) {
    console.warn('Failed to delete event preview photos:', err);
    // Proceed with event delete - preview may not exist
  }

  // 4. Delete the event (CASCADE handles orders, ticket_types, event_addon_products, etc.)
  const { error: deleteError } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('org_id', orgId);

  if (deleteError) {
    throw new Error(deleteError.message || 'Failed to delete event');
  }
}

/**
 * Get all events for an organization
 */
export async function getEvents(orgId: string): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch events');
  }

  return (data || []) as Event[];
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
  if (data.show_remaining_count !== undefined) {
    updateFields.show_remaining_count = data.show_remaining_count;
  }
  if (data.threshold_to_show !== undefined) {
    updateFields.threshold_to_show = data.threshold_to_show;
  }
  if (data.valid_for_days !== undefined) {
    updateFields.valid_for_days = data.valid_for_days;
  }
  if (data.description !== undefined) {
    updateFields.description = data.description;
  }

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabase
      .from('ticket_types')
      .update(updateFields)
      .eq('id', ticketTypeId);

    if (updateError) {
      throw new Error(updateError.message || 'Failed to update ticket type fields');
    }
  }

  // Sync access variants: use access_variants if provided, else create one from legacy fields
  if (data.access_variants !== undefined && data.access_variants.length > 0) {
    await syncTicketTypeAccessVariants(ticketTypeId, data.access_variants);
  } else {
    // Legacy: create single variant from visibility_mode/access_code/allowed_affiliates
    const mode = data.visibility_mode ?? 'public';
    await syncTicketTypeAccessVariants(ticketTypeId, [
      {
        visibility_mode: mode,
        access_code: mode === 'code' ? (data.access_code ?? null) : null,
        allowed_affiliates: mode === 'affiliate' ? (data.allowed_affiliates ?? null) : null,
      },
    ]);
  }

  const { data: updatedTicketType, error: finalError } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('id', ticketTypeId)
    .single();

  if (finalError) {
    throw new Error(finalError.message || 'Failed to fetch updated ticket type');
  }

  const result = updatedTicketType as TicketType;
  if (data.access_variants !== undefined) {
    result.access_variants = (await getTicketTypeAccessVariants([ticketTypeId])).filter(
      (v) => v.ticket_type_id === ticketTypeId
    );
  }
  return result;
}

/**
 * Update an existing ticket type
 */
export async function updateTicketType(data: UpdateTicketTypeData): Promise<TicketType> {
  const { id, access_variants, ...updateData } = data;

  const { data: ticketType, error } = await supabase
    .from('ticket_types')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to update ticket type');
  }

  const result = ticketType as TicketType;

  if (access_variants !== undefined) {
    await syncTicketTypeAccessVariants(id, access_variants);
    result.access_variants = (await getTicketTypeAccessVariants([id])).filter((v) => v.ticket_type_id === id);
  }

  return result;
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
 * Sync access variants for a ticket type. Replaces all existing variants with the provided list.
 * Also updates ticket_types.visibility_mode, access_code, allowed_affiliates for legacy fallback.
 */
async function syncTicketTypeAccessVariants(
  ticketTypeId: string,
  variants: TicketTypeAccessVariantInput[]
): Promise<void> {
  // Delete existing variants
  await supabase.from('ticket_type_access_variants').delete().eq('ticket_type_id', ticketTypeId);

  // Pick primary variant for legacy fallback: prefer public so ticket shows without code when variants fail to load
  const primary =
    variants.find((v) => v.visibility_mode === 'public') ||
    variants.find((v) => v.visibility_mode === 'code') ||
    variants.find((v) => v.visibility_mode === 'affiliate') ||
    variants[0];
  const legacyUpdate: Record<string, unknown> = {
    visibility_mode: primary?.visibility_mode ?? 'public',
    access_code: primary?.visibility_mode === 'code' ? (primary.access_code || null) : null,
    allowed_affiliates: primary?.visibility_mode === 'affiliate' ? (primary.allowed_affiliates || null) : null,
  };
  await supabase.from('ticket_types').update(legacyUpdate).eq('id', ticketTypeId);

  if (variants.length === 0) return;

  const rows = variants.map((v) => ({
    ticket_type_id: ticketTypeId,
    visibility_mode: v.visibility_mode,
    access_code: v.visibility_mode === 'code' ? (v.access_code || null) : null,
    allowed_affiliates: v.visibility_mode === 'affiliate' ? (v.allowed_affiliates || null) : null,
    price_override: v.price_override ?? null,
    discount_percent: v.discount_percent ?? null,
    quota: v.quota ?? null,
    is_active: v.is_active !== false,
  }));

  const { error } = await supabase.from('ticket_type_access_variants').insert(rows);

  if (error) {
    throw new Error(error.message || 'Failed to sync access variants');
  }
}

/**
 * Fetch access variants for given ticket type IDs
 */
export async function getTicketTypeAccessVariants(ticketTypeIds: string[]): Promise<TicketTypeAccessVariant[]> {
  if (ticketTypeIds.length === 0) return [];

  const { data, error } = await supabase
    .from('ticket_type_access_variants')
    .select('*')
    .in('ticket_type_id', ticketTypeIds)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to fetch access variants');
  }

  return (data || []) as TicketTypeAccessVariant[];
}

/**
 * Fetch remaining count per variant (for variants with quota)
 */
export async function getVariantRemainingCounts(eventId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('get_variant_remaining_counts', {
    p_event_id: eventId,
  });

  if (error) {
    console.warn('[getVariantRemainingCounts] Failed:', error);
    return new Map();
  }

  const result = new Map<string, number>();
  for (const row of (data || []) as { variant_id: string; sold_count: number; quota: number }[]) {
    const remaining = Math.max(0, (row.quota ?? 0) - (row.sold_count ?? 0));
    result.set(row.variant_id, remaining);
  }
  return result;
}

/**
 * Get all ticket types for an event
 * Optionally includes remaining_count if useRemainingCount is true
 * Optionally includes access_variants if includeAccessVariants is true
 */
export async function getTicketTypes(
  eventId: string,
  useRemainingCount: boolean = false,
  includeAccessVariants: boolean = false
): Promise<TicketType[]> {
  let ticketTypes: TicketType[];

  if (useRemainingCount) {
    const { data, error } = await supabase.rpc('get_ticket_types_with_remaining', {
      p_event_id: eventId
    });

    if (error) {
      throw new Error(error.message || 'Failed to fetch ticket types');
    }

    ticketTypes = (data || []) as TicketType[];
  } else {
    const { data, error } = await supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Failed to fetch ticket types');
    }

    ticketTypes = (data || []) as TicketType[];
  }

  if (includeAccessVariants && ticketTypes.length > 0) {
    try {
      const [variants, variantRemaining] = await Promise.all([
        getTicketTypeAccessVariants(ticketTypes.map((tt) => tt.id)),
        getVariantRemainingCounts(eventId),
      ]);
      const variantsByTicketType = new Map<string, TicketTypeAccessVariant[]>();
      for (const v of variants) {
        const ticketTypeId = (v as any).ticket_type_id ?? v.ticket_type_id;
        const list = variantsByTicketType.get(ticketTypeId) || [];
        const remaining = v.quota != null ? variantRemaining.get(v.id) : undefined;
        list.push({ ...v, remaining_count: remaining });
        variantsByTicketType.set(ticketTypeId, list);
      }
      ticketTypes = ticketTypes.map((tt) => ({
        ...tt,
        access_variants: variantsByTicketType.get(tt.id) || [],
      }));
    } catch (err) {
      console.warn('[getTicketTypes] Failed to fetch access variants, using legacy visibility:', err);
      // Continue with empty access_variants - PublicEventForm will use legacy visibility_mode/access_code
    }
  }

  return ticketTypes;
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

