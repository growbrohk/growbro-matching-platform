import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import BrandPublicHeader from '@/components/brand-public/BrandPublicHeader';
import BrandEventCard from '@/components/brand-public/BrandEventCard';
import { Skeleton } from '@/components/ui/skeleton';
import { getOrgBySlugWithProfile } from '@/lib/api/orgs';
import { useBrandPageData, type BrandEvent } from '@/hooks/use-brand-page-data';
import NotFound from '@/pages/NotFound';

const DEFAULT_ACCENT = '#E85D04';

const RESERVED_ORG_SLUGS = [
  'app', 'login', 'events', 'admin', 'api', 'auth', 'onboarding',
  'book', 'r', 'space', 'profile', 't', 'o', 'booking', 'org',
  'messages', 'dashboard', 'collab', 'enquiries', 'orders',
  'settings', 'account', 'products', 'catalog', 'notifications', 'checkout',
];

export default function PublicBrandEventsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Awaited<ReturnType<typeof getOrgBySlugWithProfile>>>(null);

  const { events, loading: eventsLoading } = useBrandPageData(
    org?.id ?? '',
    org?.slug ?? null,
    org?.profile,
    { eventsLimit: 50, loadProducts: false },
  );

  useEffect(() => {
    if (!orgSlug) {
      setLoading(false);
      return;
    }

    if (RESERVED_ORG_SLUGS.includes(orgSlug.toLowerCase())) {
      setLoading(false);
      return;
    }

    const loadOrg = async () => {
      try {
        setLoading(true);
        const orgData = await getOrgBySlugWithProfile(orgSlug);
        setOrg(orgData);
      } catch (error: unknown) {
        console.error('Error loading brand events page:', error);
        setOrg(null);
      } finally {
        setLoading(false);
      }
    };

    loadOrg();
  }, [orgSlug]);

  const accentColor = org?.profile?.accent_color || DEFAULT_ACCENT;

  const handleEventClick = (e: BrandEvent) => {
    const s = e.orgSlug || orgSlug;
    if (e.slug && s) {
      navigate(`/${s}/${e.slug}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!orgSlug || RESERVED_ORG_SLUGS.includes(orgSlug.toLowerCase()) || !org) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <BrandPublicHeader org={org} profile={org.profile} showBackLink={true} isOwner={false} />
      <div className="w-full max-w-7xl mx-auto px-4 py-8 md:py-12">
        <h1
          className="text-2xl md:text-3xl font-bold mb-6 md:mb-8"
          style={{ color: accentColor, fontFamily: "'Inter Tight', sans-serif" }}
        >
          Events
        </h1>

        {eventsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">No events yet</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
            {events.map((event) => (
              <BrandEventCard
                key={event.id}
                event={event}
                accentColor={accentColor}
                onClick={() => handleEventClick(event)}
                className="w-full"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
