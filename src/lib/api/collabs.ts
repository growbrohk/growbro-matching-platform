import { supabase } from '@/integrations/supabase/client';
import { generateTrackingShortCode } from '@/lib/utils/short-code';

export type CollabStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'active' | 'ended';
export type PricingModel = 'fixed' | 'revenue_share' | 'hybrid';
export type DestinationType = 'product' | 'event' | 'url';

export interface Collab {
  id: string;
  listing_id: string;
  host_org_id: string;
  brand_org_id: string;
  start_at: string;
  end_at: string;
  status: CollabStatus;
  pricing_model: PricingModel;
  host_split_percent: number;
  brand_split_percent: number;
  platform_fee_percent: number;
  listing_fee_cents: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TrackingCampaign {
  id: string;
  collab_id: string;
  short_code: string;
  destination_type: DestinationType;
  destination_id: string | null;
  destination_url: string | null;
  scan_count: number;
  created_at: string;
}

export interface CreateCollabInput {
  listing_id: string;
  host_org_id: string;
  brand_org_id: string;
  start_at: string;
  end_at: string;
  pricing_model?: PricingModel;
  host_split_percent?: number;
  brand_split_percent?: number;
  platform_fee_percent?: number;
  listing_fee_cents?: number;
  metadata?: Record<string, any>;
}

export interface CreateTrackingCampaignInput {
  collab_id: string;
  destination_type: DestinationType;
  destination_id?: string | null;
  destination_url?: string | null;
}

/**
 * Create a new collab
 * Optionally creates a tracking campaign automatically
 */
export async function createCollab(
  input: CreateCollabInput,
  autoCreateTracking?: boolean,
  trackingInput?: CreateTrackingCampaignInput
): Promise<{ collab: Collab; trackingCampaign?: TrackingCampaign }> {
  const { data, error } = await supabase
    .from('collabs')
    .insert({
      ...input,
      status: 'pending',
      pricing_model: input.pricing_model || 'revenue_share',
      host_split_percent: input.host_split_percent ?? 0,
      brand_split_percent: input.brand_split_percent ?? 0,
      platform_fee_percent: input.platform_fee_percent ?? 0,
      listing_fee_cents: input.listing_fee_cents ?? 0,
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating collab:', error);
    throw error;
  }

  const collab = data as Collab;

  // Auto-create tracking campaign if requested
  if (autoCreateTracking) {
    try {
      const trackingCampaign = await createTrackingCampaign({
        collab_id: collab.id,
        ...(trackingInput || {
          destination_type: 'url',
          destination_url: null,
        }),
      });
      return { collab, trackingCampaign };
    } catch (err) {
      console.warn('Failed to create tracking campaign for new collab:', err);
      // Don't fail the collab creation if tracking fails
      return { collab };
    }
  }

  return { collab };
}

/**
 * Approve a collab and auto-create tracking campaign
 */
export async function approveCollab(
  collabId: string,
  trackingInput?: CreateTrackingCampaignInput
): Promise<{ collab: Collab; trackingCampaign: TrackingCampaign }> {
  // Update collab status
  const { data: updatedCollab, error: collabError } = await supabase
    .from('collabs')
    .update({ status: 'approved' })
    .eq('id', collabId)
    .select()
    .single();

  if (collabError) {
    console.error('Error approving collab:', collabError);
    throw collabError;
  }

  // Auto-create tracking campaign
  let trackingCampaign: TrackingCampaign;
  if (trackingInput) {
    trackingCampaign = await createTrackingCampaign({
      collab_id: collabId,
      ...trackingInput,
    });
  } else {
    // Create default tracking campaign if none provided
    trackingCampaign = await createTrackingCampaign({
      collab_id: collabId,
      destination_type: 'url',
      destination_url: null,
    });
  }

  return {
    collab: updatedCollab as Collab,
    trackingCampaign,
  };
}

/**
 * Create a tracking campaign
 */
export async function createTrackingCampaign(
  input: CreateTrackingCampaignInput
): Promise<TrackingCampaign> {
  // Generate unique short code (6-8 chars, lowercase alphanumeric)
  let attempts = 0;
  const maxAttempts = 10;
  let codeLength = 6;
  let shortCode = generateTrackingShortCode(codeLength);

  while (attempts < maxAttempts) {
    // Check if code exists
    const { data: existing } = await supabase
      .from('tracking_campaigns')
      .select('id')
      .eq('short_code', shortCode)
      .single();

    if (!existing) {
      // Code is available, use it
      break;
    }

    attempts++;
    if (attempts < maxAttempts) {
      // Try again with same length
      shortCode = generateTrackingShortCode(codeLength);
    } else if (attempts === maxAttempts && codeLength < 8) {
      // Try with longer code
      codeLength++;
      attempts = 0;
      shortCode = generateTrackingShortCode(codeLength);
    }
  }

  const { data, error } = await supabase
    .from('tracking_campaigns')
    .insert({
      collab_id: input.collab_id,
      short_code: shortCode,
      destination_type: input.destination_type,
      destination_id: input.destination_id || null,
      destination_url: input.destination_url || null,
      scan_count: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating tracking campaign:', error);
    throw error;
  }

  return data as TrackingCampaign;
}

/**
 * Get collab by ID
 */
export async function getCollab(collabId: string): Promise<Collab | null> {
  const { data, error } = await supabase
    .from('collabs')
    .select('*')
    .eq('id', collabId)
    .single();

  if (error) {
    console.error('Error fetching collab:', error);
    return null;
  }

  return data as Collab | null;
}

/**
 * Get tracking campaign by short code
 */
export async function getTrackingCampaignByShortCode(
  shortCode: string
): Promise<TrackingCampaign | null> {
  const { data, error } = await supabase
    .from('tracking_campaigns')
    .select('*')
    .eq('short_code', shortCode)
    .single();

  if (error) {
    console.error('Error fetching tracking campaign:', error);
    return null;
  }

  return data as TrackingCampaign | null;
}

/**
 * Increment scan count for a tracking campaign
 */
export async function incrementTrackingScan(shortCode: string): Promise<{
  success: boolean;
  destination_type?: DestinationType;
  destination_id?: string | null;
  destination_url?: string | null;
  scan_count?: number;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('increment_tracking_scan', {
    short_code_param: shortCode,
  });

  if (error) {
    console.error('Error incrementing tracking scan:', error);
    return { success: false, error: error.message };
  }

  if (data?.error) {
    return { success: false, error: data.error };
  }

  return {
    success: true,
    destination_type: data.destination_type,
    destination_id: data.destination_id,
    destination_url: data.destination_url,
    scan_count: data.scan_count,
  };
}

/**
 * Get collabs for an org (as host or brand)
 */
export async function getCollabsForOrg(orgId: string): Promise<Collab[]> {
  const { data, error } = await supabase
    .from('collabs')
    .select('*')
    .or(`host_org_id.eq.${orgId},brand_org_id.eq.${orgId}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching collabs:', error);
    throw error;
  }

  return (data || []) as Collab[];
}

/**
 * Get tracking campaign for a collab
 */
export async function getTrackingCampaignForCollab(
  collabId: string
): Promise<TrackingCampaign | null> {
  const { data, error } = await supabase
    .from('tracking_campaigns')
    .select('*')
    .eq('collab_id', collabId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('Error fetching tracking campaign:', error);
    return null;
  }

  return data as TrackingCampaign | null;
}

