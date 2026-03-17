import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileActions from '@/components/profile/ProfileActions';
import ProfileGrid from '@/components/profile/ProfileGrid';
import { getOrgStats } from '@/lib/api/orgs';
import { supabase } from '@/integrations/supabase/client';
import { OrgProfile } from '@/contexts/AuthContext';
import { useConnectedCount } from '@/hooks/use-connected-count';

export default function ProfilePage() {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [stats, setStats] = useState({
    catalogCount: 0,
    collabsCount: 0,
    connectCount: 0,
  });
  
  // Fetch connected count using hook for real-time updates
  const { data: connectedCountData } = useConnectedCount(currentOrg?.id);
  const connectedCount: number = (connectedCountData ?? stats.connectCount) as number;

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

        // Fetch stats using API helper
        const orgStats = await getOrgStats(currentOrg.id);
        setStats(orgStats);
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

  return (
    <div className="w-full px-6 py-6 md:py-8">
      <div className="relative">
        <div className="absolute top-0 right-0">
          <ProfileActions mode="owner" orgSlug={currentOrg.slug} />
        </div>
        <ProfileHeader
          org={currentOrg}
          profile={profile}
          stats={stats}
          mode="owner"
          connectedCount={connectedCount}
          onConnectStatClick={() => navigate(`/app/org/${currentOrg.id}/connections`)}
        />
      </div>
      
      <ProfileGrid
        orgId={currentOrg.id}
        orgSlug={currentOrg.slug}
        mode="owner"
      />
    </div>
  );
}

