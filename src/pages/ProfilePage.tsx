import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import BrandPageView from '@/components/brand-public/BrandPageView';
import { useBrandPageData } from '@/hooks/use-brand-page-data';
import { supabase } from '@/integrations/supabase/client';
import { OrgProfile } from '@/contexts/AuthContext';
import type { OrgWithProfile } from '@/lib/api/orgs';

export default function ProfilePage() {
  const { currentOrg } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<OrgProfile | null>(null);

  useEffect(() => {
    if (!currentOrg) return;

    const loadProfileData = async () => {
      try {
        setLoading(true);
        const { data: profileData, error: profileError } = await (supabase
          .from('org_profiles' as any)
          .select('*')
          .eq('org_id', currentOrg.id)
          .single()) as { data: OrgProfile | null; error: { code?: string } | null };

        if (!profileError && profileData) {
          setProfile(profileData);
        } else if (profileError?.code !== 'PGRST116') {
          console.error('Error loading profile:', profileError);
        }
      } catch (error) {
        console.error('Error loading profile data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, [currentOrg]);

  const org: OrgWithProfile | null = useMemo(() => {
    if (!currentOrg) return null;
    return {
      id: currentOrg.id,
      name: currentOrg.name,
      slug: currentOrg.slug ?? null,
      metadata: currentOrg.metadata || {},
      created_at: currentOrg.created_at,
      updated_at: currentOrg.updated_at,
      profile,
    };
  }, [currentOrg, profile]);

  const { events, products, loading: dataLoading } = useBrandPageData(
    org?.id,
    org?.slug,
    org?.profile
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!currentOrg || !org) {
    return (
      <div className="flex items-center justify-center py-12">
        <p style={{ color: '#0F1F17' }}>No organization selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {!currentOrg.slug && (
        <div
          className="mb-4 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: 'rgba(14,122,58,0.2)', backgroundColor: 'rgba(14,122,58,0.08)', color: '#0F1F17' }}
        >
          Your public page URL is not set yet. Update your organization name in{' '}
          <Link to="/app/settings" className="underline font-medium">
            Settings
          </Link>{' '}
          so visitors can find you.
        </div>
      )}

      <BrandPageView
        org={org}
        events={events}
        products={products}
        dataLoading={dataLoading}
        isOwner
        variant="embedded"
      />
    </div>
  );
}
