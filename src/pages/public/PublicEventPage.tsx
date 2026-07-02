import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getPublicEventBySlugs, getTicketTypes, getOrgBySlug } from '@/lib/api/events';
import type { Event, TicketType } from '@/lib/types';
import PublicEventForm from '@/components/events/PublicEventForm';

export default function PublicEventPage() {
  const { orgSlug, eventSlug } = useParams<{ orgSlug: string; eventSlug: string }>();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [org, setOrg] = useState<any>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  
  // Get query params
  const codeParam = searchParams.get('code');
  const refParam = searchParams.get('ref');
  const tidParam = searchParams.get('tid');

  // Reserved org slugs that should not be used (align with PublicProfile / PublicProductPage)
  const RESERVED_ORG_SLUGS = [
    'app', 'login', 'events', 'admin', 'api', 'auth', 'onboarding',
    'book', 'r', 'space', 'profile', 't', 'o', 'booking', 'org',
    'messages', 'dashboard', 'collab', 'enquiries', 'orders',
    'settings', 'account', 'products', 'catalog', 'notifications', 'checkout',
  ];

  // Capture tracking_link_id (tid) from URL and store in localStorage
  useEffect(() => {
    if (tidParam) {
      // Validate tid is a valid UUID before storing
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(tidParam)) {
        localStorage.setItem('tracking_link_id', tidParam);
        console.log('[PublicEventPage] Captured tracking_link_id:', tidParam);
      } else {
        console.warn('[PublicEventPage] Invalid tid parameter format, ignoring:', tidParam);
      }
    }
  }, [tidParam]);

  useEffect(() => {
    if (!orgSlug || !eventSlug) {
      setLoading(false);
      return;
    }

    // Block reserved org slugs
    if (RESERVED_ORG_SLUGS.includes(orgSlug.toLowerCase())) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchEvent = async () => {
      try {
        setLoading(true);

        const eventData = await getPublicEventBySlugs(orgSlug, eventSlug);

        if (cancelled) return;

        if (!eventData || eventData.status !== 'published') {
          setEvent(null);
          return;
        }

        setEvent(eventData);

        const [orgData, types] = await Promise.all([
          getOrgBySlug(orgSlug),
          getTicketTypes(eventData.id, true, true),
        ]);

        if (cancelled) return;

        setOrg(orgData);
        setTicketTypes(types);
      } catch (error) {
        console.error('Error fetching event:', error);
        if (!cancelled) {
          setEvent(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchEvent();

    return () => {
      cancelled = true;
    };
  }, [orgSlug, eventSlug]);


  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  // Not found state
  if (!event || !org) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold mb-2" style={{ color: '#0F1F17' }}>
            Event not found
          </h1>
          <p className="text-sm text-muted-foreground">
            This event may not exist or is not currently available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PublicEventForm
      event={event}
      org={org}
      ticketTypes={ticketTypes}
      mode="public"
      codeParam={codeParam}
      refParam={refParam}
    />
  );
}

