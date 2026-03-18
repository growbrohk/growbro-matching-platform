import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import ProfileActions from '@/components/profile/ProfileActions';
import BrandPublicHero from '@/components/brand-public/BrandPublicHero';
import BrandPublicEvents from '@/components/brand-public/BrandPublicEvents';
import BrandPublicDescription from '@/components/brand-public/BrandPublicDescription';
import BrandPublicProducts from '@/components/brand-public/BrandPublicProducts';
import BrandPublicFooter from '@/components/brand-public/BrandPublicFooter';
import { getOrgBySlugWithProfile, getOrgStats } from '@/lib/api/orgs';
import { useAuth } from '@/contexts/AuthContext';
import { useConnectedCount } from '@/hooks/use-connected-count';
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
  const navigate = useNavigate();
  const { currentOrg, orgMemberships } = useAuth();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [stats, setStats] = useState({
    catalogCount: 0,
    collabsCount: 0,
    connectCount: 0,
  });

  const isMemberOfOrg = org && orgMemberships.some((m) => m.org_id === org.id);
  const isOwner = isMemberOfOrg && currentOrg?.id === org?.id;

  const { data: connectedCountData } = useConnectedCount(org?.id, true);
  const connectedCount: number = (connectedCountData ?? stats.connectCount) as number;

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
        if (!orgData) {
          setOrg(null);
          return;
        }
        setOrg(orgData);
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
    <div className="min-h-screen bg-background">
      {isOwner && (
        <div className="fixed top-14 md:top-16 right-4 z-50 flex items-center gap-2">
          <ProfileActions mode="public" otherOrgId={org.id} orgSlug={org.slug} />
        </div>
      )}

      {/* Brand page layout */}
      <BrandPublicHero
        org={org}
        profile={org.profile}
        isOwner={isOwner}
      />

      {(() => {
        const topSection = org.profile?.top_section || 'events';
        const bottomSection = org.profile?.bottom_section || 'products';
        const accentColor = org.profile?.accent_color;
        const renderEvents = () => (
          <BrandPublicEvents
            orgSlug={org.slug}
            events={events}
            loading={dataLoading}
            isEditMode={false}
            accentColor={accentColor}
          />
        );
        const renderProducts = () => (
          <BrandPublicProducts
            orgSlug={org.slug}
            products={products}
            loading={dataLoading}
            isEditMode={false}
            accentColor={accentColor}
          />
        );
        return (
          <>
            {topSection !== 'hidden' && (
              <>
                {(topSection === 'events' || topSection === 'both') && renderEvents()}
                {(topSection === 'products' || topSection === 'both') && renderProducts()}
              </>
            )}
            <BrandPublicDescription
              org={org}
              profile={org.profile}
              isEditMode={false}
              onEditClick={() => navigate('/app/settings/brand-page')}
            />
            {bottomSection !== 'hidden' && (
              <>
                {(bottomSection === 'events' || bottomSection === 'both') && renderEvents()}
                {(bottomSection === 'products' || bottomSection === 'both') && renderProducts()}
              </>
            )}
          </>
        );
      })()}

      <BrandPublicFooter org={org} profile={org.profile} />
    </div>
  );
}
