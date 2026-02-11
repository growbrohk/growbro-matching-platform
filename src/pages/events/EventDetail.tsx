import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EventForm from './EventForm.new';
import { EventTicketsTab } from './EventTicketsTab';
import { EventScanTab } from './EventScanTab';
import { getEvent } from '@/lib/api/events';
import { useToast } from '@/hooks/use-toast';

type EventDetailTab =  'edit'| 'tickets' | 'scan';

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const { toast } = useToast();

  const tabParam = searchParams.get('tab') as EventDetailTab | null;
  const [activeTab, setActiveTab] = useState<EventDetailTab>(
    (tabParam && ['tickets', 'edit', 'scan'].includes(tabParam)) ? tabParam : 'tickets'
  );
  const [loading, setLoading] = useState(true);
  const [eventExists, setEventExists] = useState(false);

  // Load event to verify access
  useEffect(() => {
    if (!id || !currentOrg) return;

    const loadEvent = async () => {
      try {
        const event = await getEvent(id);
        if (!event) {
          toast({
            title: 'Error',
            description: 'Event not found',
            variant: 'destructive',
          });
          navigate('/app/catalog?tab=events');
          return;
        }

        if (event.org_id !== currentOrg.id) {
          toast({
            title: 'Error',
            description: 'You do not have access to this event',
            variant: 'destructive',
          });
          navigate('/app/catalog?tab=events');
          return;
        }

        setEventExists(true);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to load event',
          variant: 'destructive',
        });
        navigate('/app/catalog?tab=events');
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [id, currentOrg, navigate, toast]);

  // Sync tab state with URL
  useEffect(() => {
    if (tabParam && ['tickets', 'edit', 'scan'].includes(tabParam)) {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      setSearchParams({ tab: 'tickets' }, { replace: true });
    }
  }, [tabParam, setSearchParams]);

  const handleTabChange = (value: string) => {
    const newTab = value as EventDetailTab;
    setActiveTab(newTab);
    setSearchParams({ tab: newTab });
  };

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
      {/* Header */}
      <div className="mb-2 overflow-hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/app/catalog?tab=events')}
          className="text-xs md:text-sm"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Events
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="sticky top-0 z-10 backdrop-blur-xl border-b mb-0" style={{
          borderColor: "rgba(14,122,58,0.12)",
          backgroundColor: "rgba(251,248,244,0.95)",
        }}>
          <div className="px-4 py-2 md:py-3">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="edit" className="text-xs md:text-sm py-2 md:py-1.5">Edit</TabsTrigger>
              <TabsTrigger value="tickets" className="text-xs md:text-sm py-2 md:py-1.5">Tickets</TabsTrigger>
              <TabsTrigger value="scan" className="text-xs md:text-sm py-2 md:py-1.5">Scan</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="tickets" className="mt-0">
          <EventTicketsTab eventId={id} />
        </TabsContent>

        <TabsContent value="edit" className="mt-0">
          <EventForm />
        </TabsContent>

        <TabsContent value="scan" className="mt-0">
          <EventScanTab eventId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
