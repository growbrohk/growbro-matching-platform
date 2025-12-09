/**
 * Ticketing API Layer
 * Handles all event and ticket CRUD operations
 */

import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/lib/types';
import {
  EventRecord,
  TicketProductRecord,
  TicketRecord,
  EventWithTicketProducts,
  EventFormData,
  TicketProductFormData,
} from '@/lib/types/ticketing';

/**
 * Get all events for a brand
 */
export async function getEventsForBrand(
  brandId: string
): Promise<{ data: EventRecord[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('brand_id', brandId)
      .order('date_start', { ascending: false });

    if (error) throw error;

    return { data: (data as EventRecord[]) || [], error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get a single event with its ticket products
 */
export async function getEventWithTickets(
  eventId: string,
  profile: Profile
): Promise<{ data: EventWithTicketProducts | null; error: Error | null }> {
  try {
    // First verify ownership
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('brand_id', profile.id)
      .single();

    if (eventError || !event) {
      return {
        data: null,
        error: new Error('Event not found or you do not have permission to access it'),
      };
    }

    // Get ticket products
    const { data: ticketProducts, error: ticketProductsError } = await supabase
      .from('ticket_products')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (ticketProductsError) throw ticketProductsError;

    return {
      data: {
        ...(event as EventRecord),
        ticket_products: (ticketProducts as TicketProductRecord[]) || [],
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Create or update an event with ticket products
 */
export async function createOrUpdateEvent(
  eventData: EventFormData,
  ticketProductsData: TicketProductFormData[],
  profile: Profile,
  eventId?: string
): Promise<{ data: EventRecord | null; error: Error | null }> {
  try {
    // Validate
    if (!eventData.name.trim()) {
      return { data: null, error: new Error('Event name is required') };
    }

    if (!eventData.date_start || !eventData.date_end) {
      return { data: null, error: new Error('Event start and end dates are required') };
    }

    if (ticketProductsData.length === 0) {
      return { data: null, error: new Error('At least one ticket type is required') };
    }

    // Validate ticket products
    for (const ticketProduct of ticketProductsData) {
      if (!ticketProduct.name.trim()) {
        return { data: null, error: new Error('All ticket types must have a name') };
      }
      if (ticketProduct.price <= 0) {
        return { data: null, error: new Error('All ticket types must have a price greater than 0') };
      }
      if (ticketProduct.capacity_total <= 0) {
        return { data: null, error: new Error('All ticket types must have a capacity greater than 0') };
      }
    }

    let event: EventRecord;

    if (eventId) {
      // Update existing event
      const { data: updatedEvent, error: updateError } = await supabase
        .from('events')
        .update({
          name: eventData.name.trim(),
          description: eventData.description?.trim() || null,
          category: eventData.category || null,
          cover_image_url: eventData.cover_image_url?.trim() || null,
          date_start: eventData.date_start,
          date_end: eventData.date_end,
          location_name: eventData.location_name?.trim() || null,
          location_address: eventData.location_address?.trim() || null,
          location_map_url: eventData.location_map_url?.trim() || null,
          organizer_name: eventData.organizer_name?.trim() || null,
          admission_settings: eventData.admission_settings || null,
          event_password: eventData.visibility === 'password_protected' ? eventData.event_password : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .eq('brand_id', profile.id)
        .select()
        .single();

      if (updateError) throw updateError;
      if (!updatedEvent) {
        return { data: null, error: new Error('Event not found or you do not have permission to update it') };
      }

      event = updatedEvent as EventRecord;

      // Delete existing ticket products and recreate them
      const { error: deleteError } = await supabase
        .from('ticket_products')
        .delete()
        .eq('event_id', eventId);

      if (deleteError) throw deleteError;
    } else {
      // Create new event
      const { data: newEvent, error: createError } = await supabase
        .from('events')
        .insert({
          brand_id: profile.id,
          name: eventData.name.trim(),
          description: eventData.description?.trim() || null,
          category: eventData.category || null,
          cover_image_url: eventData.cover_image_url?.trim() || null,
          date_start: eventData.date_start,
          date_end: eventData.date_end,
          location_name: eventData.location_name?.trim() || null,
          location_address: eventData.location_address?.trim() || null,
          location_map_url: eventData.location_map_url?.trim() || null,
          organizer_name: eventData.organizer_name?.trim() || null,
          admission_settings: eventData.admission_settings || null,
          event_password: eventData.visibility === 'password_protected' ? eventData.event_password : null,
        })
        .select()
        .single();

      if (createError) throw createError;
      event = newEvent as EventRecord;
    }

    // Create ticket products
    const ticketProductsToInsert = ticketProductsData.map((tp) => ({
      event_id: event.id,
      name: tp.name.trim(),
      description: tp.description?.trim() || null,
      price: Math.round(tp.price * 100), // Convert dollars to cents (stored as numeric in DB)
      currency: tp.currency || 'HKD',
      capacity_total: tp.capacity_total,
      capacity_remaining: tp.capacity_total, // Initially all remaining
      sales_start: tp.sales_start || null,
      sales_end: tp.sales_end || null,
      max_per_customer: tp.max_per_customer || null,
      wave_label: tp.wave_label?.trim() || null,
      valid_from: tp.valid_from || null,
      valid_until: tp.valid_until || null,
      require_holder_name: tp.require_holder_name,
      require_holder_email: tp.require_holder_email,
      allow_transfer: tp.allow_transfer,
      allow_reentry: tp.allow_reentry,
    }));

    const { error: ticketProductsError } = await supabase
      .from('ticket_products')
      .insert(ticketProductsToInsert);

    if (ticketProductsError) throw ticketProductsError;

    // Create or update associated product row
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('event_id', event.id)
      .maybeSingle();

    const productData = {
      brand_user_id: profile.id, // For brand products, equals owner_user_id (enforced by constraint)
      owner_type: 'brand' as const,
      owner_user_id: profile.id, // For brand products, equals brand_user_id
      product_type: 'event' as const,
      name: eventData.name,
      slug: event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      category: 'Event',
      short_description: eventData.description || null,
      thumbnail_url: eventData.cover_image_url || null,
      price_in_cents: ticketProductsData[0] ? Math.round(ticketProductsData[0].price * 100) : 0,
      currency: ticketProductsData[0]?.currency || 'hkd',
      is_purchasable: eventData.is_purchasable,
      is_public: eventData.is_public && eventData.visibility === 'public',
      is_active: eventData.is_active,
      event_id: event.id, // Link to the event
    };

    if (existingProduct) {
      const { error: updateProductError } = await supabase
        .from('products')
        .update(productData)
        .eq('id', existingProduct.id);

      if (updateProductError) throw updateProductError;
    } else {
      const { error: createProductError } = await supabase
        .from('products')
        .insert(productData);

      if (createProductError) throw createProductError;
    }

    return { data: event, error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Delete an event
 */
export async function deleteEvent(
  eventId: string,
  profile: Profile
): Promise<{ error: Error | null }> {
  try {
    // Verify ownership
    const { data: event, error: fetchError } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('brand_id', profile.id)
      .single();

    if (fetchError || !event) {
      return {
        error: new Error('Event not found or you do not have permission to delete it'),
      };
    }

    // Delete event (cascade will delete ticket_products and tickets)
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)
      .eq('brand_id', profile.id);

    if (error) throw error;

    // Also delete associated product
    await supabase.from('products').delete().eq('event_id', eventId);

    return { error: null };
  } catch (error: any) {
    return { error: error as Error };
  }
}

/**
 * Generate tickets for an order (stubbed for now)
 */
export async function generateTicketsForOrder(
  orderId: string,
  ticketProductId: string,
  quantity: number,
  holderInfoArray?: Array<{ name?: string; email?: string; phone?: string }>
): Promise<{ data: TicketRecord[] | null; error: Error | null }> {
  // This will be implemented later when order system is ready
  return { data: null, error: new Error('Not yet implemented') };
}

