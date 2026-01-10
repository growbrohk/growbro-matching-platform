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
 * Generate slug from org name (matches database function logic)
 */
function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'org';
}

/**
 * Get organization by slug with profile
 * Falls back to name lookup if slug doesn't exist, and auto-generates slug
 */
export async function getOrgBySlugWithProfile(orgSlug: string): Promise<OrgWithProfile | null> {
  // First, try to find by slug
  let { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('*')
    .eq('slug', orgSlug)
    .single();

  // If not found by slug, try to find by name (normalized to match slug format)
  if (orgError && orgError.code === 'PGRST116') {
    // Fetch orgs without slugs and check if their name would generate this slug
    // We'll check client-side since we need to generate slug from name
    const { data: orgsWithoutSlug, error: nameError } = await supabase
      .from('orgs')
      .select('*')
      .is('slug', null)
      .limit(100); // Reasonable limit for checking
    
    // Find the org whose name would generate this slug
    let matchingOrg = null;
    if (!nameError && orgsWithoutSlug) {
      matchingOrg = orgsWithoutSlug.find(org => {
        const generatedSlug = generateSlugFromName(org.name);
        return generatedSlug === orgSlug;
      });
    }

    if (matchingOrg) {
      org = matchingOrg;
      
      // If org found but doesn't have slug, generate and save it
      if (!org.slug) {
        const generatedSlug = generateSlugFromName(org.name);
        
        // Check if generated slug conflicts with existing slug
        const { data: existingOrg } = await supabase
          .from('orgs')
          .select('id')
          .eq('slug', generatedSlug)
          .neq('id', org.id)
          .single();
        
        let finalSlug = generatedSlug;
        if (existingOrg) {
          // If conflict, append counter
          let counter = 1;
          while (true) {
            const { data: checkOrg } = await supabase
              .from('orgs')
              .select('id')
              .eq('slug', `${generatedSlug}-${counter}`)
              .single();
            
            if (!checkOrg) {
              finalSlug = `${generatedSlug}-${counter}`;
              break;
            }
            counter++;
          }
        }
        
        // Update org with generated slug
        const { error: updateError } = await supabase
          .from('orgs')
          .update({ slug: finalSlug })
          .eq('id', org.id);
        
        if (updateError) {
          console.warn('Failed to update org slug:', updateError);
        } else {
          org.slug = finalSlug;
        }
      }
    } else {
      // Not found by name either
      return null;
    }
  } else if (orgError) {
    // Other error occurred
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
  // Catalog: products (physical) + events + space listings (venue_asset products) + poster_spaces
  const [physicalProductsResult, eventsResult, venueAssetSpacesResult, posterSpacesResult] = await Promise.all([
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
    (supabase
      .from('poster_spaces' as any)
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'published')) as any,
  ]);

  const physicalProductsCount = physicalProductsResult.count || 0;
  const eventsCount = eventsResult.count || 0;
  const venueAssetSpacesCount = venueAssetSpacesResult.count || 0;
  const posterSpacesCount = posterSpacesResult.count || 0;
  const catalogCount = physicalProductsCount + eventsCount + venueAssetSpacesCount + posterSpacesCount;

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

