import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getEventsForBrand, deleteEvent } from '@/lib/api/ticketing';
import { EventRecord } from '@/lib/types/ticketing';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Loader2, Calendar, MapPin } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';

interface EventWithStats extends EventRecord {
  ticket_types_count: number;
  total_capacity: number;
  tickets_sold: number;
}

export default function EventsList() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<EventRecord | null>(null);

  useEffect(() => {
    if (profile) {
      fetchEvents();
    }
  }, [profile]);

  const fetchEvents = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data: eventsData, error: eventsError } = await getEventsForBrand(profile.id);
      if (eventsError) throw eventsError;

      // Fetch ticket product stats for each event
      const eventsWithStats = await Promise.all(
        (eventsData || []).map(async (event) => {
          const { data: ticketProducts, error: ticketProductsError } = await supabase
            .from('ticket_products')
            .select('capacity_total, capacity_remaining')
            .eq('event_id', event.id);

          if (ticketProductsError) {
            console.error('Error fetching ticket products:', ticketProductsError);
            return {
              ...event,
              ticket_types_count: 0,
              total_capacity: 0,
              tickets_sold: 0,
            };
          }

          const totalCapacity =
            ticketProducts?.reduce((sum, tp) => sum + (tp.capacity_total || 0), 0) || 0;
          const totalRemaining =
            ticketProducts?.reduce((sum, tp) => sum + (tp.capacity_remaining || 0), 0) || 0;
          const ticketsSold = totalCapacity - totalRemaining;

          return {
            ...event,
            ticket_types_count: ticketProducts?.length || 0,
            total_capacity: totalCapacity,
            tickets_sold: ticketsSold,
          };
        })
      );

      setEvents(eventsWithStats);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load events',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!eventToDelete || !profile) return;

    setDeletingId(eventToDelete.id);
    try {
      const { error } = await deleteEvent(eventToDelete.id, profile);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Event deleted successfully',
      });
      setDeleteDialogOpen(false);
      setEventToDelete(null);
      fetchEvents();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete event',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Events</h1>
            <p className="text-muted-foreground mt-1">
              Manage your event ticket products
            </p>
          </div>
          <Button onClick={() => navigate('/events/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Events ({events.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No events yet</p>
                <Button onClick={() => navigate('/events/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Event
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Name</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Ticket Types</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Tickets Sold</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{formatDate(event.date_start)}</span>
                          <span className="text-muted-foreground">-</span>
                          <span>{formatDate(event.date_end)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {event.location_name ? (
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{event.location_name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.ticket_types_count}</Badge>
                      </TableCell>
                      <TableCell>{event.total_capacity}</TableCell>
                      <TableCell>
                        <span className="font-medium">{event.tickets_sold}</span>
                        <span className="text-muted-foreground text-sm ml-1">
                          / {event.total_capacity}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/events/${event.id}/edit`)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEventToDelete(event);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={deletingId === event.id}
                          >
                            {deletingId === event.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Event</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{eventToDelete?.name}"? This action cannot be undone
                and will delete all associated ticket types and tickets.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

