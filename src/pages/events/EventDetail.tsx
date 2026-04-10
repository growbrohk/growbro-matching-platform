import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EventForm from './EventForm.new';
import { EventTicketsTab } from './EventTicketsTab';
import { EventScanTab } from './EventScanTab';
import { getEvent } from '@/lib/api/events';
import { useToast } from '@/hooks/use-toast';
import type { Event } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type EventDetailTab = 'edit' | 'tickets' | 'scan';

type CollabEventPartnerUiFlags = {
  is_collab_partner: boolean;
  collab_show_event_in_partner_events_tab?: boolean;
  collab_partner_allow_edit_tab?: boolean;
  collab_partner_allow_tickets_tab?: boolean;
  collab_partner_allow_scan_tab?: boolean;
};

const TAB_ORDER: EventDetailTab[] = ['tickets', 'edit', 'scan'];

function parseCollabFlags(raw: unknown): CollabEventPartnerUiFlags {
  if (!raw || typeof raw !== 'object') {
    return { is_collab_partner: false };
  }
  const o = raw as Record<string, unknown>;
  return {
    is_collab_partner: o.is_collab_partner === true,
    collab_show_event_in_partner_events_tab: o.collab_show_event_in_partner_events_tab === true,
    collab_partner_allow_edit_tab: o.collab_partner_allow_edit_tab === true,
    collab_partner_allow_tickets_tab: o.collab_partner_allow_tickets_tab === true,
    collab_partner_allow_scan_tab: o.collab_partner_allow_scan_tab === true,
  };
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const { toast } = useToast();

  const tabParam = searchParams.get('tab') as EventDetailTab | null;
  const [activeTab, setActiveTab] = useState<EventDetailTab>('tickets');
  const [loading, setLoading] = useState(true);
  const [eventExists, setEventExists] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [collabUi, setCollabUi] = useState<CollabEventPartnerUiFlags | null>(null);
  const [publicHostOrg, setPublicHostOrg] = useState<{ slug: string | null; name: string } | null>(null);

  const isHost = !!(event && currentOrg && event.org_id === currentOrg.id);

  const allowedTabs = useMemo(() => {
    const s = new Set<EventDetailTab>();
    if (!event || !currentOrg) return s;
    if (event.org_id === currentOrg.id) {
      s.add('tickets');
      s.add('edit');
      s.add('scan');
      return s;
    }
    const u = collabUi;
    if (!u?.is_collab_partner) return s;
    if (u.collab_partner_allow_tickets_tab) s.add('tickets');
    if (u.collab_partner_allow_edit_tab) s.add('edit');
    if (u.collab_partner_allow_scan_tab) s.add('scan');
    return s;
  }, [event, currentOrg, collabUi]);

  const tabGridClass =
    allowedTabs.size <= 1
      ? 'grid-cols-1'
      : allowedTabs.size === 2
        ? 'grid-cols-2'
        : 'grid-cols-3';

  useEffect(() => {
    if (!id || !currentOrg) return;

    const loadEvent = async () => {
      try {
        const eventData = await getEvent(id);
        if (!eventData) {
          toast({
            title: 'Error',
            description: 'Event not found',
            variant: 'destructive',
          });
          navigate('/app/catalog?tab=events');
          return;
        }

        let partnerFlags: CollabEventPartnerUiFlags | null = null;

        if (eventData.org_id !== currentOrg.id) {
          const { data: rawFlags, error: flagsError } = await supabase.rpc(
            'collab_event_partner_ui_flags',
            { p_event_id: id },
          );
          if (flagsError) {
            throw flagsError;
          }
          partnerFlags = parseCollabFlags(rawFlags);
          if (!partnerFlags.is_collab_partner) {
            toast({
              title: 'Error',
              description: 'You do not have access to this event',
              variant: 'destructive',
            });
            navigate('/app/catalog?tab=events');
            return;
          }

          const { data: orgRow } = await supabase
            .from('orgs')
            .select('slug, name')
            .eq('id', eventData.org_id)
            .single();
          setPublicHostOrg({
            slug: orgRow?.slug ?? null,
            name: orgRow?.name ?? 'Host',
          });
        } else {
          partnerFlags = null;
          setPublicHostOrg({
            slug: currentOrg.slug ?? null,
            name: currentOrg.name ?? 'Organization',
          });
        }

        const allowed = new Set<EventDetailTab>();
        if (eventData.org_id === currentOrg.id) {
          allowed.add('tickets');
          allowed.add('edit');
          allowed.add('scan');
        } else if (partnerFlags) {
          if (partnerFlags.collab_partner_allow_tickets_tab) allowed.add('tickets');
          if (partnerFlags.collab_partner_allow_edit_tab) allowed.add('edit');
          if (partnerFlags.collab_partner_allow_scan_tab) allowed.add('scan');
        }

        if (allowed.size === 0) {
          toast({
            title: 'No access',
            description: 'This collaboration does not include any dashboard tabs for this event.',
            variant: 'destructive',
          });
          navigate('/app/catalog?tab=events');
          return;
        }

        setCollabUi(partnerFlags);
        setEvent(eventData);
        setEventExists(true);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load event';
        toast({
          title: 'Error',
          description: message,
          variant: 'destructive',
        });
        navigate('/app/catalog?tab=events');
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [id, currentOrg, navigate, toast]);

  const firstAllowedTab = useCallback((): EventDetailTab => {
    const found = TAB_ORDER.find((t) => allowedTabs.has(t));
    return found ?? 'tickets';
  }, [allowedTabs]);

  useEffect(() => {
    if (loading || !eventExists || allowedTabs.size === 0) return;

    const first = firstAllowedTab();
    const tp = tabParam && allowedTabs.has(tabParam) ? tabParam : null;

    if (tp) {
      setActiveTab(tp);
    } else {
      setActiveTab(first);
      setSearchParams({ tab: first }, { replace: true });
    }
  }, [loading, eventExists, tabParam, allowedTabs, firstAllowedTab, setSearchParams]);

  const handleTabChange = (value: string) => {
    const newTab = value as EventDetailTab;
    if (!allowedTabs.has(newTab)) return;
    setActiveTab(newTab);
    setSearchParams({ tab: newTab });
  };

  const publicSlug = publicHostOrg?.slug ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (!eventExists || !id) {
    return null;
  }

  return (
    <div className="w-full max-w-7xl mx-auto pb-12 px-4 overflow-x-hidden">
      <div className="mb-2 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/app/catalog?tab=events')}
              className="text-xs md:text-sm truncate"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Events
            </Button>
          </div>

          {event?.slug && publicSlug && (
            <div className="flex items-center gap-2 flex-nowrap">
              <Button
                variant="outline"
                size="icon"
                onClick={async () => {
                  const url = `https://growbrohk.com/${publicSlug}/${event.slug}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    toast({ title: 'Copied!', description: 'Link copied to clipboard' });
                  } catch {
                    toast({ title: 'Error', description: 'Failed to copy link', variant: 'destructive' });
                  }
                }}
                aria-label="Copy link"
              >
                <Copy className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const url = `https://growbrohk.com/${publicSlug}/${event.slug}`;
                  window.open(url, '_blank');
                }}
                aria-label="Open link"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div
          className="sticky top-0 z-10 backdrop-blur-xl border-b mb-0"
          style={{
            borderColor: 'rgba(14,122,58,0.12)',
            backgroundColor: 'rgba(251,248,244,0.95)',
          }}
        >
          <div className="px-4 py-2 md:py-3">
            <TabsList className={cn('grid w-full', tabGridClass)}>
              {allowedTabs.has('edit') && (
                <TabsTrigger value="edit" className="text-xs md:text-sm py-2 md:py-1.5">
                  Edit
                </TabsTrigger>
              )}
              {allowedTabs.has('tickets') && (
                <TabsTrigger value="tickets" className="text-xs md:text-sm py-2 md:py-1.5">
                  Tickets
                </TabsTrigger>
              )}
              {allowedTabs.has('scan') && (
                <TabsTrigger value="scan" className="text-xs md:text-sm py-2 md:py-1.5">
                  Scan
                </TabsTrigger>
              )}
            </TabsList>
          </div>
        </div>

        {allowedTabs.has('tickets') && (
          <TabsContent value="tickets" className="mt-0">
            <EventTicketsTab eventId={id} />
          </TabsContent>
        )}

        {allowedTabs.has('edit') && (
          <TabsContent value="edit" className="mt-0">
            {!isHost && collabUi?.collab_partner_allow_edit_tab && event && publicHostOrg ? (
              <EventForm
                collabEditorContext={{
                  hostOrgId: event.org_id,
                  hostOrgSlug: publicHostOrg.slug,
                  hostOrgName: publicHostOrg.name,
                }}
              />
            ) : isHost ? (
              <EventForm />
            ) : null}
          </TabsContent>
        )}

        {allowedTabs.has('scan') && (
          <TabsContent value="scan" className="mt-0">
            <EventScanTab eventId={id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
