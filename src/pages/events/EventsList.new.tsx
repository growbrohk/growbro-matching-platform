import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Calendar, Edit } from 'lucide-react';
import { getTicketTypes } from '@/lib/api/events';
import type { Event } from '@/lib/types';

interface EventsListProps {
  isEmbeddedInCatalog?: boolean;
}

export default function EventsList({ isEmbeddedInCatalog = false }: EventsListProps = {}) {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);

  const canCreate = !!currentOrg?.id;

  useEffect(() => {
    if (currentOrg?.id) {
      fetchEvents();
    }
  }, [currentOrg?.id]);

  const fetchEvents = async () => {
    if (!currentOrg?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('start_at', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error: any) {
      console.error('Error fetching events:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load events',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-700';
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  return (
    <div className={`w-full min-w-0 ${isEmbeddedInCatalog ? 'px-4 py-6' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} space-y-4 md:space-y-6`}>
      {/* Header - Only show when NOT embedded in Catalog */}
      {!isEmbeddedInCatalog && (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight truncate" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
              Events & Ticketing
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Manage your events and ticket sales
            </p>
          </div>
          <Button
            onClick={() => navigate('/app/events/new')}
            disabled={!canCreate}
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 shrink-0"
            title="Create new event"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline sm:ml-2">New Event</span>
          </Button>
        </div>
      )}

      {/* Embedded header - Show when embedded in Catalog */}
      {isEmbeddedInCatalog && (
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-semibold truncate" style={{ color: '#0F1F17' }}>
              Events
            </h2>
          </div>
          <Button
            onClick={() => navigate('/app/events/new')}
            disabled={!canCreate}
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 shrink-0"
            title="Create new event"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline sm:ml-2">New Event</span>
          </Button>
        </div>
      )}

      {/* Events List */}
      {events.length === 0 ? (
        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardContent className="flex flex-col items-center justify-center py-16 p-4 md:p-6">
            <Calendar className="h-16 w-16 mb-4" style={{ color: '#0E7A3A', opacity: 0.3 }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: '#0F1F17' }}>
              No events yet
            </h3>
            <p className="text-center text-muted-foreground mb-6 max-w-md">
              Get started by creating your first event with ticket sales
            </p>
            <Button
              onClick={() => navigate('/app/events/new')}
              disabled={!canCreate}
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Event
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 w-full min-w-0">
          {events.map((event) => (
            <Card
              key={event.id}
              className="cursor-pointer hover:shadow-md transition-shadow w-full min-w-0"
              onClick={() => navigate(`/app/events/${event.id}/edit`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="truncate">{event.title}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {event.description || 'No description'}
                    </CardDescription>
                  </div>
                  <Badge className={getStatusColor(event.status)} variant="secondary">
                    {event.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(event.start_at)}</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                    {formatDate(event.end_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/app/events/${event.id}/edit`);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
