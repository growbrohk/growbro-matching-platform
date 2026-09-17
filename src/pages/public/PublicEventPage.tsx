import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { getPublicEventAndOrgBySlugs } from '@/lib/api/events';
import type { Event, TicketType } from '@/lib/types';
import PublicEventForm from '@/components/events/PublicEventForm';
import {
  fetchPublicTicketTypes,
  usePublicTicketTypes,
} from '@/hooks/use-public-ticket-types';

const VISIBILITY_REFRESH_MIN_MS = 30_000;

export default function PublicEventPage() {
  const { orgSlug, eventSlug } = useParams<{ orgSlug: string; eventSlug: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [org, setOrg] = useState<any>(null);
  const lastVisibilityRefreshRef = useRef(0);

  const codeParam = searchParams.get('code');
  const refParam = searchParams.get('ref');
  const tidParam = searchParams.get('tid');

  const { data: ticketTypesFromQuery = [] } = usePublicTicketTypes(event?.id, Boolean(event?.id));

  const RESERVED_ORG_SLUGS = [
    'app', 'login', 'events', 'admin', 'api', 'auth', 'onboarding',
    'book', 'r', 'space', 'profile', 't', 'o', 'booking', 'org',
    'messages', 'dashboard', 'collab', 'enquiries', 'orders',
    'settings', 'account', 'products', 'catalog', 'notifications', 'checkout',
  ];

  useEffect(() => {
    if (tidParam) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(tidParam)) {
        localStorage.setItem('tracking_link_id', tidParam);
      }
    }
  }, [tidParam]);

  const refreshTicketTypes = useCallback(
    async (eventId: string, typesHint?: TicketType[]) => {
      const shouldRefresh =
        typesHint?.some((t) => t.show_remaining_count) ?? true;
      if (!shouldRefresh) return;

      const now = Date.now();
      if (now - lastVisibilityRefreshRef.current < VISIBILITY_REFRESH_MIN_MS) {
        return;
      }
      lastVisibilityRefreshRef.current = now;

      try {
        await fetchPublicTicketTypes(queryClient, eventId);
      } catch (error) {
        console.error('[PublicEventPage] Failed to refresh ticket types:', error);
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!orgSlug || !eventSlug) {
      setLoading(false);
      return;
    }

    if (RESERVED_ORG_SLUGS.includes(orgSlug.toLowerCase())) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchEvent = async () => {
      try {
        setLoading(true);

        const result = await getPublicEventAndOrgBySlugs(orgSlug, eventSlug);

        if (cancelled) return;

        if (!result || result.event.status !== 'published') {
          setEvent(null);
          setOrg(null);
          return;
        }

        setEvent(result.event);
        setOrg(result.org);
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

  useEffect(() => {
    if (!event?.id) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshTicketTypes(event.id, ticketTypesFromQuery);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [event?.id, refreshTicketTypes, ticketTypesFromQuery]);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

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
      ticketTypes={ticketTypesFromQuery}
      mode="public"
      codeParam={codeParam}
      refParam={refParam}
    />
  );
}
