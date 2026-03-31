import { supabase } from '@/integrations/supabase/client';
import { generateShortCode } from '@/lib/utils/short-code';

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
  short_code: string;
  title: string;
  category: PosterSpaceCategory;
  kind: 'consignment' | 'promotion' | 'event_hosting';
  subtype: 'poster' | 'cupsleeve' | null;
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
  default_host_split_percent: number;
  listing_fee_cents: number;
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
  kind?: 'consignment' | 'promotion' | 'event_hosting';
  subtype?: 'poster' | 'cupsleeve' | null;
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
  default_host_split_percent?: number;
  listing_fee_cents?: number;
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
 * Fetch a published poster space by short_code (for public pages)
 */
export async function getPublicPosterSpaceByShortCode(
  shortCode: string
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
    .eq('short_code', shortCode)
    .eq('status', 'published')
    .single();

  if (error) {
    console.error('Error fetching public poster space by short_code:', error);
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
 * Fetch a published poster space by org slug and space ID (for public pages)
 * @deprecated Use getPublicPosterSpaceByShortCode instead
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
 * Get short_code by UUID (for backward compatibility redirects)
 */
export async function getShortCodeById(spaceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('poster_spaces')
    .select('short_code')
    .eq('id', spaceId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.short_code;
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
    // Update existing - do NOT change short_code
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
    // Create new - generate short_code with retry logic
    let attempts = 0;
    const maxAttempts = 5;
    let shortCode = generateShortCode(7);

    while (attempts < maxAttempts) {
      try {
        const { data: created, error } = await supabase
          .from('poster_spaces')
          .insert({
            ...data,
            short_code: shortCode,
          })
          .select()
          .single();

        if (error) {
          // Check if it's a unique constraint violation on short_code
          if (error.code === '23505' && error.message?.includes('short_code')) {
            attempts++;
            if (attempts < maxAttempts) {
              // Generate new code and retry
              shortCode = generateShortCode(7);
              continue;
            } else {
              // Last attempt: try 8 chars
              shortCode = generateShortCode(8);
              const { data: retryCreated, error: retryError } = await supabase
                .from('poster_spaces')
                .insert({
                  ...data,
                  short_code: shortCode,
                })
                .select()
                .single();

              if (retryError) {
                console.error('Error creating poster space after retries:', retryError);
                throw retryError;
              }

              return retryCreated as PosterSpace;
            }
          } else {
            // Other error, throw it
            console.error('Error creating poster space:', error);
            throw error;
          }
        }

        return created as PosterSpace;
      } catch (err: any) {
        // If it's not a unique constraint error, throw it
        if (err.code !== '23505' || !err.message?.includes('short_code')) {
          throw err;
        }
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error('Failed to generate unique short_code after multiple attempts');
        }
        shortCode = generateShortCode(7);
      }
    }

    throw new Error('Failed to create poster space');
  }
}

/**
 * Delete a poster space and all associated photos
 */
export async function deletePosterSpace(spaceId: string): Promise<void> {
  // First, fetch the space to get photo URLs
  const space = await getPosterSpace(spaceId);
  
  if (!space) {
    throw new Error('Space not found');
  }

  // Delete all photos from storage
  if (space.photos && space.photos.length > 0) {
    const deletePhotoPromises = space.photos.map((photoUrl) => {
      try {
        return deletePosterSpacePhoto(photoUrl);
      } catch (error) {
        // Log but don't fail if photo deletion fails
        console.warn('Failed to delete photo:', photoUrl, error);
        return Promise.resolve();
      }
    });
    await Promise.all(deletePhotoPromises);
  }

  // Delete the space row
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
 * Batch-load booking requests for many poster spaces (one round trip)
 */
export async function getBookingRequestsForSpaces(
  spaceIds: string[]
): Promise<PosterSpaceBookingRequest[]> {
  if (spaceIds.length === 0) return [];

  const { data, error } = await supabase
    .from('poster_space_booking_requests')
    .select('*')
    .in('poster_space_id', spaceIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching booking requests for spaces:', error);
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
 * Parse a YYYY-MM-DD string as a local date (avoiding timezone issues)
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a Date as YYYY-MM-DD in local timezone
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compute end date based on booking unit and duration
 */
export function computeEndDate(
  startDate: string,
  bookingUnit: 'week' | 'day' | 'month',
  durationUnits: number
): string {
  // Parse as local date to avoid timezone issues
  const start = parseLocalDate(startDate);
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

  return formatLocalDate(end);
}

/**
 * Check if a date range overlaps with any blackout ranges
 * Uses local date parsing to avoid timezone issues
 */
export function checkBlackoutOverlap(
  startDate: string,
  endDate: string,
  blackoutRanges: Array<{ start: string; end: string }>
): boolean {
  if (!blackoutRanges || blackoutRanges.length === 0) {
    return false;
  }

  // Parse as local dates to avoid timezone issues
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  // Set to start/end of day for inclusive comparison
  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

  return blackoutRanges.some((range) => {
    const rangeStart = parseLocalDate(range.start);
    const rangeEnd = parseLocalDate(range.end);
    
    const rangeStartOfDay = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate(), 0, 0, 0, 0);
    const rangeEndOfDay = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59, 999);
    
    // Check for overlap: ranges overlap if start <= rangeEnd && end >= rangeStart (inclusive)
    return startOfDay <= rangeEndOfDay && endOfDay >= rangeStartOfDay;
  });
}

/**
 * Dev-only: Test blackout overlap logic
 * Run in browser console: window.testBlackoutOverlap()
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).testBlackoutOverlap = () => {
    const tests = [
      {
        name: 'Non-overlapping dates',
        startDate: '2025-01-10',
        endDate: '2025-01-17',
        blackoutRanges: [{ start: '2025-02-01', end: '2025-02-10' }],
        expected: false,
      },
      {
        name: 'Overlapping dates (start in blackout)',
        startDate: '2025-01-10',
        endDate: '2025-01-20',
        blackoutRanges: [{ start: '2025-01-15', end: '2025-01-25' }],
        expected: true,
      },
      {
        name: 'Overlapping dates (end in blackout)',
        startDate: '2025-01-10',
        endDate: '2025-01-20',
        blackoutRanges: [{ start: '2025-01-05', end: '2025-01-15' }],
        expected: true,
      },
      {
        name: 'Boundary case (end == blackoutStart)',
        startDate: '2025-01-10',
        endDate: '2025-01-15',
        blackoutRanges: [{ start: '2025-01-15', end: '2025-01-20' }],
        expected: true, // Inclusive: end date overlaps with blackout start
      },
      {
        name: 'Boundary case (start == blackoutEnd)',
        startDate: '2025-01-15',
        endDate: '2025-01-20',
        blackoutRanges: [{ start: '2025-01-10', end: '2025-01-15' }],
        expected: true, // Inclusive: start date overlaps with blackout end
      },
      {
        name: 'Completely within blackout',
        startDate: '2025-01-12',
        endDate: '2025-01-14',
        blackoutRanges: [{ start: '2025-01-10', end: '2025-01-20' }],
        expected: true,
      },
      {
        name: 'Completely encompasses blackout',
        startDate: '2025-01-05',
        endDate: '2025-01-25',
        blackoutRanges: [{ start: '2025-01-10', end: '2025-01-20' }],
        expected: true,
      },
    ];

    console.log('Testing blackout overlap logic...');
    let passed = 0;
    let failed = 0;

    tests.forEach((test) => {
      const result = checkBlackoutOverlap(test.startDate, test.endDate, test.blackoutRanges);
      if (result === test.expected) {
        console.log(`✅ ${test.name}: PASSED`);
        passed++;
      } else {
        console.error(`❌ ${test.name}: FAILED (expected ${test.expected}, got ${result})`);
        failed++;
      }
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    return { passed, failed, total: tests.length };
  };
}

