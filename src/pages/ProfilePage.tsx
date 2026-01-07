import { useState, useEffect } from 'react';
import { useAuth, OrgProfile } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ProfileStats {
  catalogCount: number;
  collabsCount: number;
  connectCount: number;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats>({
    catalogCount: 0,
    collabsCount: 0,
    connectCount: 0,
  });

  useEffect(() => {
    if (!currentOrg) return;

    const loadProfileData = async () => {
      try {
        // Load profile from org_profiles table
        const { data: profileData, error: profileError } = await (supabase
          .from('org_profiles' as any)
          .select('*')
          .eq('org_id', currentOrg.id)
          .single()) as { data: OrgProfile | null; error: any };

        if (!profileError && profileData) {
          setProfile(profileData);
        }

        // Fetch stats
        // Catalog: products (physical) + events + space listings (venue_asset products)
        const [physicalProductsResult, eventsResult, spacesResult] = await Promise.all([
          supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', currentOrg.id)
            .eq('type', 'physical'),
          supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', currentOrg.id),
          supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', currentOrg.id)
            .eq('type', 'venue_asset'),
        ]);

        const physicalProductsCount = physicalProductsResult.count || 0;
        const eventsCount = eventsResult.count || 0;
        const spacesCount = spacesResult.count || 0;
        const catalogCount = physicalProductsCount + eventsCount + spacesCount;

        // Collabs: bookings where currentOrg is brand or venue
        const { count: collabsCount } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .or(`brand_org_id.eq.${currentOrg.id},venue_org_id.eq.${currentOrg.id}`)
          .in('status', ['pending', 'confirmed']);

        // Connect: unique org IDs collaborated with
        // Get all bookings where currentOrg is involved
        const { data: bookingsData } = await supabase
          .from('bookings')
          .select('brand_org_id, venue_org_id')
          .or(`brand_org_id.eq.${currentOrg.id},venue_org_id.eq.${currentOrg.id}`);

        const connectedOrgIds = new Set<string>();
        if (bookingsData) {
          bookingsData.forEach((booking) => {
            if (booking.brand_org_id === currentOrg.id) {
              // Current org is brand, so venue is the connection
              if (booking.venue_org_id !== currentOrg.id) {
                connectedOrgIds.add(booking.venue_org_id);
              }
            } else if (booking.venue_org_id === currentOrg.id) {
              // Current org is venue, so brand is the connection
              if (booking.brand_org_id !== currentOrg.id) {
                connectedOrgIds.add(booking.brand_org_id);
              }
            }
          });
        }

        setStats({
          catalogCount,
          collabsCount: collabsCount || 0,
          connectCount: connectedOrgIds.size,
        });
      } catch (error) {
        console.error('Error loading profile data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, [currentOrg]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-12">
        <p style={{ color: '#0F1F17' }}>No organization selected</p>
      </div>
    );
  }

  const brandName = currentOrg.name || 'Untitled';
  // Format Instagram handle - extract username from URL if needed
  const instagramHandle = profile?.instagram 
    ? (() => {
        let handle = profile.instagram.trim();
        // Extract username from URL if it's a full URL
        if (handle.includes('instagram.com/')) {
          const match = handle.match(/instagram\.com\/([^\/\?]+)/);
          handle = match ? match[1] : handle;
        }
        // Remove @ if present, then add it back
        handle = handle.replace(/^@/, '');
        return `@${handle}`;
      })()
    : null;
  const address = profile?.address || '';
  const bio = profile?.bio || '';
  const website = profile?.website || '';
  const logoUrl = profile?.logo_url || '';

  // Format bio with line breaks
  const bioLines = bio.split('\n').filter(line => line.trim());

  return (
    <div className="w-full px-6 py-6 md:py-8">
      {/* Profile Header */}
      <div className="flex gap-6 md:gap-8 mb-4">
        {/* Profile Picture */}
        <div className="flex-shrink-0">
          <Avatar 
            className="h-20 w-20 md:h-24 md:w-24 border-2 shadow-sm" 
            style={{ 
              borderColor: 'rgba(14,122,58,0.2)',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }}
          >
            {logoUrl ? (
              <AvatarImage src={logoUrl} alt={brandName} />
            ) : (
              <AvatarFallback className="text-2xl md:text-3xl font-bold" style={{ backgroundColor: 'rgba(14,122,58,0.1)', color: '#0E7A3A' }}>
                {brandName.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
        </div>

        {/* Brand Name, Handle, Address */}
        <div className="flex-1 min-w-0">
          <div className="mb-1">
            <h1 className="text-xl md:text-2xl font-bold inline" style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}>
              {brandName}
            </h1>
            {instagramHandle && (
              <span className="text-base md:text-lg font-normal ml-2" style={{ color: 'rgba(15,31,23,0.6)' }}>
                {instagramHandle}
              </span>
            )}
          </div>
          {address && (
            <p className="text-sm md:text-base mb-0" style={{ color: '#0F1F17' }}>
              {address}
            </p>
          )}
        </div>
      </div>

      {/* Stats Row with Dividers */}
      <div className="flex justify-between items-center py-3 border-t border-b mb-4" style={{ borderColor: 'rgba(0, 0, 0, 0.1)' }}>
        <div className="flex items-baseline gap-1">
          <span className="text-base md:text-lg font-bold" style={{ color: '#0F1F17' }}>
            {stats.catalogCount}
          </span>
          <span className="text-sm font-normal" style={{ color: '#0F1F17' }}>
            Catalog
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-base md:text-lg font-bold" style={{ color: '#0F1F17' }}>
            {stats.collabsCount}
          </span>
          <span className="text-sm font-normal" style={{ color: '#0F1F17' }}>
            Collabs
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-base md:text-lg font-bold" style={{ color: '#0F1F17' }}>
            {stats.connectCount}
          </span>
          <span className="text-sm font-normal" style={{ color: '#0F1F17' }}>
            Connect
          </span>
        </div>
      </div>

      {/* Bio Section */}
      {bioLines.length > 0 && (
        <div className="mb-4">
          {bioLines.map((line, index) => (
            <p 
              key={index} 
              className="text-sm md:text-base mb-1 leading-relaxed" 
              style={{ color: '#0F1F17', lineHeight: '1.6' }}
            >
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Website/Link */}
      {website && (
        <div className="mb-6">
          <a
            href={website.startsWith('http') ? website : `https://${website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm md:text-base font-medium hover:underline"
            style={{ color: '#2563eb' }}
          >
            <Link2 className="h-4 w-4" />
            {website.replace(/^https?:\/\//, '').replace(/^www\./, '')}
          </a>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mt-6">
        <Button
          onClick={() => navigate('/app/settings/profile')}
          className="flex-1 h-12 rounded-2xl font-bold"
          style={{ backgroundColor: 'rgba(15,31,23,0.1)', color: '#0F1F17' }}
        >
          Edit Profile
        </Button>
        <Button
          onClick={() => navigate('/app/settings')}
          className="flex-1 h-12 rounded-2xl font-bold"
          style={{ backgroundColor: 'rgba(15,31,23,0.1)', color: '#0F1F17' }}
        >
          Setting
        </Button>
      </div>
    </div>
  );
}

