import { supabase } from '@/integrations/supabase/client';
import { OrgProfile } from '@/contexts/AuthContext';

export interface OrgWithProfile {
  id: string;
  name: string;
  slug: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  profile: OrgProfile | null;
}

/**
 * Get organization by slug with profile
 */
export async function getOrgBySlugWithProfile(orgSlug: string): Promise<OrgWithProfile | null> {
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('*')
    .eq('slug', orgSlug)
    .single();

  if (orgError) {
    if (orgError.code === 'PGRST116') {
      return null;
    }
    throw new Error(orgError.message || 'Failed to fetch organization');
  }

  if (!org) return null;

  // Fetch profile
  const { data: profile, error: profileError } = await (supabase
    .from('org_profiles' as any)
    .select('*')
    .eq('org_id', org.id)
    .single()) as { data: OrgProfile | null; error: any };

  // Profile is optional, don't throw if not found
  if (profileError && profileError.code !== 'PGRST116') {
    console.warn('Failed to fetch org profile:', profileError);
  }

  return {
    ...org,
    profile: profile || null,
  };
}

/**
 * Get organization stats (catalog count, collabs count, connect count)
 */
export async function getOrgStats(orgId: string): Promise<{
  catalogCount: number;
  collabsCount: number;
  connectCount: number;
}> {
  // Catalog: products (physical) + events + space listings (venue_asset products)
  const [physicalProductsResult, eventsResult, spacesResult] = await Promise.all([
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('type', 'physical'),
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('type', 'venue_asset'),
  ]);

  const physicalProductsCount = physicalProductsResult.count || 0;
  const eventsCount = eventsResult.count || 0;
  const spacesCount = spacesResult.count || 0;
  const catalogCount = physicalProductsCount + eventsCount + spacesCount;

  // Collabs: bookings where org is brand or venue
  const { count: collabsCount } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .or(`brand_org_id.eq.${orgId},venue_org_id.eq.${orgId}`)
    .in('status', ['pending', 'confirmed']);

  // Connect: unique org IDs collaborated with
  const { data: bookingsData } = await supabase
    .from('bookings')
    .select('brand_org_id, venue_org_id')
    .or(`brand_org_id.eq.${orgId},venue_org_id.eq.${orgId}`);

  const connectedOrgIds = new Set<string>();
  if (bookingsData) {
    bookingsData.forEach((booking) => {
      if (booking.brand_org_id === orgId) {
        if (booking.venue_org_id !== orgId) {
          connectedOrgIds.add(booking.venue_org_id);
        }
      } else if (booking.venue_org_id === orgId) {
        if (booking.brand_org_id !== orgId) {
          connectedOrgIds.add(booking.brand_org_id);
        }
      }
    });
  }

  return {
    catalogCount,
    collabsCount: collabsCount || 0,
    connectCount: connectedOrgIds.size,
  };
}

