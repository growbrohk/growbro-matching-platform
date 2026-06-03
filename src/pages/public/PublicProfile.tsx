import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import BrandPageView from '@/components/brand-public/BrandPageView';
import { getOrgBySlugWithProfile } from '@/lib/api/orgs';
import { useAuth } from '@/contexts/AuthContext';
import { useBrandPageData } from '@/hooks/use-brand-page-data';
import NotFound from '@/pages/NotFound';

const RESERVED_ORG_SLUGS = [
  'app', 'login', 'events', 'admin', 'api', 'auth', 'onboarding',
  'book', 'r', 'space', 'profile', 't', 'o', 'booking', 'org',
  'messages', 'dashboard', 'collab', 'enquiries', 'orders',
  'settings', 'account', 'products', 'catalog', 'notifications', 'checkout',
];

export default function PublicProfile() {
  const { orgSlug, brandSlug } = useParams<{ orgSlug?: string; brandSlug?: string }>();
  const slug = orgSlug ?? brandSlug;
  const { currentOrg, orgMemberships } = useAuth();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Awaited<ReturnType<typeof getOrgBySlugWithProfile>>>(null);

  const isMemberOfOrg = org && orgMemberships.some((m) => m.org_id === org.id);
  const isOwner = isMemberOfOrg && currentOrg?.id === org?.id;

  const { events, products, loading: dataLoading } = useBrandPageData(org?.id, org?.slug, org?.profile);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    if (RESERVED_ORG_SLUGS.includes(slug.toLowerCase())) {
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        setLoading(true);
        const orgData = await getOrgBySlugWithProfile(slug);
        setOrg(orgData);
      } catch (error: unknown) {
        console.error('Error loading public profile:', error);
        setOrg(null);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!slug) return <NotFound />;
  if (RESERVED_ORG_SLUGS.includes(slug.toLowerCase())) return <NotFound />;
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
    <BrandPageView
      org={org}
      events={events}
      products={products}
      dataLoading={dataLoading}
      isOwner={!!isOwner}
      variant="standalone"
    />
  );
}
