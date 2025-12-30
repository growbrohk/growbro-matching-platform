import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { getPublicEventBySlugs, getTicketTypes, getOrgBySlug } from '@/lib/api/events';
import type { Event, TicketType } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TicketSelection {
  ticketTypeId: string;
  quantity: number;
}

export default function PublicEventPage() {
  const { orgSlug, eventSlug } = useParams<{ orgSlug: string; eventSlug: string }>();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [org, setOrg] = useState<any>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [showContinueDialog, setShowContinueDialog] = useState(false);

  // Reserved org slugs that should not be used
  const RESERVED_ORG_SLUGS = ['app', 'login', 'events', 'admin', 'api', 'auth', 'onboarding', 'book', 'r'];

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

    fetchEvent();
  }, [orgSlug, eventSlug]);

  const fetchEvent = async () => {
    if (!orgSlug || !eventSlug) return;

    try {
      setLoading(true);
      
      // Fetch event by slugs
      const eventData = await getPublicEventBySlugs(orgSlug, eventSlug);
      
      if (!eventData || eventData.status !== 'published') {
        setEvent(null);
        setLoading(false);
        return;
      }

      setEvent(eventData);

      // Fetch org info
      const orgData = await getOrgBySlug(orgSlug);
      setOrg(orgData);

      // Fetch ticket types
      const types = await getTicketTypes(eventData.id);
      setTicketTypes(types);

      // Initialize selections
      const initialSelections: Record<string, number> = {};
      types.forEach(tt => {
        initialSelections[tt.id] = 0;
      });
      setSelections(initialSelections);
    } catch (error) {
      console.error('Error fetching event:', error);
      setEvent(null);
    } finally {
      setLoading(false);
    }
  };

  // Check if a ticket type is available for purchase
  const isTicketAvailable = (tt: TicketType): { available: boolean; reason?: string } => {
    if (!event) return { available: false, reason: 'Event not found' };

    const now = new Date();
    const eventEndAt = new Date(event.end_at);

    // Hard cutoff: if event has ended, all tickets are unavailable
    if (now > eventEndAt) {
      return { available: false, reason: 'Event ended' };
    }

    // For scheduled tickets: check sales_end_at if it exists (in metadata or as a field)
    // Effective end time = min(ticket.sales_end_at, event.end_at)
    const salesEndAt = (tt as any).sales_end_at 
      ? new Date((tt as any).sales_end_at) 
      : tt.metadata?.sales_end_at 
        ? new Date(tt.metadata.sales_end_at) 
        : null;

    if (salesEndAt) {
      const effectiveEndAt = salesEndAt < eventEndAt ? salesEndAt : eventEndAt;
      if (now > effectiveEndAt) {
        return { available: false, reason: 'Sales closed' };
      }
    }

    return { available: true };
  };

  // Reset unavailable ticket quantities to 0
  useEffect(() => {
    if (!event || ticketTypes.length === 0) return;

    const checkAndResetUnavailable = () => {
      setSelections(prev => {
        const updated = { ...prev };
        let changed = false;

        ticketTypes.forEach(tt => {
          const availability = isTicketAvailable(tt);
          if (!availability.available && (prev[tt.id] || 0) > 0) {
            updated[tt.id] = 0;
            changed = true;
          }
        });

        return changed ? updated : prev;
      });
    };

    checkAndResetUnavailable();
    
    // Check periodically (every minute) to catch tickets that become unavailable
    const interval = setInterval(checkAndResetUnavailable, 60000);
    
    return () => clearInterval(interval);
  }, [event, ticketTypes]);

  const updateQuantity = (ticketTypeId: string, quantity: number) => {
    const ticketType = ticketTypes.find(tt => tt.id === ticketTypeId);
    if (!ticketType) return;

    const availability = isTicketAvailable(ticketType);
    if (!availability.available) {
      // Don't allow selection if ticket is unavailable
      return;
    }

    setSelections(prev => ({
      ...prev,
      [ticketTypeId]: Math.max(0, Math.min(4, quantity))
    }));
  };

  const calculateSubtotal = (): number => {
    return ticketTypes.reduce((total, tt) => {
      const qty = selections[tt.id] || 0;
      return total + (tt.price * qty);
    }, 0);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const hasSelections = () => {
    // Only count selections for available tickets
    return ticketTypes.some(tt => {
      const availability = isTicketAvailable(tt);
      return availability.available && (selections[tt.id] || 0) > 0;
    });
  };

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

  const subtotal = calculateSubtotal();

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card className="rounded-2xl">
          <CardHeader className="space-y-4 pb-6">
            {/* Event Title */}
            <h1 className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
              {event.title}
            </h1>

            {/* Org Name */}
            <p className="text-sm text-muted-foreground">
              {org.name}
            </p>

            {/* Date & Time */}
            <div className="space-y-1">
              <p className="text-base font-medium" style={{ color: '#0F1F17' }}>
                {formatDate(event.start_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatTime(event.start_at)} - {formatTime(event.end_at)}
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Description */}
            {event.description && (
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                  Description
                </p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {event.description}
                </p>
              </div>
            )}

            {/* Tickets Section */}
            {ticketTypes.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                  Tickets
                </p>
                {ticketTypes.map((tt) => {
                  const availability = isTicketAvailable(tt);
                  const isUnavailable = !availability.available;
                  
                  return (
                    <div
                      key={tt.id}
                      className={`border rounded-lg p-4 space-y-3 ${isUnavailable ? 'opacity-60' : ''}`}
                      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-base" style={{ color: '#0F1F17' }}>
                            {tt.name}
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-base font-medium" style={{ color: '#0F1F17' }}>
                              ${tt.price.toFixed(2)}
                            </span>
                            {tt.quota < 999999 && (
                              <span className="text-xs text-muted-foreground">
                                {tt.quota} available
                              </span>
                            )}
                          </div>
                          {isUnavailable && (
                            <p className="text-xs text-red-600 mt-1">
                              {availability.reason || 'Unavailable'}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-muted-foreground">Quantity:</label>
                        <Select
                          value={(selections[tt.id] || 0).toString()}
                          onValueChange={(value) => updateQuantity(tt.id, parseInt(value))}
                          disabled={isUnavailable}
                        >
                          <SelectTrigger className="w-24" disabled={isUnavailable}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[0, 1, 2, 3, 4].map((num) => (
                              <SelectItem key={num} value={num.toString()}>
                                {num}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary & CTA */}
            <div className="pt-4 border-t space-y-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                  Subtotal
                </span>
                <span className="text-base font-semibold" style={{ color: '#0F1F17' }}>
                  ${subtotal.toFixed(2)}
                </span>
              </div>
              <Button
                onClick={() => setShowContinueDialog(true)}
                disabled={!hasSelections()}
                className="w-full"
                style={{ backgroundColor: '#0E7A3A' }}
              >
                Continue
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                You will confirm details on the next step.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by Growbro
          </p>
        </div>
      </div>

      {/* Continue Dialog */}
      <Dialog open={showContinueDialog} onOpenChange={setShowContinueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Your Selection</DialogTitle>
            <DialogDescription>
              Review your ticket selections before proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {ticketTypes
              .filter(tt => (selections[tt.id] || 0) > 0)
              .map(tt => (
                <div key={tt.id} className="flex justify-between items-center">
                  <span className="text-sm">
                    {tt.name} × {selections[tt.id]}
                  </span>
                  <span className="text-sm font-medium">
                    ${(tt.price * (selections[tt.id] || 0)).toFixed(2)}
                  </span>
                </div>
              ))}
            <div className="pt-4 border-t flex justify-between items-center font-semibold">
              <span>Total</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="pt-4">
              <p className="text-sm text-muted-foreground text-center">
                Checkout functionality coming soon. This is a placeholder dialog.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

