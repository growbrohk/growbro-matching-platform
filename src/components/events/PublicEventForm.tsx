import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { Event, TicketType, TicketTypeAccessVariant } from '@/lib/types';
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
import { formatTicketTypeDateTime, formatSalesWindow } from '@/lib/utils/datetime';
import {
  formatEventTimeSlotsList,
  formatSlotRange,
  getConfiguredTimeSlots,
  getSlotRemainingForTicketType,
  getSlotStartAt,
  getValidEndTimestamp,
  getValidForSlotsLabel,
  hasMultipleTimeSlots,
  isAllAccessValidForDays,
  ticketTypeAppliesToSlot,
  ticketTypeUsesPickOneSlots,
  type TimeSlotKey,
} from '@/lib/utils/event-time-slots';
import {
  BookingDraft,
  saveBookingDraft,
} from '@/lib/types/booking';

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
  const multiSlotEvent = hasMultipleTimeSlots(event);
  const configuredTimeSlots = useMemo(() => getConfiguredTimeSlots(event), [event]);
  const timeSlotsList = useMemo(() => formatEventTimeSlotsList(event), [event]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlotKey | null>(null);

  const handleSelectTimeSlot = (slotKey: TimeSlotKey) => {
    setSelectedTimeSlot(slotKey);
    setSelections((prev) => {
      const updated = { ...prev };
      ticketTypes.forEach((tt) => {
        if (!isAllAccessValidForDays(tt.valid_for_days)) {
          updated[tt.id] = 0;
        }
      });
      return updated;
    });
  };

  const getEffectiveRemaining = useCallback((
    tt: TicketType,
    variant: TicketTypeAccessVariant | null,
    slotKey?: TimeSlotKey | null
  ): number | undefined => {
    if (variant?.quota != null && variant.remaining_count != null) {
      return variant.remaining_count;
    }
    if (slotKey && ticketTypeUsesPickOneSlots(tt)) {
      return getSlotRemainingForTicketType(tt, slotKey);
    }
    if (tt.remaining_count !== undefined) return tt.remaining_count;
    if (tt.quota < 999999) return tt.quota;
    return undefined;
  }, []);

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

    const ticketValidEndTime = getValidEndTimestamp(event, tt.valid_for_days);

    // Hard cutoff: if event has ended (with 5-minute safety margin), ticket is unavailable
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    if (nowTime > (ticketValidEndTime + FIVE_MINUTES_MS)) {
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
      
      // Check end time: effective end = min(available_end_at, ticket's valid window end)
      const effectiveEndAt = availableEndAt 
        ? (availableEndAt.getTime() < ticketValidEndTime ? availableEndAt : new Date(ticketValidEndTime))
        : new Date(ticketValidEndTime);
      const effectiveEndTimeVal = effectiveEndAt.getTime();
      
      // Add safety margin: if we're within 5 minutes after end, still allow
      if (nowTime > (effectiveEndTimeVal + FIVE_MINUTES_MS)) {
        return { available: false, reason: 'Sales closed' };
      }
      
      return { available: true };
    }

    // Fallback: if unknown mode, treat as unavailable
    return { available: false, reason: 'Unknown availability mode' };
  }, [event]);

  // Resolve matching variant and effective price for a ticket type
  const resolveVariantAndPrice = useCallback((tt: TicketType): { variant: TicketTypeAccessVariant | null; effectivePrice: number; discountPercent: number | null } | null => {
    const basePrice = tt.price;
    const variants = tt.access_variants || [];

    if (variants.length === 0) {
      // Legacy: use visibility_mode/access_code/allowed_affiliates
      const mode = tt.visibility_mode || 'public';
      if (mode === 'hidden') return null;
      if (mode === 'public') return { variant: null, effectivePrice: basePrice, discountPercent: null };
      if (mode === 'code') {
        if (codeParam === null || codeParam !== tt.access_code) return null;
        return { variant: null, effectivePrice: basePrice, discountPercent: null };
      }
      if (mode === 'affiliate') {
        if (!refParam) return null;
        if (tt.allowed_affiliates && tt.allowed_affiliates.length > 0 && !tt.allowed_affiliates.includes(refParam)) return null;
        return { variant: null, effectivePrice: basePrice, discountPercent: null };
      }
      return null;
    }

    // Filter to active variants only
    const activeVariants = variants.filter(v => (v as any).is_active !== false && v.is_active !== false);
    if (activeVariants.length === 0) return null;

    // Find matching variant (priority: code > affiliate > public)
    // Supabase returns snake_case; support both for robustness
    const vMode = (v: TicketTypeAccessVariant) => (v as any).visibility_mode ?? v.visibility_mode;
    const vCode = (v: TicketTypeAccessVariant) => (v as any).access_code ?? v.access_code;
    const vAffiliates = (v: TicketTypeAccessVariant) => (v as any).allowed_affiliates ?? v.allowed_affiliates;
    const vPriceOverride = (v: TicketTypeAccessVariant) => (v as any).price_override ?? (v as any).priceOverride ?? v.price_override;
    const vDiscountPercent = (v: TicketTypeAccessVariant) => (v as any).discount_percent ?? (v as any).discountPercent ?? v.discount_percent;
    const vQuota = (v: TicketTypeAccessVariant) => (v as any).quota ?? v.quota;
    const vRemaining = (v: TicketTypeAccessVariant) => (v as any).remaining_count ?? v.remaining_count;

    const hasQuotaRemaining = (v: TicketTypeAccessVariant) => {
      const quota = vQuota(v);
      if (quota == null) return true;
      const remaining = vRemaining(v);
      return remaining == null || remaining > 0;
    };

    let matched: TicketTypeAccessVariant | null = null;
    if (codeParam) {
      const codeVariant = activeVariants.find(v => vMode(v) === 'code' && vCode(v) === codeParam && hasQuotaRemaining(v));
      if (codeVariant) matched = codeVariant;
    }
    if (!matched && refParam) {
      const affiliateVariant = activeVariants.find(v => {
        const mode = vMode(v);
        const allowed = vAffiliates(v);
        return mode === 'affiliate' && (!allowed || allowed.length === 0 || allowed.includes(refParam)) && hasQuotaRemaining(v);
      });
      if (affiliateVariant) matched = affiliateVariant;
    }
    if (!matched) {
      const publicVariant = activeVariants.find(v => vMode(v) === 'public' && hasQuotaRemaining(v));
      if (publicVariant) matched = publicVariant;
    }
    if (!matched) return null;

    const priceOverride = vPriceOverride(matched);
    const discountPercentVal = vDiscountPercent(matched);
    let effectivePrice = basePrice;
    if (priceOverride != null && priceOverride !== '') {
      effectivePrice = Number(priceOverride);
    } else if (discountPercentVal != null && discountPercentVal !== '') {
      effectivePrice = basePrice * (1 - Number(discountPercentVal) / 100);
    }
    const discountPercent = effectivePrice < basePrice
      ? Math.round((1 - effectivePrice / basePrice) * 100)
      : null;
    return { variant: matched, effectivePrice, discountPercent };
  }, [codeParam, refParam]);

  // Visible tickets with resolved variant and effective price
  const visibleTicketTypesWithPrice = useMemo(() => {
    return ticketTypes
      .map(tt => ({ tt, resolved: resolveVariantAndPrice(tt) }))
      .filter((x): x is { tt: TicketType; resolved: NonNullable<ReturnType<typeof resolveVariantAndPrice>> } => x.resolved !== null)
      .map(({ tt, resolved }) => ({ tt, ...resolved }));
  }, [ticketTypes, resolveVariantAndPrice]);

  const visibleTicketTypes = visibleTicketTypesWithPrice.map(x => x.tt);

  const slotScopedTicketsWithPrice = useMemo(() => {
    if (!multiSlotEvent || !selectedTimeSlot) return [];
    return visibleTicketTypesWithPrice.filter(({ tt }) =>
      ticketTypeAppliesToSlot(tt.valid_for_days, selectedTimeSlot, tt.valid_for_slots)
    );
  }, [visibleTicketTypesWithPrice, multiSlotEvent, selectedTimeSlot]);

  const allAccessTicketsWithPrice = useMemo(() => {
    if (!multiSlotEvent) return [];
    return visibleTicketTypesWithPrice.filter(({ tt }) =>
      isAllAccessValidForDays(tt.valid_for_days)
    );
  }, [visibleTicketTypesWithPrice, multiSlotEvent]);

  const singleSlotTicketsWithPrice = useMemo(() => {
    if (multiSlotEvent) return [];
    return visibleTicketTypesWithPrice;
  }, [visibleTicketTypesWithPrice, multiSlotEvent]);

  const ticketsForDisplay = multiSlotEvent
    ? [...slotScopedTicketsWithPrice, ...allAccessTicketsWithPrice]
    : singleSlotTicketsWithPrice;

  // Check if there are any code-only or affiliate-only tickets (for hint messages)
  const hasCodeOnlyTickets = ticketTypes.some(tt => {
    const variants = tt.access_variants || [];
    if (variants.length > 0) {
      return variants.some(v => v.visibility_mode === 'code') && !variants.some(v => v.visibility_mode === 'public');
    }
    return (tt.visibility_mode || 'public') === 'code';
  });
  const hasAffiliateOnlyTickets = ticketTypes.some(tt => {
    const variants = tt.access_variants || [];
    if (variants.length > 0) {
      return variants.some(v => v.visibility_mode === 'affiliate') && !variants.some(v => v.visibility_mode === 'public');
    }
    return (tt.visibility_mode || 'public') === 'affiliate';
  });

  const getTicketVisibility = useCallback((tt: TicketType): boolean => {
    return resolveVariantAndPrice(tt) !== null;
  }, [resolveVariantAndPrice]);

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

  const updateQuantity = (ticketTypeId: string, quantity: number, maxRemaining?: number) => {
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
      const cap = maxRemaining != null ? Math.min(4, maxRemaining) : 4;
      const newQty = Math.max(0, Math.min(cap, quantity));
      const updated = {
        ...prev,
        [ticketTypeId]: newQty
      };
      console.log(`✅ [PublicEventForm] Setting quantity for "${ticketType.name}" to ${newQty}. Previous: ${prev[ticketTypeId] || 0}`);
      return updated;
    });
  };

  const calculateSubtotal = (): number => {
    return visibleTicketTypesWithPrice.reduce((total, { tt, effectivePrice }) => {
      const qty = selections[tt.id] || 0;
      return total + (effectivePrice * qty);
    }, 0);
  };

  const hasSelections = () => {
    return ticketsForDisplay.some(({ tt }) => {
      const availability = isTicketAvailable(tt);
      return availability.available && (selections[tt.id] || 0) > 0;
    });
  };

  const renderTicketCard = (
    { tt, effectivePrice, discountPercent, variant }: {
      tt: TicketType;
      effectivePrice: number;
      discountPercent: number | null;
      variant: TicketTypeAccessVariant | null;
    },
    options?: { slotKey?: TimeSlotKey | null; hideDateTime?: boolean }
  ) => {
    const slotKey = options?.slotKey ?? null;
    const availability = isTicketAvailable(tt);
    const isUnavailable = !availability.available;
    const showDiscount = discountPercent != null && discountPercent > 0;
    const remainingCount = getEffectiveRemaining(tt, variant, slotKey ?? selectedTimeSlot);
    const showSlotLabel = multiSlotEvent && isAllAccessValidForDays(tt.valid_for_days);

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
              {showSlotLabel && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({getValidForSlotsLabel(tt, configuredTimeSlots)})
                </span>
              )}
            </h3>
            {!options?.hideDateTime && !multiSlotEvent && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatTicketTypeDateTime(event, tt, slotKey ?? undefined)}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {showDiscount ? (
                <>
                  <span className="text-sm text-muted-foreground line-through">${tt.price.toFixed(2)}</span>
                  <span className="text-base font-medium" style={{ color: '#0E7A3A' }}>${effectivePrice.toFixed(2)}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(14,122,58,0.15)', color: '#0E7A3A' }}>
                    {discountPercent}% off
                  </span>
                </>
              ) : (
                <span className="text-base font-medium" style={{ color: '#0F1F17' }}>
                  ${effectivePrice.toFixed(2)}
                </span>
              )}
              {(() => {
                const showRemaining = tt.show_remaining_count !== false;
                if (!showRemaining || remainingCount === undefined) return null;
                if (tt.threshold_to_show != null && remainingCount > tt.threshold_to_show) return null;
                return (
                  <span className="text-xs text-muted-foreground">
                    {remainingCount} remaining
                  </span>
                );
              })()}
            </div>
            {tt.description && tt.description.trim() && (
              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                {tt.description.trim()}
              </p>
            )}
            {isUnavailable && (
              <p className="text-xs text-red-600 mt-1">
                {availability.reason || 'Unavailable'}
                {tt.availability_mode === 'scheduled' &&
                  tt.available_start_at &&
                  tt.available_end_at &&
                  (availability.reason === 'Sales not started' || availability.reason === 'Sales closed') && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {formatSalesWindow(tt.available_start_at, tt.available_end_at)}
                    </span>
                  )}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Quantity:</label>
          <Select
            value={(selections[tt.id] || 0).toString()}
            onValueChange={(value) => updateQuantity(tt.id, parseInt(value), remainingCount)}
            disabled={isUnavailable || (multiSlotEvent && !isAllAccessValidForDays(tt.valid_for_days) && !selectedTimeSlot)}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(() => {
                const maxQty = remainingCount != null ? Math.min(4, remainingCount) : 4;
                return [0, 1, 2, 3, 4].filter(n => n <= maxQty);
              })().map((num) => (
                <SelectItem key={num} value={num.toString()}>
                  {num}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
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

    // Build booking draft from selections (use effective price for discounted variants)
    const lines: BookingDraft['lines'] = [];
    visibleTicketTypesWithPrice.forEach(({ tt, effectivePrice, variant }) => {
      const qty = selections[tt.id] || 0;
      if (qty > 0) {
        const isAllAccess = isAllAccessValidForDays(tt.valid_for_days);
        const timeSlot = !isAllAccess && multiSlotEvent ? selectedTimeSlot ?? undefined : undefined;
        const finalQty = Math.max(1, qty);
        lines.push({
          label: tt.name,
          optionLabel: 'Adult',
          unitPrice: effectivePrice,
          qty: finalQty,
          ticketTypeId: tt.id,
          ticketTypeAccessVariantId: variant?.id ?? null,
          dateTimeLabel: isAllAccess
            ? formatTicketTypeDateTime(event, tt)
            : formatTicketTypeDateTime(event, tt, timeSlot),
          timeSlot: timeSlot ?? undefined,
        });
      }
    });

    // Only proceed if there are valid selections
    if (lines.length === 0) {
      return;
    }

    // Compute dateLabel from purchased slot when pick-one, else from ticket type valid_for_days
    let dateLabel: string;
    const pickOneLineSlot = lines.find((l) => l.timeSlot)?.timeSlot;
    if (pickOneLineSlot) {
      dateLabel = formatDateForBooking(getSlotStartAt(event, pickOneLineSlot));
    } else {
      const uniqueValidFor = [...new Set(
        lines.map((l) => visibleTicketTypes.find((t) => t.id === l.ticketTypeId)?.valid_for_days || 'day_1')
      )];
      if (uniqueValidFor.length === 1) {
        dateLabel = formatDateForBooking(getSlotStartAt(event, uniqueValidFor[0]));
      } else {
        dateLabel = formatDateForBooking(event.start_at);
      }
    }

    // Create booking draft
    const draft: BookingDraft = {
      eventId: event.id,
      eventTitle: event.title,
      dateLabel,
      currency: 'HKD',
      lines,
      savedAt: new Date().toISOString(),
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
                    <span className="text-sm text-muted-foreground">Date & Time:</span>
                    {multiSlotEvent ? (
                      <ol className="list-decimal list-inside space-y-0.5 mt-1">
                        {timeSlotsList.map((slot) => (
                          <li key={slot.key} className="text-base font-medium" style={{ color: '#0F1F17' }}>
                            {slot.label}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <>
                        {' '}
                        <span className="text-base font-medium" style={{ color: '#0F1F17' }}>
                          {formatSlotRange(event.start_at, event.end_at)}
                        </span>
                      </>
                    )}
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
                  cacheKey={event.updated_at}
                  mode={mode}
                />
              </div>
            </div>

            {/* Mobile: Media Block below header */}
            <div className="md:hidden">
              <EventMediaBlock 
                previewImageUrl={event.instagram_preview_image_url} 
                cacheKey={event.updated_at}
                mode={mode}
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Description */}
            <EventDescription text={event.description} />

            {/* Tickets Section */}
            {ticketTypes.length > 0 && (
              <div className="space-y-4">
                {multiSlotEvent && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                      1. Choose a time slot
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {configuredTimeSlots.map((slot) => {
                        const isSelected = selectedTimeSlot === slot.key;
                        const slotAvailability = visibleTicketTypesWithPrice.reduce((sum, { tt, variant }) => {
                          if (!ticketTypeAppliesToSlot(tt.valid_for_days, slot.key, tt.valid_for_slots)) return sum;
                          const remaining = getEffectiveRemaining(tt, variant, slot.key);
                          return sum + (remaining ?? 0);
                        }, 0);
                        return (
                          <button
                            key={slot.key}
                            type="button"
                            onClick={() => handleSelectTimeSlot(slot.key)}
                            className={`text-left border rounded-lg p-3 transition-colors ${
                              isSelected ? 'ring-2 ring-[#0E7A3A] bg-[#0E7A3A]/5' : 'hover:bg-muted/50'
                            }`}
                            style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                          >
                            <span className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                              {slot.slotNumber}. {formatSlotRange(slot.startAt, slot.endAt)}
                            </span>
                            {slotAvailability > 0 && (
                              <span className="block text-xs text-muted-foreground mt-0.5">
                                Tickets available
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {multiSlotEvent && selectedTimeSlot && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                      2. Choose tickets
                    </p>
                    {slotScopedTicketsWithPrice.length > 0 ? (
                      slotScopedTicketsWithPrice.map((item) =>
                        renderTicketCard(item, { slotKey: selectedTimeSlot, hideDateTime: true })
                      )
                    ) : (
                      <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                        No tickets available for this time slot.
                      </div>
                    )}
                  </div>
                )}

                {multiSlotEvent && allAccessTicketsWithPrice.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                      All-access tickets
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Valid for all time slots — no slot selection required.
                    </p>
                    {allAccessTicketsWithPrice.map((item) => renderTicketCard(item))}
                  </div>
                )}

                {!multiSlotEvent && (
                  <>
                    <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                      Tickets
                    </p>
                    {visibleTicketTypes.length > 0 ? (
                      singleSlotTicketsWithPrice.map((item) => renderTicketCard(item))
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
                  </>
                )}

                {multiSlotEvent && visibleTicketTypes.length === 0 && (
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
              {visibleTicketTypesWithPrice
                .filter(({ tt }) => (selections[tt.id] || 0) > 0)
                .map(({ tt, effectivePrice }) => (
                  <div key={tt.id} className="flex justify-between items-center">
                    <span className="text-sm">
                      {tt.name} × {selections[tt.id]}
                    </span>
                    <span className="text-sm font-medium">
                      ${(effectivePrice * (selections[tt.id] || 0)).toFixed(2)}
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

