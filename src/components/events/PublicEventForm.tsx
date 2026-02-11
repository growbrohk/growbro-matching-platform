import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { Event, TicketType } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import EventDescription from '@/components/events/EventDescription';
import EventMediaBlock from '@/components/events/EventMediaBlock';
import { formatEventDate, formatEventTime } from '@/lib/utils/datetime';
import {
  BookingDraft,
  saveBookingDraft,
} from '@/lib/types/booking';

/**
 * Format datetime as "dd-MM-yyyy HH:mm" (24-hour format)
 * Example: "04-01-2026 23:55"
 */
function formatTillDateTime(dateString: string): string {
  const date = new Date(dateString);
  
  // Convert to Hong Kong timezone for display
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  
  return `${day}-${month}-${year} ${hour}:${minute}`;
}

interface Org {
  id: string;
  name: string;
  slug?: string;
}

interface PublicEventFormProps {
  event: Event;
  org: Org;
  ticketTypes: TicketType[];
  mode: 'public' | 'preview';
  codeParam?: string | null;
  refParam?: string | null;
  initialSelections?: Record<string, number>;
}

export default function PublicEventForm({
  event,
  org,
  ticketTypes,
  mode,
  codeParam = null,
  refParam = null,
  initialSelections = {},
}: PublicEventFormProps) {
  const navigate = useNavigate();
  const [selections, setSelections] = useState<Record<string, number>>(initialSelections);
  const [showContinueDialog, setShowContinueDialog] = useState(false);

  // Initialize selections from props - ONLY if selections are currently empty
  // Use functional update to avoid overwriting user choices
  useEffect(() => {
    setSelections(prev => {
      // If user has already made selections, don't overwrite them
      const hasUserSelections = Object.values(prev).some(qty => qty > 0);
      if (hasUserSelections) {
        console.log('[PublicEventForm] Preserving user selections, skipping initialization');
        return prev;
      }

      // If initialSelections provided, use them
      if (Object.keys(initialSelections).length > 0) {
        console.log('[PublicEventForm] Initializing from initialSelections prop');
        return initialSelections;
      }

      // Otherwise, initialize empty selections for all ticket types
      const initial: Record<string, number> = {};
      ticketTypes.forEach(tt => {
        initial[tt.id] = 0;
      });
      console.log('[PublicEventForm] Initializing empty selections for', ticketTypes.length, 'ticket types');
      return initial;
    });
  }, [ticketTypes, initialSelections]);

  // Check if a ticket type is available for purchase
  // Memoized to prevent unnecessary recalculations
  // Added 5-minute safety margin to prevent clock drift issues
  const isTicketAvailable = useCallback((tt: TicketType): { available: boolean; reason?: string } => {
    if (!event) return { available: false, reason: 'Event not found' };

    // Layer 1: Manual admin-controlled toggle: if is_active is false, ticket is not available
    if (tt.is_active === false) {
      return { available: false, reason: 'Not on sale' };
    }

    // Use UTC time for consistent comparisons (database dates are UTC)
    const now = new Date();
    const nowTime = now.getTime();
    
    // Parse UTC date strings correctly - ensure they're parsed as UTC
    // Handle both ISO strings and ensure proper UTC parsing
    const parseUTCDate = (dateString: string): Date => {
      // If it's already a valid ISO string, new Date() will parse it correctly
      // But ensure we're comparing UTC to UTC
      const date = new Date(dateString);
      // Validate the date was parsed correctly
      if (isNaN(date.getTime())) {
        console.error('[PublicEventForm] Invalid date string:', dateString);
        return new Date(0); // Return epoch as fallback
      }
      return date;
    };

    const eventEndAt = parseUTCDate(event.end_at);
    const eventEndTime = eventEndAt.getTime();

    // Hard cutoff: if event has ended (with 5-minute safety margin), all tickets are unavailable
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    if (nowTime > (eventEndTime + FIVE_MINUTES_MS)) {
      return { available: false, reason: 'Event ended' };
    }

    // Layer 2: Time-based availability rules
    // Ensure availability_mode defaults to 'always' if null/undefined
    const availabilityMode = tt.availability_mode || 'always';
    
    if (availabilityMode === 'always') {
      // Always available (until event ends, which is already checked above)
      return { available: true };
    }
    
    if (availabilityMode === 'scheduled') {
      // Check if we're within the scheduled availability window
      const availableStartAt = tt.available_start_at ? parseUTCDate(tt.available_start_at) : null;
      const availableEndAt = tt.available_end_at ? parseUTCDate(tt.available_end_at) : null;
      
      // If scheduled but no times set, treat as unavailable (validation should prevent this)
      if (!availableStartAt && !availableEndAt) {
        return { available: false, reason: 'Sales not scheduled' };
      }
      
      // Check start time: if set and we're before it (with safety margin), not available yet
      if (availableStartAt) {
        const startTime = availableStartAt.getTime();
        // Add safety margin: if we're within 5 minutes before start, still allow
        if (nowTime < (startTime - FIVE_MINUTES_MS)) {
          return { available: false, reason: 'Sales not started' };
        }
      }
      
      // Check end time: effective end = min(available_end_at, event.end_at)
      const effectiveEndAt = availableEndAt 
        ? (availableEndAt.getTime() < eventEndTime ? availableEndAt : eventEndAt)
        : eventEndAt;
      const effectiveEndTime = effectiveEndAt.getTime();
      
      // Add safety margin: if we're within 5 minutes after end, still allow
      if (nowTime > (effectiveEndTime + FIVE_MINUTES_MS)) {
        return { available: false, reason: 'Sales closed' };
      }
      
      return { available: true };
    }

    // Fallback: if unknown mode, treat as unavailable
    return { available: false, reason: 'Unknown availability mode' };
  }, [event]);

  // Filter visible tickets
  const visibleTicketTypes = ticketTypes.filter(tt => {
    const visibilityMode = tt.visibility_mode || 'public';
    
    // Hidden tickets are never visible
    if (visibilityMode === 'hidden') {
      return false;
    }
    
    // Public tickets are always visible (even if inactive, they'll be shown as disabled)
    if (visibilityMode === 'public') {
      return true;
    }
    
    // Code-gated tickets require matching code
    if (visibilityMode === 'code') {
      return codeParam !== null && codeParam === tt.access_code;
    }
    
    // Affiliate-gated tickets require ref param
    if (visibilityMode === 'affiliate') {
      if (!refParam) {
        return false;
      }
      // If allowed_affiliates is set, ref must be in the list
      if (tt.allowed_affiliates && tt.allowed_affiliates.length > 0) {
        return tt.allowed_affiliates.includes(refParam);
      }
      // If allowed_affiliates is null/empty, any ref unlocks it
      return true;
    }
    
    return false;
  });
  
  // Check if there are any code-only or affiliate-only tickets (for hint messages)
  const hasCodeOnlyTickets = ticketTypes.some(tt => (tt.visibility_mode || 'public') === 'code');
  const hasAffiliateOnlyTickets = ticketTypes.some(tt => (tt.visibility_mode || 'public') === 'affiliate');

  // Memoize visibility check to prevent unnecessary recalculations
  const getTicketVisibility = useCallback((tt: TicketType): boolean => {
    const visibilityMode = tt.visibility_mode || 'public';
    
    if (visibilityMode === 'hidden') return false;
    if (visibilityMode === 'public') return true;
    if (visibilityMode === 'code') {
      return codeParam !== null && codeParam === tt.access_code;
    }
    if (visibilityMode === 'affiliate') {
      if (!refParam) return false;
      if (tt.allowed_affiliates && tt.allowed_affiliates.length > 0) {
        return tt.allowed_affiliates.includes(refParam);
      }
      return true;
    }
    return false;
  }, [codeParam, refParam]);

  // Track previous code/ref params to detect actual changes
  const prevCodeParamRef = useRef(codeParam);
  const prevRefParamRef = useRef(refParam);

  // Separate effect to handle visibility changes (code/ref param changes)
  // This should only reset when visibility actually changes, not on every render
  useEffect(() => {
    if (!event || ticketTypes.length === 0) return;
    
    // Only reset if codeParam or refParam actually changed
    const codeChanged = prevCodeParamRef.current !== codeParam;
    const refChanged = prevRefParamRef.current !== refParam;
    
    if (!codeChanged && !refChanged) {
      // Update refs but don't reset selections
      prevCodeParamRef.current = codeParam;
      prevRefParamRef.current = refParam;
      return;
    }
    
    // Update refs
    prevCodeParamRef.current = codeParam;
    prevRefParamRef.current = refParam;
    
    // Only reset visibility-based selections when codeParam or refParam actually changes
    setSelections(prev => {
      const updated = { ...prev };
      let changed = false;

      ticketTypes.forEach(tt => {
        const isVisible = getTicketVisibility(tt);
        
        // Remove selections for tickets that are no longer visible
        if (!isVisible && prev[tt.id] !== undefined) {
          delete updated[tt.id];
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, [codeParam, refParam, ticketTypes, getTicketVisibility, event]);

  // Only reset unavailable tickets periodically - do NOT reset on dependency changes
  // This effect sets up a periodic check but does NOT run immediately
  useEffect(() => {
    if (!event || ticketTypes.length === 0) return;

    const checkAndResetUnavailable = () => {
      setSelections(prev => {
        const updated = { ...prev };
        let changed = false;

        ticketTypes.forEach(tt => {
          const isVisible = getTicketVisibility(tt);
          
          // Remove selections for invisible tickets
          if (!isVisible && prev[tt.id] !== undefined) {
            const currentQty = prev[tt.id] || 0;
            if (currentQty > 0) {
              console.log(`🔴 RESETTING TICKET "${tt.name}" TO 0 BECAUSE: Ticket is no longer visible`);
              delete updated[tt.id];
              changed = true;
            }
            return;
          }
          
          // Only check availability for visible tickets
          // Only reset if ticket was previously selected (> 0) and NOW becomes unavailable
          if (isVisible) {
            const availability = isTicketAvailable(tt);
            const currentQty = prev[tt.id] || 0;
            // Only reset if ticket was selected and is now unavailable
            // Double-check: ensure availability_mode exists or defaults correctly
            const availabilityMode = tt.availability_mode || 'always';
            if (!availability.available && currentQty > 0) {
              // Additional safety: if availability_mode is missing/null, don't reset
              // This prevents false positives from date parsing issues
              if (availabilityMode === 'always' && availability.reason !== 'Event ended' && availability.reason !== 'Not on sale') {
                console.warn(`⚠️ [PublicEventForm] Skipping reset for "${tt.name}" - availability_mode is 'always' but marked unavailable:`, availability.reason);
                return; // Don't reset if it's 'always' mode and not clearly ended/disabled
              }
              console.log(`🔴 RESETTING TICKET "${tt.name}" TO 0 BECAUSE: ${availability.reason || 'Unavailable'}`);
              updated[tt.id] = 0;
              changed = true;
            }
          }
        });

        return changed ? updated : prev;
      });
    };

    // Only run periodic checks (every minute) - do NOT run immediately
    // This prevents the "select then immediately reset" behavior
    const interval = setInterval(checkAndResetUnavailable, 60000);
    
    return () => clearInterval(interval);
  }, [event, ticketTypes, codeParam, refParam, isTicketAvailable, getTicketVisibility]);

  const updateQuantity = (ticketTypeId: string, quantity: number) => {
    console.log(`🟢 [PublicEventForm] updateQuantity called: ticketTypeId=${ticketTypeId}, quantity=${quantity}`);
    
    const ticketType = ticketTypes.find(tt => tt.id === ticketTypeId);
    if (!ticketType) {
      console.warn(`[PublicEventForm] Ticket type not found: ${ticketTypeId}`);
      return;
    }

    const availability = isTicketAvailable(ticketType);
    if (!availability.available) {
      console.log(`[PublicEventForm] Cannot select quantity - ticket unavailable: ${availability.reason}`);
      // Don't allow selection if ticket is unavailable
      return;
    }

    // Use functional update to ensure we're working with latest state
    setSelections(prev => {
      const newQty = Math.max(0, Math.min(4, quantity));
      const updated = {
        ...prev,
        [ticketTypeId]: newQty
      };
      console.log(`✅ [PublicEventForm] Setting quantity for "${ticketType.name}" to ${newQty}. Previous: ${prev[ticketTypeId] || 0}`);
      return updated;
    });
  };

  const calculateSubtotal = (): number => {
    return visibleTicketTypes.reduce((total, tt) => {
      const qty = selections[tt.id] || 0;
      return total + (tt.price * qty);
    }, 0);
  };

  const hasSelections = () => {
    // Only count selections for visible and available tickets
    return visibleTicketTypes.some(tt => {
      const availability = isTicketAvailable(tt);
      return availability.available && (selections[tt.id] || 0) > 0;
    });
  };

  const subtotal = calculateSubtotal();

  // Format date as "12 Jan 2026" for booking draft
  const formatDateForBooking = (dateString: string): string => {
    const date = new Date(dateString);
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return formatter.format(date);
  };

  const handleContinue = () => {
    if (mode === 'preview') {
      // In preview mode, just show a message instead of opening dialog
      return;
    }

    // Build booking draft from selections
    const lines: BookingDraft['lines'] = [];
    visibleTicketTypes.forEach((tt) => {
      const qty = selections[tt.id] || 0;
      if (qty > 0) {
        // Ensure qty is at least 1
        const finalQty = Math.max(1, qty);
        lines.push({
          label: tt.name, // e.g., "1-Day Ticket"
          optionLabel: 'Adult', // Default to "Adult" for now
          unitPrice: tt.price,
          qty: finalQty,
          ticketTypeId: tt.id,
        });
      }
    });

    // Only proceed if there are valid selections
    if (lines.length === 0) {
      return;
    }

    // Create booking draft
    const draft: BookingDraft = {
      eventId: event.id,
      eventTitle: event.title,
      dateLabel: formatDateForBooking(event.start_at),
      currency: 'HKD',
      lines,
    };

    // Save to localStorage
    saveBookingDraft(draft);

    // Navigate to checkout
    navigate(`/events/${event.id}/checkout`);
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card className="rounded-2xl">
          <CardHeader className="space-y-4 pb-6">
            {/* Header: Title + Meta on left, Media on right */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6">
              {/* Left Column: Title and Meta */}
              <div className="space-y-4 min-w-0">
                {/* Event Title */}
                <h1 className="text-3xl font-bold" style={{ color: '#0F1F17' }}>
                  {event.title}
                </h1>

                {/* Org Name */}
                <p className="text-sm text-muted-foreground">
                  {org.name}
                </p>

                {/* Date, Time, Location */}
                <div className="space-y-1 break-words">
                  <div>
                    <span className="text-sm text-muted-foreground">Date:</span>{' '}
                    <span className="text-base font-medium" style={{ color: '#0F1F17' }}>{formatEventDate(event.start_at)}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Time:</span>{' '}
                    <span className="text-base font-medium" style={{ color: '#0F1F17' }}>{formatEventTime(event.start_at, event.end_at)}</span>
                  </div>
                  {event.location_text && (
                    <div>
                      <span className="text-sm text-muted-foreground">Location:</span>{' '}
                      <span className="text-base font-medium" style={{ color: '#0F1F17' }}>{event.location_text}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Instagram Media Block */}
              <div className="hidden md:block">
                <EventMediaBlock 
                  previewImageUrl={event.instagram_preview_image_url} 
                  mode={mode}
                />
              </div>
            </div>

            {/* Mobile: Media Block below header */}
            <div className="md:hidden">
              <EventMediaBlock 
                previewImageUrl={event.instagram_preview_image_url} 
                mode={mode}
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Description */}
            <EventDescription text={event.description} initialWordLimit={50} />

            {/* Tickets Section */}
            {ticketTypes.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                  Tickets
                </p>
                {visibleTicketTypes.length > 0 ? (
                  visibleTicketTypes.map((tt) => {
                    const availability = isTicketAvailable(tt);
                    const isUnavailable = !availability.available;
                    
                    // Determine end datetime: ticket.sales_end_at (available_end_at) or fallback to event.end_at
                    const endDateTime = tt.available_end_at || event.end_at;
                    const showTillLabel = !!endDateTime;
                    
                    return (
                      <div
                        key={tt.id}
                        className={`border rounded-lg p-4 space-y-3 ${isUnavailable ? 'opacity-60' : ''}`}
                        style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-base" style={{ color: '#0F1F17' }}>
                              {tt.name}
                            </h3>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-base font-medium" style={{ color: '#0F1F17' }}>
                                ${tt.price.toFixed(2)}
                              </span>
                              {(() => {
                                // Show remaining count logic:
                                // 1. If show_remaining_count is false, don't show
                                // 2. If threshold_to_show is set, only show when remaining_count <= threshold_to_show
                                // 3. Otherwise, show if remaining_count is available
                                const showRemaining = tt.show_remaining_count !== false;
                                const remainingCount = tt.remaining_count !== undefined ? tt.remaining_count : (tt.quota < 999999 ? tt.quota : undefined);
                                
                                if (!showRemaining || remainingCount === undefined) {
                                  return null;
                                }
                                
                                if (tt.threshold_to_show !== null && tt.threshold_to_show !== undefined) {
                                  // Only show if remaining_count <= threshold_to_show
                                  if (remainingCount > tt.threshold_to_show) {
                                    return null;
                                  }
                                }
                                
                                return (
                                  <span className="text-xs text-muted-foreground">
                                    {remainingCount} {remainingCount === 1 ? 'remaining' : 'remaining'}
                                  </span>
                                );
                              })()}
                            </div>
                            {isUnavailable && (
                              <p className="text-xs text-red-600 mt-1">
                                {availability.reason || 'Unavailable'}
                              </p>
                            )}
                          </div>
                          {showTillLabel && (
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                              till {formatTillDateTime(endDateTime)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-muted-foreground">Quantity:</label>
                          <Select
                            value={(selections[tt.id] || 0).toString()}
                            onValueChange={(value) => updateQuantity(tt.id, parseInt(value))}
                            disabled={isUnavailable}
                          >
                            <SelectTrigger className="w-24">
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
                  })
                ) : (
                  <div className="border rounded-lg p-8 text-center" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                    <p className="text-base font-medium mb-2" style={{ color: '#0F1F17' }}>
                      No tickets available for this link.
                    </p>
                    <div className="text-sm space-y-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
                      {!refParam && hasAffiliateOnlyTickets && (
                        <p>Try an affiliate link (?ref=...)</p>
                      )}
                      {!codeParam && hasCodeOnlyTickets && (
                        <p>Try a code (?code=...)</p>
                      )}
                    </div>
                  </div>
                )}
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
              {mode === 'preview' ? (
                <Button
                  disabled
                  className="w-full"
                  style={{ backgroundColor: '#0E7A3A', opacity: 0.6 }}
                >
                  Preview Only
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleContinue}
                    disabled={!hasSelections()}
                    className="w-full"
                    style={{ backgroundColor: '#0E7A3A' }}
                  >
                    Continue
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    You will confirm details on the next step.
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        {mode === 'public' && (
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Powered by Growbro
            </p>
          </div>
        )}
      </div>

      {/* Continue Dialog - Only shown in public mode */}
      {mode === 'public' && (
        <Dialog open={showContinueDialog} onOpenChange={setShowContinueDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Your Selection</DialogTitle>
              <DialogDescription>
                Review your ticket selections before proceeding.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {visibleTicketTypes
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
      )}
    </div>
  );
}

