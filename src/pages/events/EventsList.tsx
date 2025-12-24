import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Edit } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type EventRow = {
  id: string;
  org_id: string;
  venue_org_id: string | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  created_at: string;
};

type TicketTypeRow = {
  id: string;
  event_id: string;
  quota: number;
};

export default function EventsList() {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [ticketTypesByEvent, setTicketTypesByEvent] = useState<Record<string, TicketTypeRow[]>>({});

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<EventRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const statsByEvent = useMemo(() => {
    const map: Record<string, { ticketTypesCount: number; totalQuota: number }> = {};
    for (const [eventId, types] of Object.entries(ticketTypesByEvent)) {
      map[eventId] = {
        ticketTypesCount: types.length,
        totalQuota: types.reduce((sum, t) => sum + (t.quota || 0), 0),
      };
    }
    return map;
  }, [ticketTypesByEvent]);

  useEffect(() => {
    if (!currentOrg) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data: eventsData, error: eventsErr } = await supabase
          .from('events')
          .select('id, org_id, venue_org_id, title, description, start_at, end_at, status, created_at')
          .eq('org_id', currentOrg.id)
          .order('start_at', { ascending: false });

        if (eventsErr) throw eventsErr;
        const evts = ((eventsData as any) as EventRow[]) || [];
        setEvents(evts);

        const eventIds = evts.map((e) => e.id);
        if (eventIds.length === 0) {
          setTicketTypesByEvent({});
          setError(null);
          return;
        }

        const { data: ticketTypesData, error: ttErr } = await supabase
          .from('ticket_types')
          .select('id, event_id, quota')
          .in('event_id', eventIds);

        if (ttErr) throw ttErr;
        const tts = ((ticketTypesData as any) as TicketTypeRow[]) || [];
        const grouped: Record<string, TicketTypeRow[]> = {};
        for (const t of tts) {
          if (!grouped[t.event_id]) grouped[t.event_id] = [];
          grouped[t.event_id].push(t);
        }
        setTicketTypesByEvent(grouped);
        setError(null);
      } catch (e: any) {
        const msg = e?.message || 'Failed to load events';
        setError(msg);
        toast({ title: 'Error', description: msg, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentOrg, toast]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const handleDelete = async () => {
    if (!eventToDelete) return;
    setDeletingId(eventToDelete.id);
    try {
      const { error: delErr } = await supabase.from('events').delete().eq('id', eventToDelete.id);
      if (delErr) throw delErr;

      setEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
      toast({ title: 'Deleted', description: 'Event deleted successfully' });
      setDeleteDialogOpen(false);
      setEventToDelete(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to delete event', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Events
          </h1>
          <p className="mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Events in {currentOrg?.name || 'your org'}
          </p>
        </div>
        <Button onClick={() => navigate('/app/events/new')} style={{ backgroundColor: '#0E7A3A', color: 'white' }} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Event
        </Button>
      </div>

      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle>Events ({events.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground mb-4">No events yet</p>
              <Button onClick={() => navigate('/app/events/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Event
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="p-3 md:p-4">Title</TableHead>
                    <TableHead className="p-3 md:p-4 hidden sm:table-cell">Start</TableHead>
                    <TableHead className="p-3 md:p-4 hidden sm:table-cell">End</TableHead>
                    <TableHead className="p-3 md:p-4">Status</TableHead>
                    <TableHead className="p-3 md:p-4 hidden md:table-cell">Ticket Types</TableHead>
                    <TableHead className="p-3 md:p-4 hidden md:table-cell">Quota</TableHead>
                    <TableHead className="text-right p-3 md:p-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => {
                    const stats = statsByEvent[e.id] || { ticketTypesCount: 0, totalQuota: 0 };
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium p-3 md:p-4">{e.title}</TableCell>
                        <TableCell className="p-3 md:p-4 hidden sm:table-cell text-sm">{formatDateTime(e.start_at)}</TableCell>
                        <TableCell className="p-3 md:p-4 hidden sm:table-cell text-sm">{formatDateTime(e.end_at)}</TableCell>
                        <TableCell className="p-3 md:p-4">
                          <Badge variant="outline">{e.status}</Badge>
                        </TableCell>
                        <TableCell className="p-3 md:p-4 hidden md:table-cell">{stats.ticketTypesCount}</TableCell>
                        <TableCell className="p-3 md:p-4 hidden md:table-cell">{stats.totalQuota}</TableCell>
                        <TableCell className="text-right p-3 md:p-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/app/events/${e.id}/edit`)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEventToDelete(e);
                                setDeleteDialogOpen(true);
                              }}
                              disabled={deletingId === e.id}
                            >
                              {deletingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="p-4 md:p-6">
          <AlertDialogHeader className="space-y-4">
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{eventToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deletingId !== null} className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive w-full sm:w-auto" disabled={deletingId !== null}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


