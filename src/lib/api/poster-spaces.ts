import { supabase } from '@/integrations/supabase/client';

export type PosterSpaceCategory = 
  | 'poster_space' 
  | 'consignment_shelf' 
  | 'cup_sleeve_promotion' 
  | 'event_hosting'
  | 'poster' // Legacy - maps to 'poster_space'
  | 'shelf' // Legacy
  | 'booth' // Legacy
  | 'counter' // Legacy
  | 'other'; // Legacy

export interface PosterSpace {
  id: string;
  org_id: string;
  title: string;
  category: PosterSpaceCategory;
  short_description: string | null;
  bullets: string[];
  photos: string[];
  booking_unit: 'week' | 'day' | 'month';
  allowed_durations: number[];
  price_cents: number | null;
  currency: string;
  approval_flow: 'request_approve';
  blackout_ranges: Array<{ start: string; end: string }>;
  tracking_enabled: boolean;
  tracking_prefix: string | null;
  status: 'draft' | 'published' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface PosterSpaceBookingRequest {
  id: string;
  poster_space_id: string;
  requester_user_id: string | null;
  requester_name: string | null;
  requester_email: string | null;
  message: string | null;
  requested_start_date: string;
  duration_units: number;
  computed_end_date: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  created_at: string;
}

export interface UpsertPosterSpaceInput {
  id?: string;
  org_id: string;
  title: string;
  category?: PosterSpaceCategory;
  short_description?: string | null;
  bullets?: string[];
  photos?: string[];
  booking_unit?: 'week' | 'day' | 'month';
  allowed_durations?: number[];
  price_cents?: number | null;
  currency?: string;
  approval_flow?: 'request_approve';
  blackout_ranges?: Array<{ start: string; end: string }>;
  tracking_enabled?: boolean;
  tracking_prefix?: string | null;
  status?: 'draft' | 'published' | 'paused' | 'archived';
}

export interface CreateBookingRequestInput {
  poster_space_id: string;
  requester_user_id?: string | null;
  requester_name?: string;
  requester_email?: string;
  message?: string | null;
  requested_start_date: string;
  duration_units: number;
  computed_end_date: string;
}

/**
 * Fetch a single poster space by ID
 */
export async function getPosterSpace(spaceId: string): Promise<PosterSpace | null> {
  const { data, error } = await supabase
    .from('poster_spaces')
    .select('*')
    .eq('id', spaceId)
    .single();

  if (error) {
    console.error('Error fetching poster space:', error);
    throw error;
  }

  return data as PosterSpace | null;
}

/**
 * Fetch a published poster space by org slug and space ID (for public pages)
 */
export async function getPublicPosterSpace(
  orgSlug: string,
  spaceId: string
): Promise<{ space: PosterSpace; org: any } | null> {
  const { data, error } = await supabase
    .from('poster_spaces')
    .select(`
      *,
      orgs!inner (
        id,
        name,
        slug
      )
    `)
    .eq('id', spaceId)
    .eq('status', 'published')
    .eq('orgs.slug', orgSlug)
    .single();

  if (error) {
    console.error('Error fetching public poster space:', error);
    return null;
  }

  if (!data) return null;

  const { orgs, ...space } = data as any;
  return {
    space: space as PosterSpace,
    org: orgs,
  };
}

/**
 * Fetch all poster spaces for an org
 */
export async function getPosterSpacesByOrg(orgId: string): Promise<PosterSpace[]> {
  const { data, error } = await supabase
    .from('poster_spaces')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching poster spaces:', error);
    throw error;
  }

  return (data || []) as PosterSpace[];
}

/**
 * Create or update a poster space
 */
export async function upsertPosterSpace(input: UpsertPosterSpaceInput): Promise<PosterSpace> {
  const { id, ...data } = input;

  if (id) {
    // Update existing
    const { data: updated, error } = await supabase
      .from('poster_spaces')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating poster space:', error);
      throw error;
    }

    return updated as PosterSpace;
  } else {
    // Create new
    const { data: created, error } = await supabase
      .from('poster_spaces')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating poster space:', error);
      throw error;
    }

    return created as PosterSpace;
  }
}

/**
 * Delete a poster space
 */
export async function deletePosterSpace(spaceId: string): Promise<void> {
  const { error } = await supabase
    .from('poster_spaces')
    .delete()
    .eq('id', spaceId);

  if (error) {
    console.error('Error deleting poster space:', error);
    throw error;
  }
}

/**
 * Create a booking request
 */
export async function createBookingRequest(
  input: CreateBookingRequestInput
): Promise<PosterSpaceBookingRequest> {
  const { data, error } = await supabase
    .from('poster_space_booking_requests')
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error('Error creating booking request:', error);
    throw error;
  }

  return data as PosterSpaceBookingRequest;
}

/**
 * Get booking requests for a poster space (org members only)
 */
export async function getBookingRequestsForSpace(
  spaceId: string
): Promise<PosterSpaceBookingRequest[]> {
  const { data, error } = await supabase
    .from('poster_space_booking_requests')
    .select('*')
    .eq('poster_space_id', spaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching booking requests:', error);
    throw error;
  }

  return (data || []) as PosterSpaceBookingRequest[];
}

/**
 * Update booking request status
 */
export async function updateBookingRequestStatus(
  requestId: string,
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
): Promise<PosterSpaceBookingRequest> {
  const { data, error } = await supabase
    .from('poster_space_booking_requests')
    .update({ status })
    .eq('id', requestId)
    .select()
    .single();

  if (error) {
    console.error('Error updating booking request:', error);
    throw error;
  }

  return data as PosterSpaceBookingRequest;
}

/**
 * Upload a photo to poster-spaces storage bucket
 */
export async function uploadPosterSpacePhoto(
  orgId: string,
  spaceId: string,
  file: File
): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${orgId}/${spaceId}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('poster-spaces')
    .upload(fileName, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    console.error('Error uploading photo:', uploadError);
    throw uploadError;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('poster-spaces')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

/**
 * Delete a photo from storage
 */
export async function deletePosterSpacePhoto(photoUrl: string): Promise<void> {
  // Extract path from URL
  const url = new URL(photoUrl);
  const pathParts = url.pathname.split('/');
  const bucketIndex = pathParts.findIndex((p) => p === 'poster-spaces');
  if (bucketIndex === -1) {
    throw new Error('Invalid photo URL');
  }
  const filePath = pathParts.slice(bucketIndex + 1).join('/');

  const { error } = await supabase.storage
    .from('poster-spaces')
    .remove([filePath]);

  if (error) {
    console.error('Error deleting photo:', error);
    throw error;
  }
}

/**
 * Compute end date based on booking unit and duration
 */
export function computeEndDate(
  startDate: string,
  bookingUnit: 'week' | 'day' | 'month',
  durationUnits: number
): string {
  const start = new Date(startDate);
  let end: Date;

  switch (bookingUnit) {
    case 'day':
      end = new Date(start);
      end.setDate(end.getDate() + durationUnits - 1);
      break;
    case 'week':
      end = new Date(start);
      end.setDate(end.getDate() + durationUnits * 7 - 1);
      break;
    case 'month':
      end = new Date(start);
      end.setMonth(end.getMonth() + durationUnits);
      end.setDate(end.getDate() - 1);
      break;
    default:
      throw new Error(`Unknown booking unit: ${bookingUnit}`);
  }

  return end.toISOString().split('T')[0];
}

/**
 * Check if a date range overlaps with any blackout ranges
 */
export function checkBlackoutOverlap(
  startDate: string,
  endDate: string,
  blackoutRanges: Array<{ start: string; end: string }>
): boolean {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return blackoutRanges.some((range) => {
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);
    // Check for overlap: ranges overlap if start <= rangeEnd && end >= rangeStart
    return start <= rangeEnd && end >= rangeStart;
  });
}

