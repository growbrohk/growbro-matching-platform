import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileActions from '@/components/profile/ProfileActions';
import ProfileGrid from '@/components/profile/ProfileGrid';
import { getOrgBySlugWithProfile, getOrgStats } from '@/lib/api/orgs';

export default function PublicProfile() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [stats, setStats] = useState({
    catalogCount: 0,
    collabsCount: 0,
    connectCount: 0,
  });

  useEffect(() => {
    if (!orgSlug) {
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        setLoading(true);
        
        // Fetch org with profile
        const orgData = await getOrgBySlugWithProfile(orgSlug);
        if (!orgData) {
          setOrg(null);
          return;
        }

        setOrg(orgData);

        // Fetch stats
        const orgStats = await getOrgStats(orgData.id);
        setStats(orgStats);
      } catch (error: any) {
        console.error('Error loading public profile:', error);
        setOrg(null);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [orgSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold mb-2" style={{ color: '#0F1F17' }}>
            Profile not found
          </h1>
          <p className="text-sm text-muted-foreground">
            This profile may not exist or is not currently available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="w-full px-6 py-6 md:py-8 max-w-4xl mx-auto">
        <ProfileHeader
          org={org}
          profile={org.profile}
          stats={stats}
          mode="public"
        />
        
        <ProfileActions mode="public" otherOrgId={org.id} />
        
        <ProfileGrid
          orgId={org.id}
          orgSlug={org.slug}
          mode="public"
        />
      </div>
    </div>
  );
}

