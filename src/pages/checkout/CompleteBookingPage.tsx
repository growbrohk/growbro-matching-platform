import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ArrowLeft, ChevronUp, ChevronDown, X, ShoppingCart } from 'lucide-react';
import {
  BookingDraft,
  BookingDraftAddonLine,
  ContactInfo,
  AttendeeInfo,
  loadBookingDraft,
  saveContactInfo,
  loadContactInfo,
  saveBookingDraft,
} from '@/lib/types/booking';
import { formatEventDate } from '@/lib/utils/datetime';
import { getEvent, getTicketTypes } from '@/lib/api/events';
import { getVariantConfig } from '@/lib/api/variant-config';
import { getEventAddonsForCheckout, type EventAddonForCheckout } from '@/lib/api/event-addons';
import HierarchicalVariantSelectGroup from '@/components/products/HierarchicalVariantSelectGroup';
import { getUniqueVariantOptionNames, getVariantOptionValue } from '@/lib/utils/variant-parser';
import { collectProductPhotoUrls } from '@/lib/utils/product-media';
import { ProductMerchandiseLayout } from '@/components/products/ProductMerchandiseLayout';
import {
  addonEnforcesStock,
  resolvedVariantId,
  stockRemainingForVariant,
  maxQtyPrimary,
  maxQtyPerTicketAttendee,
  computeAddonStockOrderError,
  getAddonDisplayPrices,
} from '@/lib/utils/event-addon-stock';
import { createBooking, confirmFreeOrder, getOrderWithEvent } from '@/lib/api/bookings';
import { clearBookingDraft } from '@/lib/types/booking';
import { revalidateBookingDraftVariants } from '@/lib/utils/booking-draft-validation';
import { useToast } from '@/hooks/use-toast';
import type { Event } from '@/lib/types';
import { ContactInfoCard } from '@/components/booking/ContactInfoCard';
import {
  DEFAULT_EVENT_TICKET_TERMS,
  DEFAULT_MARKETING_OPT_IN_LABEL,
} from '@/lib/constants/eventTicketTerms';

function getAddonProductPhotos(addon: EventAddonForCheckout): string[] {
  const raw = addon.gallery_urls;
  const gUrls = Array.isArray(raw)
    ? raw.filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  return collectProductPhotoUrls({
    image_url: addon.product_image_url,
    metadata: gUrls.length > 0 ? { gallery_urls: gUrls } : undefined,
  });
}

function formatAddonHkd(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function AddonPriceDisplay({
  list,
  effective,
  isDiscounted,
  size = 'pdp',
}: {
  list: number;
  effective: number;
  isDiscounted: boolean;
  size?: 'pdp' | 'compact';
}) {
  const cls = size === 'pdp' ? 'text-xl md:text-2xl font-semibold' : 'text-lg font-semibold';
  if (effective <= 0) {
    return (
      <p className={cls} style={{ color: '#0E7A3A' }}>
        Free
      </p>
    );
  }
  if (isDiscounted) {
    return (
      <div className="flex flex-col items-end sm:items-start gap-0.5 text-right sm:text-left">
        <span className="text-sm text-muted-foreground line-through" aria-label={`List price ${formatAddonHkd(list)}`}>
          {formatAddonHkd(list)}
        </span>
        <p className={cls} style={{ color: '#0E7A3A' }}>
          {formatAddonHkd(effective)}
        </p>
      </div>
    );
  }
  return (
    <p className={cls} style={{ color: '#0E7A3A' }}>
      {formatAddonHkd(effective)}
    </p>
  );
}

function EventAddonVariantSelect({
  addon,
  selectedVariantId,
  onVariantChange,
  variantRankOrder,
  variantValueOrders,
  disabled,
  compact,
}: {
  addon: EventAddonForCheckout;
  selectedVariantId: string | undefined;
  onVariantChange: (id: string | null) => void;
  variantRankOrder: string[];
  variantValueOrders: Record<string, string[]>;
  disabled: boolean;
  compact?: boolean;
}) {
  const variantRows = useMemo(
    () => addon.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })),
    [addon.variants],
  );

  const isValueDisabled = (optionName: string, value: string, prefix: Record<string, string>) => {
    if (!addonEnforcesStock(addon)) return false;
    const candidates = addon.variants.filter(
      (v) =>
        getVariantOptionValue(v.name, optionName) === value &&
        Object.entries(prefix).every(([k, pv]) => getVariantOptionValue(v.name, k) === pv),
    );
    return candidates.length > 0 && candidates.every((v) => (v.stock_remaining ?? 0) <= 0);
  };

  /** Promote Version before Size when both exist (org rank may list Size first). */
  const effectiveRankOrder = useMemo(() => {
    const unique = getUniqueVariantOptionNames(variantRows.map((v) => v.name));
    const versionName = unique.find((n) => n.toLowerCase() === 'version');
    if (!versionName) return variantRankOrder;
    return [versionName, ...variantRankOrder.filter((n) => n !== versionName)];
  }, [variantRows, variantRankOrder]);

  return (
    <HierarchicalVariantSelectGroup
      instanceKey={addon.product_id}
      variants={variantRows}
      selectedVariantId={selectedVariantId ?? null}
      onVariantChange={onVariantChange}
      variantRankOrder={effectiveRankOrder}
      variantValueOrders={variantValueOrders}
      autoSelectFirst={false}
      disabled={disabled}
      triggerClassName={compact ? 'h-9 rounded-xl w-full' : 'w-full rounded-2xl'}
      labelClassName={compact ? 'text-xs' : 'text-sm font-medium'}
      hierarchicalContentClassName="max-h-60 max-w-[90vw] !overflow-auto"
      flatContentClassName="max-h-60 max-w-[90vw] !overflow-auto"
      flatViewportClassName="min-w-[min(20rem,90vw)] w-max"
      isValueDisabled={isValueDisabled}
      flatItemDisabled={(v) => addonEnforcesStock(addon) && (v.stock_remaining ?? 0) <= 0}
      flatItemSuffix={(v) => (
        <>
          {' '}
          – HK$ {v.price.toFixed(0)}
          {addonEnforcesStock(addon) ? (
            (v.stock_remaining ?? 0) <= 0 ? (
              <span className="text-destructive"> (Out of stock)</span>
            ) : (
              <span className="text-muted-foreground"> ({v.stock_remaining} left)</span>
            )
          ) : null}
        </>
      )}
    />
  );
}

function AddonQuantityAndCta({
  density,
  productTitle,
  variantLabel,
  draftQty,
  onDraftChange,
  committedQty,
  onCommit,
  onRemove,
  outOfStock,
  maxQ,
  enforced,
  canCommit,
  quantityLabel = 'Quantity',
  inputClassName,
}: {
  density: 'pdp' | 'compact';
  productTitle: string;
  variantLabel?: string | null;
  draftQty: number;
  onDraftChange: (n: number) => void;
  onCommit: () => void;
  onRemove: () => void;
  outOfStock: boolean;
  maxQ: number;
  enforced: boolean;
  canCommit: boolean;
  quantityLabel?: string;
  inputClassName: string;
}) {
  const labelCls = density === 'pdp' ? 'text-sm font-medium' : 'text-xs';
  const commitDisabled =
    outOfStock || !canCommit || draftQty < 1 || (committedQty > 0 && draftQty === committedQty);
  const ctaLabel = committedQty > 0 ? 'Update' : 'Add to cart';
  const h = density === 'pdp' ? 'h-12' : 'h-10';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className={labelCls} style={density === 'pdp' ? { color: '#0F1F17' } : undefined}>
          {quantityLabel}
        </label>
        <Input
          type="number"
          min={1}
          max={enforced ? maxQ : undefined}
          value={draftQty}
          disabled={outOfStock}
          onChange={(e) => {
            const raw = Math.max(0, parseInt(e.target.value, 10) || 0);
            const q = enforced ? Math.min(raw, maxQ) : raw;
            onDraftChange(q);
          }}
          className={inputClassName}
        />
      </div>
      {committedQty > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'rgba(15,31,23,0.85)' }}>
          <span>
            In order: <span className="font-semibold">{committedQty}</span>
          </span>
          <button
            type="button"
            className="text-sm font-medium hover:underline"
            style={{ color: '#0E7A3A' }}
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 pt-1">
        <Button
          type="button"
          onClick={onCommit}
          disabled={commitDisabled}
          size="lg"
          className={`w-full ${h} rounded-2xl font-bold ${
            !commitDisabled ? 'text-white hover:opacity-95' : ''
          }`}
          style={!commitDisabled ? { backgroundColor: '#0E7A3A' } : undefined}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}

export default function CompleteBookingPage() {
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();
  const { toast } = useToast();
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
  });
  const [attendees, setAttendees] = useState<AttendeeInfo[]>([]);
  // Per-attendee: indices of attendees that use Contact info (UI-only, not persisted)
  const [useContactAsAttendee, setUseContactAsAttendee] = useState<Set<number>>(() => new Set());
  // Attendee 1 collapsible: collapsed by default to save vertical space
  const [attendee1Expanded, setAttendee1Expanded] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showPriceSheet, setShowPriceSheet] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tcAccepted, setTcAccepted] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [eventAddons, setEventAddons] = useState<EventAddonForCheckout[]>([]);
  // addonSelections: product_id -> { variantId?, qty } (primary mode)
  const [addonSelections, setAddonSelections] = useState<Record<string, { variantId?: string; qty: number }>>({});
  // addonSelectionsByAttendee: attendeeIndex -> product_id -> { variantId?, qty } (per-ticket mode)
  const [addonSelectionsByAttendee, setAddonSelectionsByAttendee] = useState<
    Record<number, Record<string, { variantId?: string; qty: number }>>
  >({});
  const [addonVariantRankOrder, setAddonVariantRankOrder] = useState<string[]>([]);
  const [addonVariantValueOrders, setAddonVariantValueOrders] = useState<Record<string, string[]>>({});
  /** Controlled main image index per add-on product (PDP-style gallery). */
  const [addonPhotoIndexByProduct, setAddonPhotoIndexByProduct] = useState<Record<string, number>>({});
  /** Per-ticket add-ons: key `${attendeeIndex}-${productId}` */
  const [perTicketAddonPhotoIndex, setPerTicketAddonPhotoIndex] = useState<Record<string, number>>({});
  /** Draft qty for add-on number inputs; committed qty lives in `addonSelections` (primary). */
  const [addonDraftQty, setAddonDraftQty] = useState<Record<string, number>>({});
  /** Per-ticket draft qty: attendeeIndex -> productId -> draft */
  const [addonDraftQtyByAttendee, setAddonDraftQtyByAttendee] = useState<
    Record<number, Record<string, number>>
  >({});

  // Load booking draft and event on mount
  useEffect(() => {
    const draft = loadBookingDraft();
    if (!draft) {
      // Redirect back if no draft found
      navigate('/');
      return;
    }
    setBookingDraft(draft);

    // Load saved contact info
    const savedContact = loadContactInfo();
    if (savedContact) {
      setContactInfo(savedContact);
    }

    // Fetch event data
    const fetchEvent = async () => {
      if (draft.eventId) {
        try {
          const eventData = await getEvent(draft.eventId);
          if (eventData) {
            setEvent(eventData);
            
            // Initialize attendees array if per-ticket collection is required
            if (eventData.collect_attendee_info === 'per_ticket') {
              const totalTickets = draft.lines.reduce((sum, line) => sum + line.qty, 0);
              const initialAttendees: AttendeeInfo[] = [];
              
              // Create attendee entries for each ticket
              draft.lines.forEach((line) => {
                for (let i = 0; i < line.qty; i++) {
                  initialAttendees.push({
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    ticketTypeId: line.ticketTypeId,
                  });
                }
              });
              
              // Load saved attendees if available
              if (draft.attendees && draft.attendees.length === totalTickets) {
                setAttendees(draft.attendees);
                setUseContactAsAttendee(new Set()); // No preset when loading from draft
              } else {
                // Fresh init: preset Attendee 1 to use contact info, sync from contact
                if (initialAttendees.length > 0 && savedContact) {
                  initialAttendees[0] = {
                    ...initialAttendees[0],
                    firstName: savedContact.firstName,
                    lastName: savedContact.lastName,
                    email: savedContact.email,
                    phone: savedContact.phone,
                  };
                }
                setAttendees(initialAttendees);
                setUseContactAsAttendee(new Set([0])); // Preset Attendee 1
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch event:', error);
        }
      }
    };

    const fetchAddons = async () => {
      if (draft?.eventId) {
        try {
          const addons = await getEventAddonsForCheckout(draft.eventId);
          setEventAddons(addons);
        } catch (err) {
          console.error('Failed to fetch event addons:', err);
        }
      }
    };

    const revalidateDraftVariants = async () => {
      if (!draft?.eventId) return;
      try {
        const ticketTypes = await getTicketTypes(draft.eventId, true, true);
        const { draft: validatedDraft, changed, message } = revalidateBookingDraftVariants(
          draft,
          ticketTypes
        );
        if (changed) {
          setBookingDraft(validatedDraft);
          saveBookingDraft(validatedDraft);
          if (message) {
            toast({
              title: 'Tickets updated',
              description: message,
            });
          }
        }
      } catch (err) {
        console.error('Failed to revalidate booking draft variants:', err);
      }
    };

    fetchEvent();
    fetchAddons();
    revalidateDraftVariants();
  }, [navigate, toast]);

  useEffect(() => {
    if (!event?.org_id) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await getVariantConfig(event.org_id);
        if (!cancelled) {
          setAddonVariantRankOrder([c.rank1, c.rank2].filter(Boolean));
          setAddonVariantValueOrders(c.value_orders || {});
        }
      } catch {
        if (!cancelled) {
          setAddonVariantRankOrder([]);
          setAddonVariantValueOrders({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event?.org_id]);

  // Initialize required addons with fixed_quantity when they have no variants
  useEffect(() => {
    if (eventAddons.length === 0 || !event) return;
    const requiredFixed = eventAddons.filter(
      (a) => a.is_required && (a.fixed_quantity ?? null) != null && a.variants.length <= 1
    );
    if (requiredFixed.length === 0) return;

    if (event.collect_attendee_info === 'per_ticket' && attendees.length > 0) {
      setAddonSelectionsByAttendee((prev) => {
        let changed = false;
        const next = { ...prev };
        attendees.forEach((_, idx) => {
          requiredFixed.forEach((addon) => {
            const current = next[idx]?.[addon.product_id];
            const fixedQty = addon.fixed_quantity ?? 1;
            if (!current || current.qty === 0) {
              next[idx] = { ...(next[idx] ?? {}), [addon.product_id]: { qty: fixedQty } };
              changed = true;
            }
          });
        });
        return changed ? next : prev;
      });
    } else if (event.collect_attendee_info !== 'per_ticket') {
      setAddonSelections((prev) => {
        let changed = false;
        const next = { ...prev };
        requiredFixed.forEach((addon) => {
          const current = next[addon.product_id];
          const fixedQty = addon.fixed_quantity ?? 1;
          if (!current || current.qty === 0) {
            next[addon.product_id] = { qty: fixedQty };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [eventAddons, event?.id, event?.collect_attendee_info, attendees.length]);

  // PDP-style: pre-select the first variant so price/gallery show; committed qty stays 0 until the user adds to order.
  useEffect(() => {
    if (eventAddons.length === 0 || !event) return;

    if (event.collect_attendee_info === 'per_ticket' && attendees.length > 0) {
      setAddonSelectionsByAttendee((prev) => {
        let changed = false;
        const next = { ...prev };
        attendees.forEach((_, idx) => {
          eventAddons.forEach((addon) => {
            if (addon.variants.length <= 1) return;
            const firstId = addon.variants[0]?.id;
            if (!firstId) return;
            const cur = next[idx]?.[addon.product_id];
            if (cur?.variantId) return;
            next[idx] = {
              ...(next[idx] ?? {}),
              [addon.product_id]: {
                ...cur,
                variantId: firstId,
                qty: cur?.qty ?? 0,
              },
            };
            changed = true;
          });
        });
        return changed ? next : prev;
      });
    } else if (event.collect_attendee_info !== 'per_ticket') {
      setAddonSelections((prev) => {
        let changed = false;
        const next = { ...prev };
        eventAddons.forEach((addon) => {
          if (addon.variants.length <= 1) return;
          const firstId = addon.variants[0]?.id;
          if (!firstId) return;
          const cur = next[addon.product_id];
          if (cur?.variantId) return;
          next[addon.product_id] = {
            ...cur,
            variantId: firstId,
            qty: cur?.qty ?? 0,
          };
          changed = true;
        });
        return changed ? next : prev;
      });
    }
  }, [eventAddons, event?.id, event?.collect_attendee_info, attendees.length]);

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate contact info
  const isContactValid = (): boolean => {
    return (
      contactInfo.firstName.trim() !== '' &&
      contactInfo.lastName.trim() !== '' &&
      contactInfo.phone.trim() !== '' &&
      isValidEmail(contactInfo.email)
    );
  };

  // Contact info validation (used for both FREE route and Per-Ticket mode)
  // In Per-Ticket mode, Contact info is used as Order Contact (buyer_email)

  // Validate attendees (for per-ticket collection)
  const areAttendeesValid = (): boolean => {
    if (!event || event.collect_attendee_info !== 'per_ticket') {
      return true; // Not required for primary-only mode
    }
    
    return attendees.every(
      (attendee) =>
        attendee.firstName.trim() !== '' &&
        attendee.lastName.trim() !== '' &&
        attendee.phone.trim() !== '' &&
        isValidEmail(attendee.email)
    );
  };

  // Validate required add-ons: must have selection (variant or qty > 0)
  // Primary mode: check addonSelections. Per-ticket: each attendee must have each required addon.
  const areRequiredAddonsValid = (): boolean => {
    const required = eventAddons.filter((a) => a.is_required);
    if (required.length === 0) return true;

    for (const addon of required) {
      if (
        addon.show_remaining_stock &&
        !addon.variants.some((v) => (v.stock_remaining ?? 0) > 0)
      ) {
        return false;
      }
    }

    if (event?.collect_attendee_info === 'per_ticket') {
      return attendees.every((_, idx) =>
        required.every((addon) => {
          const sel = addonSelectionsByAttendee[idx]?.[addon.product_id];
          if (!sel) return false;
          if (addon.variants.length > 1) return !!sel.variantId && sel.qty > 0;
          return sel.qty > 0;
        })
      );
    }
    return required.every((addon) => {
      const sel = addonSelections[addon.product_id];
      if (!sel) return false;
      if (addon.variants.length > 1) return !!sel.variantId && sel.qty > 0;
      return sel.qty > 0;
    });
  };

  const addonStockOrderError = useMemo(
    () =>
      computeAddonStockOrderError(
        eventAddons,
        event?.collect_attendee_info === 'per_ticket' ? 'per_ticket' : 'primary',
        addonSelections,
        addonSelectionsByAttendee
      ),
    [eventAddons, event?.collect_attendee_info, addonSelections, addonSelectionsByAttendee]
  );

  const marketingOptInEnabled = (event as { metadata?: Record<string, unknown> } | null)?.metadata?.marketing_opt_in_enabled === true;
  const marketingOptInLabel =
    ((event as { metadata?: Record<string, unknown> } | null)?.metadata?.marketing_opt_in_label as string | undefined)?.trim() ||
    DEFAULT_MARKETING_OPT_IN_LABEL;

  // Check if form is valid (contact/attendees + T&C + required add-ons)
  const isFormValid = (): boolean => {
    if (!tcAccepted) return false;
    if (addonStockOrderError) return false;
    if (!areRequiredAddonsValid()) return false;
    if (event?.collect_attendee_info === 'per_ticket') {
      return areAttendeesValid() && isContactValid();
    }
    return isContactValid();
  };


  // Handle contact info update
  const handleContactInfoUpdate = (info: ContactInfo) => {
    setContactInfo(info);
    saveContactInfo(info);
    
    // Sync to all attendees that use Contact info
    if (useContactAsAttendee.size > 0 && attendees.length > 0) {
      const updated = [...attendees];
      useContactAsAttendee.forEach((idx) => {
        if (idx < updated.length) {
          updated[idx] = {
            ...updated[idx],
            firstName: info.firstName,
            lastName: info.lastName,
            email: info.email,
            phone: info.phone,
          };
        }
      });
      setAttendees(updated);
      
      if (bookingDraft) {
        const updatedDraft = { ...bookingDraft, attendees: updated };
        setBookingDraft(updatedDraft);
        saveBookingDraft(updatedDraft);
      }
    }
  };

  // Handle attendee update (only called when attendee is not using Contact info - those fields are disabled)
  const handleAttendeeUpdate = (index: number, field: keyof AttendeeInfo, value: string) => {
    const updated = [...attendees];
    updated[index] = { ...updated[index], [field]: value };
    setAttendees(updated);
    
    if (bookingDraft) {
      const updatedDraft = { ...bookingDraft, attendees: updated };
      setBookingDraft(updatedDraft);
      saveBookingDraft(updatedDraft);
    }
  };

  // Handle toggle: Use Contact info as Attendee N
  const handleToggleUseContactAsAttendee = (index: number, checked: boolean) => {
    setUseContactAsAttendee((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
    if (checked && index < attendees.length) {
      const updated = [...attendees];
      updated[index] = {
        ...updated[index],
        firstName: contactInfo.firstName,
        lastName: contactInfo.lastName,
        email: contactInfo.email,
        phone: contactInfo.phone,
      };
      setAttendees(updated);
      if (bookingDraft) {
        const updatedDraft = { ...bookingDraft, attendees: updated };
        setBookingDraft(updatedDraft);
        saveBookingDraft(updatedDraft);
      }
      // Auto-collapse Attendee 1 when re-checking "Use contact info" to save vertical space
      if (index === 0) {
        setAttendee1Expanded(false);
      }
    }
  };

  // Calculate totals (tickets + add-ons)
  const ticketSubtotal = bookingDraft
    ? bookingDraft.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)
    : 0;
  const addonSubtotalFromSelections = (selections: Record<string, { variantId?: string; qty: number }>) =>
    Object.entries(selections).reduce((sum, [productId, sel]) => {
      if (sel.qty <= 0) return sum;
      const addon = eventAddons.find((a) => a.product_id === productId);
      if (!addon) return sum;
      let unitPrice = addon.base_price ?? 0;
      if (addon.variants.length > 1 && sel.variantId) {
        const v = addon.variants.find((x) => x.id === sel.variantId);
        if (v) unitPrice = v.price;
      }
      return sum + unitPrice * sel.qty;
    }, 0);
  const addonSubtotal =
    event?.collect_attendee_info === 'per_ticket'
      ? Object.values(addonSelectionsByAttendee).reduce((sum, s) => sum + addonSubtotalFromSelections(s), 0)
      : addonSubtotalFromSelections(addonSelections);
  const total = ticketSubtotal + addonSubtotal;
  const subtotal = ticketSubtotal; // Used in Price Summary Sheet

  // Format currency
  const formatCurrency = (amount: number): string => {
    const currency = bookingDraft?.currency || 'HKD';
    if (currency === 'HKD') {
      return `HK$ ${amount.toFixed(1)}`;
    }
    return `${currency} ${amount.toFixed(2)}`;
  };

  if (!bookingDraft) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading booking details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex-1" style={{ color: '#0F1F17' }}>Complete booking</h1>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              // Help button - could open help dialog
            }}
          >
            <span className="text-lg">?</span>
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Top Summary Block */}
        <div className="space-y-3 p-4 rounded-2xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <h2 className="text-xl font-bold" style={{ color: '#0F1F17' }}>
            {bookingDraft.eventTitle}
          </h2>
          {bookingDraft.dateLabel && (
            <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
              {bookingDraft.dateLabel}
            </p>
          )}
          <div className="space-y-1">
            {bookingDraft.lines
              .filter((line) => line.qty > 0)
              .map((line, idx) => (
                <div key={idx} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  {line.label}
                  {line.optionLabel && ` - ${line.optionLabel}`} × {line.qty}
                  {line.dateTimeLabel && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {line.dateTimeLabel}
                    </span>
                  )}
                </div>
              ))}
            {event?.collect_attendee_info === 'per_ticket'
              ? Object.entries(addonSelectionsByAttendee)
                  .flatMap(([idxStr, selections]) =>
                    Object.entries(selections)
                      .filter(([, sel]) => sel.qty > 0)
                      .map(([productId, sel]) => {
                        const addon = eventAddons.find((a) => a.product_id === productId);
                        if (!addon) return null;
                        const variant = addon.variants.find((v) => v.id === sel.variantId);
                        const label = addon.product_title;
                        const variantLabel = variant?.name;
                        const attendeeNum = parseInt(idxStr, 10) + 1;
                        return (
                          <div key={`${idxStr}-${productId}`} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                            Attendee {attendeeNum}: {label}
                            {variantLabel && ` - ${variantLabel}`} × {sel.qty}
                          </div>
                        );
                      })
                  )
                  .filter(Boolean)
              : Object.entries(addonSelections)
                  .filter(([, sel]) => sel.qty > 0)
                  .map(([productId, sel]) => {
                    const addon = eventAddons.find((a) => a.product_id === productId);
                    if (!addon) return null;
                    const variant = addon.variants.find((v) => v.id === sel.variantId);
                    const label = addon.product_title;
                    const variantLabel = variant?.name;
                    return (
                      <div key={productId} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                        {label}
                        {variantLabel && ` - ${variantLabel}`} × {sel.qty}
                      </div>
                    );
                  })}
          </div>
          <div className="pt-2">
            <p className="text-xl font-bold" style={{ color: '#0F1F17' }}>
              {formatCurrency(total)}
            </p>
          </div>
        </div>

        {/* Add-ons Section (primary mode only; per-ticket shows add-ons inside each attendee card) */}
        {eventAddons.length > 0 && event?.collect_attendee_info !== 'per_ticket' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 rounded" style={{ backgroundColor: '#0E7A3A' }} />
              <h3 className="text-base font-semibold" style={{ color: '#0F1F17' }}>
                Add-ons
              </h3>
            </div>
            <div className="space-y-3">
              {eventAddons.map((addon) => {
                const sel = addonSelections[addon.product_id] ?? { qty: 0 };
                const hasVariants = addon.variants.length > 1;
                const enforced = addonEnforcesStock(addon);
                const vid = resolvedVariantId(addon, sel);
                const allVariantsOos =
                  enforced && hasVariants && addon.variants.every((v) => (v.stock_remaining ?? 0) <= 0);
                const stock =
                  hasVariants && !sel.variantId
                    ? null
                    : stockRemainingForVariant(addon, sel.variantId ?? vid);
                const outOfStock =
                  allVariantsOos ||
                  (enforced &&
                    !hasVariants &&
                    (stockRemainingForVariant(addon, vid) ?? 0) <= 0) ||
                  (enforced && hasVariants && !!sel.variantId && (stock ?? 0) <= 0);
                const maxQ = maxQtyPrimary(addon, sel);
                const fixedQty = addon.fixed_quantity ?? 0;
                const maxQForFixed = enforced ? maxQtyPrimary(addon, { variantId: vid, qty: fixedQty }) : 9999;
                const canIncludeFixed = !enforced || fixedQty <= maxQForFixed;
                const addonPhotos = getAddonProductPhotos(addon);
                const photoIdx = addonPhotoIndexByProduct[addon.product_id] ?? 0;
                const priceVariantId = sel.variantId ?? vid;
                const { list: apList, effective: apEff, isDiscounted: apDisc } = getAddonDisplayPrices(
                  addon,
                  addon.variants.length === 0 ? undefined : priceVariantId
                );
                return (
                  <div
                    key={addon.product_id}
                    className="p-4 rounded-2xl border"
                    style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
                  >
                    <ProductMerchandiseLayout
                      title={addon.product_title}
                      titleEndSlot={
                        addon.is_required ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                            Required
                          </span>
                        ) : undefined
                      }
                      priceSlot={
                        <AddonPriceDisplay
                          list={apList}
                          effective={apEff}
                          isDiscounted={apDisc}
                          size="pdp"
                        />
                      }
                      photos={addonPhotos}
                      selectedImageIndex={Math.min(photoIdx, Math.max(0, addonPhotos.length - 1))}
                      onSelectImageIndex={(i) =>
                        setAddonPhotoIndexByProduct((p) => ({ ...p, [addon.product_id]: i }))
                      }
                      description={addon.product_description ?? ''}
                      productDetails={addon.product_details ?? ''}
                      sizeAndFit={addon.size_and_fit ?? ''}
                      defaultAllOpen={false}
                      accordionClassName="mt-3 border-t border-black/10 pt-2"
                      density="pdp"
                    >
                      {enforced && stock != null && stock > 0 && (
                        <p className="text-xs text-muted-foreground">{stock} remaining</p>
                      )}
                      {outOfStock && <p className="text-sm font-medium text-destructive">Out of stock</p>}
                      {hasVariants ? (
                        <div className="space-y-2">
                          <EventAddonVariantSelect
                            addon={addon}
                            selectedVariantId={sel.variantId}
                            variantRankOrder={addonVariantRankOrder}
                            variantValueOrders={addonVariantValueOrders}
                            disabled={allVariantsOos}
                            onVariantChange={(id) => {
                              if (id == null) {
                                setAddonSelections((prev) => {
                                  const prevEntry = prev[addon.product_id] ?? { qty: 0 };
                                  const { variantId: _omit, ...rest } = prevEntry;
                                  return {
                                    ...prev,
                                    [addon.product_id]: {
                                      ...rest,
                                      qty: rest.qty ?? 0,
                                    },
                                  };
                                });
                                return;
                              }
                              setAddonSelections((prev) => {
                                const committed = prev[addon.product_id]?.qty ?? 0;
                                if (addon.fixed_quantity != null) {
                                  const cap = maxQtyPrimary(addon, { variantId: id, qty: addon.fixed_quantity });
                                  return {
                                    ...prev,
                                    [addon.product_id]: {
                                      variantId: id,
                                      qty: Math.min(addon.fixed_quantity, cap),
                                    },
                                  };
                                }
                                const cap = maxQtyPrimary(addon, { variantId: id, qty: committed });
                                return {
                                  ...prev,
                                  [addon.product_id]: {
                                    variantId: id,
                                    qty: Math.min(committed, cap),
                                  },
                                };
                              });
                              setAddonDraftQty((prev) => ({
                                ...prev,
                                [addon.product_id]:
                                  addon.fixed_quantity != null
                                    ? addon.fixed_quantity
                                    : Math.max(1, prev[addon.product_id] ?? 1),
                              }));
                            }}
                          />
                          {sel.variantId && addon.fixed_quantity != null && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Label className="text-sm">Quantity</Label>
                              <span className="text-sm font-medium">{addon.fixed_quantity}</span>
                            </div>
                          )}
                          {sel.variantId && addon.fixed_quantity == null && (
                            <AddonQuantityAndCta
                              density="pdp"
                              productTitle={addon.product_title}
                              variantLabel={
                                (sel.variantId
                                  ? addon.variants.find((x) => x.id === sel.variantId)
                                  : undefined
                                )?.name
                              }
                              draftQty={addonDraftQty[addon.product_id] ?? 1}
                              onDraftChange={(n) =>
                                setAddonDraftQty((prev) => ({ ...prev, [addon.product_id]: n }))
                              }
                              committedQty={sel.qty}
                              onCommit={() => {
                                const variantId = sel.variantId ?? resolvedVariantId(addon, sel);
                                if (!variantId) return;
                                const cap = maxQtyPrimary(addon, { variantId, qty: 1 });
                                const d = addonDraftQty[addon.product_id] ?? 1;
                                const qty = Math.max(1, Math.min(d, cap));
                                const vRow = addon.variants.find((x) => x.id === variantId);
                                setAddonSelections((prev) => ({
                                  ...prev,
                                  [addon.product_id]: { variantId, qty },
                                }));
                                setAddonDraftQty((prev) => ({ ...prev, [addon.product_id]: qty }));
                                const wasUpdate = sel.qty > 0;
                                toast({
                                  title: wasUpdate ? 'Order updated' : 'Added to order',
                                  description: `${addon.product_title}${
                                    vRow?.name ? ` (${vRow.name})` : ''
                                  } × ${qty}`,
                                });
                              }}
                              onRemove={() => {
                                setAddonSelections((prev) => {
                                  const cur = prev[addon.product_id];
                                  return {
                                    ...prev,
                                    [addon.product_id]: {
                                      variantId: cur?.variantId ?? sel.variantId,
                                      qty: 0,
                                    },
                                  };
                                });
                              }}
                              outOfStock={outOfStock}
                              maxQ={maxQ}
                              enforced={enforced}
                              canCommit={
                                !outOfStock &&
                                (enforced ? maxQ > 0 : true) &&
                                Boolean(sel.variantId ?? resolvedVariantId(addon, sel))
                              }
                              inputClassName="w-20 rounded-2xl"
                            />
                          )}
                        </div>
                      ) : addon.fixed_quantity != null ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Label className="text-sm">Quantity</Label>
                          <span className="text-sm font-medium">{addon.fixed_quantity}</span>
                          {!addon.is_required && (
                            <label className="flex items-center gap-2 text-sm cursor-pointer ml-2">
                              <Checkbox
                                checked={sel.qty > 0}
                                disabled={!canIncludeFixed && sel.qty === 0}
                                onCheckedChange={(c) =>
                                  setAddonSelections((prev) => ({
                                    ...prev,
                                    [addon.product_id]: {
                                      qty: c === true && canIncludeFixed ? addon.fixed_quantity! : 0,
                                    },
                                  }))
                                }
                              />
                              Include
                            </label>
                          )}
                        </div>
                      ) : (
                        <AddonQuantityAndCta
                          density="pdp"
                          productTitle={addon.product_title}
                          draftQty={addonDraftQty[addon.product_id] ?? 1}
                          onDraftChange={(n) =>
                            setAddonDraftQty((prev) => ({ ...prev, [addon.product_id]: n }))
                          }
                          committedQty={sel.qty}
                          onCommit={() => {
                            const singleVid =
                              addon.variants.length === 1 ? addon.variants[0].id : undefined;
                            const cap = maxQtyPrimary(addon, { variantId: singleVid, qty: 1 });
                            const d = addonDraftQty[addon.product_id] ?? 1;
                            const qty = Math.max(1, Math.min(d, cap));
                            setAddonSelections((prev) => ({
                              ...prev,
                              [addon.product_id]:
                                singleVid != null
                                  ? { variantId: singleVid, qty }
                                  : { qty },
                            }));
                            setAddonDraftQty((prev) => ({ ...prev, [addon.product_id]: qty }));
                            const wasUpdate = sel.qty > 0;
                            toast({
                              title: wasUpdate ? 'Order updated' : 'Added to order',
                              description: `${addon.product_title} × ${qty}`,
                            });
                          }}
                          onRemove={() => {
                            const singleVid =
                              addon.variants.length === 1 ? addon.variants[0].id : undefined;
                            setAddonSelections((prev) => ({
                              ...prev,
                              [addon.product_id]:
                                singleVid != null ? { variantId: singleVid, qty: 0 } : { qty: 0 },
                            }));
                          }}
                          outOfStock={outOfStock}
                          maxQ={maxQ}
                          enforced={enforced}
                          canCommit={!outOfStock && (enforced ? maxQ > 0 : true)}
                          inputClassName="w-20 rounded-2xl"
                        />
                      )}
                    </ProductMerchandiseLayout>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Contact Info / Attendee Info Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: '#0E7A3A' }} />
            <h3 className="text-base font-semibold" style={{ color: '#0F1F17' }}>
              {event?.collect_attendee_info === 'per_ticket' ? 'Attendee information' : 'Contact info'}
            </h3>
          </div>
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            {event?.collect_attendee_info === 'per_ticket'
              ? 'Please provide information for each attendee'
              : "We'll contact you only if there's any updates to your booking"}
          </p>

          {event?.collect_attendee_info === 'per_ticket' ? (
            /* Per-Ticket Mode: Contact Info (expanded) + Attendee Forms with per-card checkboxes */
            <div className="space-y-4">
              {/* Contact Info Section - always expanded */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-6 rounded" style={{ backgroundColor: '#0E7A3A' }} />
                  <h3 className="text-base font-semibold" style={{ color: '#0F1F17' }}>
                    Contact info
                  </h3>
                </div>
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  This is the contact person for payment receipts and order updates
                </p>
                <ContactInfoCard
                  contactInfo={contactInfo}
                  onUpdate={handleContactInfoUpdate}
                  title="Contact info"
                  description="This is the contact person for payment receipts and order updates"
                  showPhone={true}
                  requiredFields={{
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                  }}
                  alwaysExpanded={true}
                />
              </div>

              {/* Attendee Information - each card has "Use Contact info as Attendee N" checkbox */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-6 rounded" style={{ backgroundColor: '#0E7A3A' }} />
                  <h3 className="text-base font-semibold" style={{ color: '#0F1F17' }}>
                    Attendee Information
                  </h3>
                </div>
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  Please provide information for each attendee
                </p>
              </div>
              {attendees.map((attendee, index) => {
                const lineIndex = bookingDraft?.lines.findIndex(
                  (line) => line.ticketTypeId === attendee.ticketTypeId
                );
                const ticketLabel = bookingDraft?.lines[lineIndex || 0]?.label || 'Ticket';
                const usesContact = useContactAsAttendee.has(index);
                const displayInfo = usesContact ? contactInfo : attendee;
                const isAttendee1 = index === 0;

                // Attendee 1: Collapsible with preset "Use contact info", compact when collapsed
                if (isAttendee1) {
                  return (
                    <Collapsible
                      key={index}
                      open={attendee1Expanded}
                      onOpenChange={setAttendee1Expanded}
                    >
                      <Card
                        className="border rounded-2xl"
                        style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold" style={{ color: '#0F1F17' }}>
                              Attendee 1
                            </CardTitle>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{ticketLabel}</p>
                          <div className="flex items-center space-x-2 pt-2">
                            <Checkbox
                              id={`use-contact-as-attendee-${index}`}
                              checked={usesContact}
                              onCheckedChange={(checked) =>
                                handleToggleUseContactAsAttendee(index, checked === true)
                              }
                            />
                            <label
                              htmlFor={`use-contact-as-attendee-${index}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              style={{ color: '#0F1F17' }}
                            >
                              Use Contact info as Attendee 1
                            </label>
                          </div>
                          {!attendee1Expanded && (
                            <button
                              type="button"
                              onClick={() => {
                                setAttendee1Expanded(true);
                                handleToggleUseContactAsAttendee(0, false);
                              }}
                              className="text-sm font-medium mt-2 text-left hover:underline"
                              style={{ color: '#0E7A3A' }}
                            >
                              Fill in different info
                            </button>
                          )}
                          {eventAddons.length > 0 && (
                            <div className="space-y-3 pt-3 mt-3 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                              <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                                Add-ons for Attendee 1
                              </p>
                              {eventAddons.map((addon) => {
                                const sel = (addonSelectionsByAttendee[index] ?? {})[addon.product_id] ?? { qty: 0 };
                                const hasVariants = addon.variants.length > 1;
                                const enforced = addonEnforcesStock(addon);
                                const vid = resolvedVariantId(addon, sel);
                                const allVariantsOos =
                                  enforced && hasVariants && addon.variants.every((v) => (v.stock_remaining ?? 0) <= 0);
                                const stock =
                                  hasVariants && !sel.variantId
                                    ? null
                                    : stockRemainingForVariant(addon, sel.variantId ?? vid);
                                const outOfStock =
                                  allVariantsOos ||
                                  (enforced &&
                                    !hasVariants &&
                                    (stockRemainingForVariant(addon, vid) ?? 0) <= 0) ||
                                  (enforced && hasVariants && !!sel.variantId && (stock ?? 0) <= 0);
                                const maxQ = maxQtyPerTicketAttendee(addon, sel, index, addonSelectionsByAttendee);
                                const fixedQty = addon.fixed_quantity ?? 0;
                                const maxQForFixed = enforced
                                  ? maxQtyPerTicketAttendee(
                                      addon,
                                      { variantId: vid, qty: fixedQty },
                                      index,
                                      addonSelectionsByAttendee
                                    )
                                  : 9999;
                                const canIncludeFixed = !enforced || fixedQty <= maxQForFixed;
                                const ptPhotoKey = `${index}-${addon.product_id}`;
                                const addonPhotos = getAddonProductPhotos(addon);
                                const photoIdx = perTicketAddonPhotoIndex[ptPhotoKey] ?? 0;
                                const priceVariantId = sel.variantId ?? vid;
                                const {
                                  list: apList,
                                  effective: apEff,
                                  isDiscounted: apDisc,
                                } = getAddonDisplayPrices(
                                  addon,
                                  addon.variants.length === 0 ? undefined : priceVariantId
                                );
                                return (
                                  <div
                                    key={addon.product_id}
                                    className="p-3 rounded-xl border text-sm"
                                    style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                                  >
                                    <ProductMerchandiseLayout
                                      title={addon.product_title}
                                      titleEndSlot={
                                        addon.is_required ? (
                                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                                            Required
                                          </span>
                                        ) : undefined
                                      }
                                      priceSlot={
                                        <AddonPriceDisplay
                                          list={apList}
                                          effective={apEff}
                                          isDiscounted={apDisc}
                                          size="compact"
                                        />
                                      }
                                      photos={addonPhotos}
                                      selectedImageIndex={Math.min(photoIdx, Math.max(0, addonPhotos.length - 1))}
                                      onSelectImageIndex={(i) =>
                                        setPerTicketAddonPhotoIndex((p) => ({ ...p, [ptPhotoKey]: i }))
                                      }
                                      description={addon.product_description ?? ''}
                                      productDetails={addon.product_details ?? ''}
                                      sizeAndFit={addon.size_and_fit ?? ''}
                                      defaultAllOpen={false}
                                      accordionClassName="mt-3 border-t border-black/10 pt-2"
                                      density="compact"
                                    >
                                      {enforced &&
                                        (sel.variantId || !hasVariants) &&
                                        maxQ >= 0 &&
                                        !outOfStock && (
                                        <p className="text-xs text-muted-foreground">
                                          Up to {maxQ} available here (shared inventory)
                                        </p>
                                      )}
                                      {outOfStock && <p className="text-xs font-medium text-destructive">Out of stock</p>}
                                      {hasVariants ? (
                                        <div className="space-y-2">
                                          <EventAddonVariantSelect
                                            addon={addon}
                                            selectedVariantId={sel.variantId}
                                            variantRankOrder={addonVariantRankOrder}
                                            variantValueOrders={addonVariantValueOrders}
                                            disabled={allVariantsOos}
                                            compact
                                            onVariantChange={(id) => {
                                              if (id == null) {
                                                setAddonSelectionsByAttendee((prev) => {
                                                  const prevEntry = prev[index]?.[addon.product_id] ?? { qty: 0 };
                                                  const { variantId: _omit, ...rest } = prevEntry;
                                                  return {
                                                    ...prev,
                                                    [index]: {
                                                      ...(prev[index] ?? {}),
                                                      [addon.product_id]: {
                                                        ...rest,
                                                        qty: rest.qty ?? 0,
                                                      },
                                                    },
                                                  };
                                                });
                                                return;
                                              }
                                              setAddonSelectionsByAttendee((prev) => {
                                                const committed = prev[index]?.[addon.product_id]?.qty ?? 0;
                                                if (addon.fixed_quantity != null) {
                                                  const cap = maxQtyPerTicketAttendee(
                                                    addon,
                                                    { variantId: id, qty: addon.fixed_quantity },
                                                    index,
                                                    prev
                                                  );
                                                  return {
                                                    ...prev,
                                                    [index]: {
                                                      ...(prev[index] ?? {}),
                                                      [addon.product_id]: {
                                                        variantId: id,
                                                        qty: Math.min(addon.fixed_quantity, cap),
                                                      },
                                                    },
                                                  };
                                                }
                                                const cap = maxQtyPerTicketAttendee(
                                                  addon,
                                                  { variantId: id, qty: committed },
                                                  index,
                                                  prev
                                                );
                                                return {
                                                  ...prev,
                                                  [index]: {
                                                    ...(prev[index] ?? {}),
                                                    [addon.product_id]: {
                                                      variantId: id,
                                                      qty: Math.min(committed, cap),
                                                    },
                                                  },
                                                };
                                              });
                                              setAddonDraftQtyByAttendee((prev) => ({
                                                ...prev,
                                                [index]: {
                                                  ...(prev[index] ?? {}),
                                                  [addon.product_id]:
                                                    addon.fixed_quantity != null
                                                      ? addon.fixed_quantity
                                                      : Math.max(1, prev[index]?.[addon.product_id] ?? 1),
                                                },
                                              }));
                                            }}
                                          />
                                          {sel.variantId && addon.fixed_quantity != null && (
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <Label className="text-xs">Qty</Label>
                                              <span className="text-sm font-medium">{addon.fixed_quantity}</span>
                                            </div>
                                          )}
                                          {sel.variantId && addon.fixed_quantity == null && (
                                            <AddonQuantityAndCta
                                              density="compact"
                                              productTitle={addon.product_title}
                                              variantLabel={
                                                (sel.variantId
                                                  ? addon.variants.find((x) => x.id === sel.variantId)
                                                  : undefined
                                                )?.name
                                              }
                                              draftQty={addonDraftQtyByAttendee[index]?.[addon.product_id] ?? 1}
                                              onDraftChange={(n) =>
                                                setAddonDraftQtyByAttendee((prev) => ({
                                                  ...prev,
                                                  [index]: { ...(prev[index] ?? {}), [addon.product_id]: n },
                                                }))
                                              }
                                              committedQty={sel.qty}
                                              onCommit={() => {
                                                const variantId = sel.variantId ?? resolvedVariantId(addon, sel);
                                                if (variantId == null) return;
                                                const cap = maxQtyPerTicketAttendee(
                                                  addon,
                                                  { variantId, qty: 1 },
                                                  index,
                                                  addonSelectionsByAttendee
                                                );
                                                const d = addonDraftQtyByAttendee[index]?.[addon.product_id] ?? 1;
                                                const qty = Math.max(1, Math.min(d, cap));
                                                const vRow = addon.variants.find((x) => x.id === variantId);
                                                setAddonSelectionsByAttendee((prev) => ({
                                                  ...prev,
                                                  [index]: {
                                                    ...(prev[index] ?? {}),
                                                    [addon.product_id]: { variantId, qty },
                                                  },
                                                }));
                                                setAddonDraftQtyByAttendee((prev) => ({
                                                  ...prev,
                                                  [index]: { ...(prev[index] ?? {}), [addon.product_id]: qty },
                                                }));
                                                const wasUpdate = sel.qty > 0;
                                                toast({
                                                  title: wasUpdate ? 'Order updated' : 'Added to order',
                                                  description: `Attendee ${index + 1}: ${addon.product_title}${
                                                    vRow?.name ? ` (${vRow.name})` : ''
                                                  } × ${qty}`,
                                                });
                                              }}
                                              onRemove={() => {
                                                setAddonSelectionsByAttendee((prev) => {
                                                  const cur = prev[index]?.[addon.product_id];
                                                  return {
                                                    ...prev,
                                                    [index]: {
                                                      ...(prev[index] ?? {}),
                                                      [addon.product_id]: {
                                                        variantId: cur?.variantId ?? sel.variantId,
                                                        qty: 0,
                                                      },
                                                    },
                                                  };
                                                });
                                              }}
                                              outOfStock={outOfStock}
                                              maxQ={maxQ}
                                              enforced={enforced}
                                              canCommit={
                                                !outOfStock &&
                                                (enforced ? maxQ > 0 : true) &&
                                                Boolean(sel.variantId ?? resolvedVariantId(addon, sel))
                                              }
                                              quantityLabel="Qty"
                                              inputClassName="w-16 h-9 rounded-xl"
                                            />
                                          )}
                                        </div>
                                      ) : addon.fixed_quantity != null ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Label className="text-xs">Qty</Label>
                                          <span className="text-sm font-medium">{addon.fixed_quantity}</span>
                                          {!addon.is_required && (
                                            <label className="flex items-center gap-2 text-xs cursor-pointer ml-2">
                                              <Checkbox
                                                checked={sel.qty > 0}
                                                disabled={!canIncludeFixed && sel.qty === 0}
                                                onCheckedChange={(c) =>
                                                  setAddonSelectionsByAttendee((prev) => ({
                                                    ...prev,
                                                    [index]: {
                                                      ...(prev[index] ?? {}),
                                                      [addon.product_id]: {
                                                        qty: c === true && canIncludeFixed ? addon.fixed_quantity! : 0,
                                                      },
                                                    },
                                                  }))
                                                }
                                              />
                                              Include
                                            </label>
                                          )}
                                        </div>
                                      ) : (
                                        <AddonQuantityAndCta
                                          density="compact"
                                          productTitle={addon.product_title}
                                          draftQty={addonDraftQtyByAttendee[index]?.[addon.product_id] ?? 1}
                                          onDraftChange={(n) =>
                                            setAddonDraftQtyByAttendee((prev) => ({
                                              ...prev,
                                              [index]: { ...(prev[index] ?? {}), [addon.product_id]: n },
                                            }))
                                          }
                                          committedQty={sel.qty}
                                          onCommit={() => {
                                            const singleVid =
                                              addon.variants.length === 1 ? addon.variants[0].id : undefined;
                                            const cap = maxQtyPerTicketAttendee(
                                              addon,
                                              { variantId: singleVid, qty: 1 },
                                              index,
                                              addonSelectionsByAttendee
                                            );
                                            const d = addonDraftQtyByAttendee[index]?.[addon.product_id] ?? 1;
                                            const qty = Math.max(1, Math.min(d, cap));
                                            setAddonSelectionsByAttendee((prev) => ({
                                              ...prev,
                                              [index]: {
                                                ...(prev[index] ?? {}),
                                                [addon.product_id]:
                                                  singleVid != null ? { variantId: singleVid, qty } : { qty },
                                              },
                                            }));
                                            setAddonDraftQtyByAttendee((prev) => ({
                                              ...prev,
                                              [index]: { ...(prev[index] ?? {}), [addon.product_id]: qty },
                                            }));
                                            const wasUpdate = sel.qty > 0;
                                            toast({
                                              title: wasUpdate ? 'Order updated' : 'Added to order',
                                              description: `Attendee ${index + 1}: ${addon.product_title} × ${qty}`,
                                            });
                                          }}
                                          onRemove={() => {
                                            const singleVid =
                                              addon.variants.length === 1 ? addon.variants[0].id : undefined;
                                            setAddonSelectionsByAttendee((prev) => ({
                                              ...prev,
                                              [index]: {
                                                ...(prev[index] ?? {}),
                                                [addon.product_id]:
                                                  singleVid != null
                                                    ? { variantId: singleVid, qty: 0 }
                                                    : { qty: 0 },
                                              },
                                            }));
                                          }}
                                          outOfStock={outOfStock}
                                          maxQ={maxQ}
                                          enforced={enforced}
                                          canCommit={!outOfStock && (enforced ? maxQ > 0 : true)}
                                          quantityLabel="Qty"
                                          inputClassName="w-16 h-9 rounded-xl"
                                        />
                                      )}
                                    </ProductMerchandiseLayout>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </CardHeader>
                        <CollapsibleContent>
                          <CardContent className="space-y-4 pt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor={`attendee-firstName-${index}`} className="text-sm">
                                  First name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id={`attendee-firstName-${index}`}
                                  type="text"
                                  value={displayInfo.firstName}
                                  onChange={(e) => handleAttendeeUpdate(index, 'firstName', e.target.value)}
                                  className="mt-1"
                                  placeholder="Enter first name"
                                  disabled={usesContact}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`attendee-lastName-${index}`} className="text-sm">
                                  Last name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id={`attendee-lastName-${index}`}
                                  type="text"
                                  value={displayInfo.lastName}
                                  onChange={(e) => handleAttendeeUpdate(index, 'lastName', e.target.value)}
                                  className="mt-1"
                                  placeholder="Enter last name"
                                  disabled={usesContact}
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor={`attendee-email-${index}`} className="text-sm">
                                Email address <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                id={`attendee-email-${index}`}
                                type="email"
                                value={displayInfo.email}
                                onChange={(e) => handleAttendeeUpdate(index, 'email', e.target.value)}
                                className="mt-1"
                                placeholder="Enter email address"
                                disabled={usesContact}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`attendee-phone-${index}`} className="text-sm">
                                Phone number <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                id={`attendee-phone-${index}`}
                                type="tel"
                                value={displayInfo.phone}
                                onChange={(e) => handleAttendeeUpdate(index, 'phone', e.target.value)}
                                className="mt-1"
                                placeholder="Enter phone number"
                                disabled={usesContact}
                              />
                            </div>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                }

                // Attendees 2, 3, 4: Always expanded, no preset
                return (
                  <Card
                    key={index}
                    className="border rounded-2xl"
                    style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold" style={{ color: '#0F1F17' }}>
                          Attendee {index + 1}
                        </CardTitle>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{ticketLabel}</p>
                      <div className="flex items-center space-x-2 pt-2">
                        <Checkbox
                          id={`use-contact-as-attendee-${index}`}
                          checked={usesContact}
                          onCheckedChange={(checked) =>
                            handleToggleUseContactAsAttendee(index, checked === true)
                          }
                        />
                        <label
                          htmlFor={`use-contact-as-attendee-${index}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          style={{ color: '#0F1F17' }}
                        >
                          Use Contact info as Attendee {index + 1}
                        </label>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`attendee-firstName-${index}`} className="text-sm">
                            First name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`attendee-firstName-${index}`}
                            type="text"
                            value={displayInfo.firstName}
                            onChange={(e) => handleAttendeeUpdate(index, 'firstName', e.target.value)}
                            className="mt-1"
                            placeholder="Enter first name"
                            disabled={usesContact}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`attendee-lastName-${index}`} className="text-sm">
                            Last name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`attendee-lastName-${index}`}
                            type="text"
                            value={displayInfo.lastName}
                            onChange={(e) => handleAttendeeUpdate(index, 'lastName', e.target.value)}
                            className="mt-1"
                            placeholder="Enter last name"
                            disabled={usesContact}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`attendee-email-${index}`} className="text-sm">
                          Email address <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id={`attendee-email-${index}`}
                          type="email"
                          value={displayInfo.email}
                          onChange={(e) => handleAttendeeUpdate(index, 'email', e.target.value)}
                          className="mt-1"
                          placeholder="Enter email address"
                          disabled={usesContact}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`attendee-phone-${index}`} className="text-sm">
                          Phone number <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id={`attendee-phone-${index}`}
                          type="tel"
                          value={displayInfo.phone}
                          onChange={(e) => handleAttendeeUpdate(index, 'phone', e.target.value)}
                          className="mt-1"
                          placeholder="Enter phone number"
                          disabled={usesContact}
                        />
                      </div>
                      {eventAddons.length > 0 && (
                        <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                          <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                            Add-ons for Attendee {index + 1}
                          </p>
                          {eventAddons.map((addon) => {
                            const sel = (addonSelectionsByAttendee[index] ?? {})[addon.product_id] ?? { qty: 0 };
                            const hasVariants = addon.variants.length > 1;
                            const enforced = addonEnforcesStock(addon);
                            const vid = resolvedVariantId(addon, sel);
                            const allVariantsOos =
                              enforced && hasVariants && addon.variants.every((v) => (v.stock_remaining ?? 0) <= 0);
                            const stock =
                              hasVariants && !sel.variantId
                                ? null
                                : stockRemainingForVariant(addon, sel.variantId ?? vid);
                            const outOfStock =
                              allVariantsOos ||
                              (enforced &&
                                !hasVariants &&
                                (stockRemainingForVariant(addon, vid) ?? 0) <= 0) ||
                              (enforced && hasVariants && !!sel.variantId && (stock ?? 0) <= 0);
                            const maxQ = maxQtyPerTicketAttendee(addon, sel, index, addonSelectionsByAttendee);
                            const fixedQty = addon.fixed_quantity ?? 0;
                            const maxQForFixed = enforced
                              ? maxQtyPerTicketAttendee(
                                  addon,
                                  { variantId: vid, qty: fixedQty },
                                  index,
                                  addonSelectionsByAttendee
                                )
                              : 9999;
                            const canIncludeFixed = !enforced || fixedQty <= maxQForFixed;
                            const ptPhotoKeyB = `${index}-${addon.product_id}`;
                            const addonPhotosB = getAddonProductPhotos(addon);
                            const photoIdxB = perTicketAddonPhotoIndex[ptPhotoKeyB] ?? 0;
                            const priceVariantIdB = sel.variantId ?? vid;
                            const {
                              list: apListB,
                              effective: apEffB,
                              isDiscounted: apDiscB,
                            } = getAddonDisplayPrices(
                              addon,
                              addon.variants.length === 0 ? undefined : priceVariantIdB
                            );
                            return (
                              <div
                                key={addon.product_id}
                                className="p-3 rounded-xl border text-sm"
                                style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                              >
                                <ProductMerchandiseLayout
                                  title={addon.product_title}
                                  titleEndSlot={
                                    addon.is_required ? (
                                      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                                        Required
                                      </span>
                                    ) : undefined
                                  }
                                  priceSlot={
                                    <AddonPriceDisplay
                                      list={apListB}
                                      effective={apEffB}
                                      isDiscounted={apDiscB}
                                      size="compact"
                                    />
                                  }
                                  photos={addonPhotosB}
                                  selectedImageIndex={Math.min(photoIdxB, Math.max(0, addonPhotosB.length - 1))}
                                  onSelectImageIndex={(i) =>
                                    setPerTicketAddonPhotoIndex((p) => ({ ...p, [ptPhotoKeyB]: i }))
                                  }
                                  description={addon.product_description ?? ''}
                                  productDetails={addon.product_details ?? ''}
                                  sizeAndFit={addon.size_and_fit ?? ''}
                                  defaultAllOpen={false}
                                  accordionClassName="mt-3 border-t border-black/10 pt-2"
                                  density="compact"
                                >
                                  {enforced &&
                                    (sel.variantId || !hasVariants) &&
                                    maxQ >= 0 &&
                                    !outOfStock && (
                                    <p className="text-xs text-muted-foreground">
                                      Up to {maxQ} available here (shared inventory)
                                    </p>
                                  )}
                                  {outOfStock && <p className="text-xs font-medium text-destructive">Out of stock</p>}
                                  {hasVariants ? (
                                    <div className="space-y-2">
                                      <EventAddonVariantSelect
                                        addon={addon}
                                        selectedVariantId={sel.variantId}
                                        variantRankOrder={addonVariantRankOrder}
                                        variantValueOrders={addonVariantValueOrders}
                                        disabled={allVariantsOos}
                                        compact
                                        onVariantChange={(id) => {
                                          if (id == null) {
                                            setAddonSelectionsByAttendee((prev) => {
                                              const prevEntry = prev[index]?.[addon.product_id] ?? { qty: 0 };
                                              const { variantId: _omit, ...rest } = prevEntry;
                                              return {
                                                ...prev,
                                                [index]: {
                                                  ...(prev[index] ?? {}),
                                                  [addon.product_id]: {
                                                    ...rest,
                                                    qty: rest.qty ?? 0,
                                                  },
                                                },
                                              };
                                            });
                                            return;
                                          }
                                          setAddonSelectionsByAttendee((prev) => {
                                            const committed = prev[index]?.[addon.product_id]?.qty ?? 0;
                                            if (addon.fixed_quantity != null) {
                                              const cap = maxQtyPerTicketAttendee(
                                                addon,
                                                { variantId: id, qty: addon.fixed_quantity },
                                                index,
                                                prev
                                              );
                                              return {
                                                ...prev,
                                                [index]: {
                                                  ...(prev[index] ?? {}),
                                                  [addon.product_id]: {
                                                    variantId: id,
                                                    qty: Math.min(addon.fixed_quantity, cap),
                                                  },
                                                },
                                              };
                                            }
                                            const cap = maxQtyPerTicketAttendee(
                                              addon,
                                              { variantId: id, qty: committed },
                                              index,
                                              prev
                                            );
                                            return {
                                              ...prev,
                                              [index]: {
                                                ...(prev[index] ?? {}),
                                                [addon.product_id]: {
                                                  variantId: id,
                                                  qty: Math.min(committed, cap),
                                                },
                                              },
                                            };
                                          });
                                          setAddonDraftQtyByAttendee((prev) => ({
                                            ...prev,
                                            [index]: {
                                              ...(prev[index] ?? {}),
                                              [addon.product_id]:
                                                addon.fixed_quantity != null
                                                  ? addon.fixed_quantity
                                                  : Math.max(1, prev[index]?.[addon.product_id] ?? 1),
                                            },
                                          }));
                                        }}
                                      />
                                      {sel.variantId && addon.fixed_quantity != null && (
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Label className="text-xs">Qty</Label>
                                          <span className="text-sm font-medium">{addon.fixed_quantity}</span>
                                        </div>
                                      )}
                                      {sel.variantId && addon.fixed_quantity == null && (
                                        <AddonQuantityAndCta
                                          density="compact"
                                          productTitle={addon.product_title}
                                          variantLabel={
                                            (sel.variantId
                                              ? addon.variants.find((x) => x.id === sel.variantId)
                                              : undefined
                                            )?.name
                                          }
                                          draftQty={addonDraftQtyByAttendee[index]?.[addon.product_id] ?? 1}
                                          onDraftChange={(n) =>
                                            setAddonDraftQtyByAttendee((prev) => ({
                                              ...prev,
                                              [index]: { ...(prev[index] ?? {}), [addon.product_id]: n },
                                            }))
                                          }
                                          committedQty={sel.qty}
                                          onCommit={() => {
                                            const variantId = sel.variantId ?? resolvedVariantId(addon, sel);
                                            if (variantId == null) return;
                                            const cap = maxQtyPerTicketAttendee(
                                              addon,
                                              { variantId, qty: 1 },
                                              index,
                                              addonSelectionsByAttendee
                                            );
                                            const d = addonDraftQtyByAttendee[index]?.[addon.product_id] ?? 1;
                                            const qty = Math.max(1, Math.min(d, cap));
                                            const vRow = addon.variants.find((x) => x.id === variantId);
                                            setAddonSelectionsByAttendee((prev) => ({
                                              ...prev,
                                              [index]: {
                                                ...(prev[index] ?? {}),
                                                [addon.product_id]: { variantId, qty },
                                              },
                                            }));
                                            setAddonDraftQtyByAttendee((prev) => ({
                                              ...prev,
                                              [index]: { ...(prev[index] ?? {}), [addon.product_id]: qty },
                                            }));
                                            const wasUpdate = sel.qty > 0;
                                            toast({
                                              title: wasUpdate ? 'Order updated' : 'Added to order',
                                              description: `Attendee ${index + 1}: ${addon.product_title}${
                                                vRow?.name ? ` (${vRow.name})` : ''
                                              } × ${qty}`,
                                            });
                                          }}
                                          onRemove={() => {
                                            setAddonSelectionsByAttendee((prev) => {
                                              const cur = prev[index]?.[addon.product_id];
                                              return {
                                                ...prev,
                                                [index]: {
                                                  ...(prev[index] ?? {}),
                                                  [addon.product_id]: {
                                                    variantId: cur?.variantId ?? sel.variantId,
                                                    qty: 0,
                                                  },
                                                },
                                              };
                                            });
                                          }}
                                          outOfStock={outOfStock}
                                          maxQ={maxQ}
                                          enforced={enforced}
                                          canCommit={
                                            !outOfStock &&
                                            (enforced ? maxQ > 0 : true) &&
                                            Boolean(sel.variantId ?? resolvedVariantId(addon, sel))
                                          }
                                          quantityLabel="Qty"
                                          inputClassName="w-16 h-9 rounded-xl"
                                        />
                                      )}
                                    </div>
                                  ) : addon.fixed_quantity != null ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Label className="text-xs">Qty</Label>
                                      <span className="text-sm font-medium">{addon.fixed_quantity}</span>
                                      {!addon.is_required && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer ml-2">
                                          <Checkbox
                                            checked={sel.qty > 0}
                                            disabled={!canIncludeFixed && sel.qty === 0}
                                            onCheckedChange={(c) =>
                                              setAddonSelectionsByAttendee((prev) => ({
                                                ...prev,
                                                [index]: {
                                                  ...(prev[index] ?? {}),
                                                  [addon.product_id]: {
                                                    qty: c === true && canIncludeFixed ? addon.fixed_quantity! : 0,
                                                  },
                                                },
                                              }))
                                            }
                                          />
                                          Include
                                        </label>
                                      )}
                                    </div>
                                  ) : (
                                    <AddonQuantityAndCta
                                      density="compact"
                                      productTitle={addon.product_title}
                                      draftQty={addonDraftQtyByAttendee[index]?.[addon.product_id] ?? 1}
                                      onDraftChange={(n) =>
                                        setAddonDraftQtyByAttendee((prev) => ({
                                          ...prev,
                                          [index]: { ...(prev[index] ?? {}), [addon.product_id]: n },
                                        }))
                                      }
                                      committedQty={sel.qty}
                                      onCommit={() => {
                                        const singleVid =
                                          addon.variants.length === 1 ? addon.variants[0].id : undefined;
                                        const cap = maxQtyPerTicketAttendee(
                                          addon,
                                          { variantId: singleVid, qty: 1 },
                                          index,
                                          addonSelectionsByAttendee
                                        );
                                        const d = addonDraftQtyByAttendee[index]?.[addon.product_id] ?? 1;
                                        const qty = Math.max(1, Math.min(d, cap));
                                        setAddonSelectionsByAttendee((prev) => ({
                                          ...prev,
                                          [index]: {
                                            ...(prev[index] ?? {}),
                                            [addon.product_id]:
                                              singleVid != null ? { variantId: singleVid, qty } : { qty },
                                          },
                                        }));
                                        setAddonDraftQtyByAttendee((prev) => ({
                                          ...prev,
                                          [index]: { ...(prev[index] ?? {}), [addon.product_id]: qty },
                                        }));
                                        const wasUpdate = sel.qty > 0;
                                        toast({
                                          title: wasUpdate ? 'Order updated' : 'Added to order',
                                          description: `Attendee ${index + 1}: ${addon.product_title} × ${qty}`,
                                        });
                                      }}
                                      onRemove={() => {
                                        const singleVid =
                                          addon.variants.length === 1 ? addon.variants[0].id : undefined;
                                        setAddonSelectionsByAttendee((prev) => ({
                                          ...prev,
                                          [index]: {
                                            ...(prev[index] ?? {}),
                                            [addon.product_id]:
                                              singleVid != null
                                                ? { variantId: singleVid, qty: 0 }
                                                : { qty: 0 },
                                          },
                                        }));
                                      }}
                                      outOfStock={outOfStock}
                                      maxQ={maxQ}
                                      enforced={enforced}
                                      canCommit={!outOfStock && (enforced ? maxQ > 0 : true)}
                                      quantityLabel="Qty"
                                      inputClassName="w-16 h-9 rounded-xl"
                                    />
                                  )}
                                </ProductMerchandiseLayout>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* Primary Contact Info (FREE route) */
            <>
              {/* Contact Info Card (shared component) - has its own Add button when empty */}
              <ContactInfoCard
                contactInfo={contactInfo}
                onUpdate={handleContactInfoUpdate}
                title="Contact info"
                description="We'll contact you only if there's any updates to your booking"
                showPhone={true}
                requiredFields={{
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                }}
                alwaysExpanded={true}
              />
            </>
          )}
        </div>

        {/* Terms & Conditions Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: '#0E7A3A' }} />
            <h3 className="text-base font-semibold" style={{ color: '#0F1F17' }}>
              Terms & Conditions
            </h3>
          </div>
          <Collapsible defaultOpen={false} className="group">
            <div
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/5 transition-colors"
                  style={{ color: '#0F1F17' }}
                >
                  <span className="text-sm font-medium">Event Ticket Terms & Conditions</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div
                  className="px-4 py-4 border-t text-sm whitespace-pre-wrap max-h-48 overflow-y-auto"
                  style={{ borderColor: 'rgba(14,122,58,0.14)', color: 'rgba(15,31,23,0.72)' }}
                >
                  {(event as any)?.metadata?.ticket_terms_and_conditions || DEFAULT_EVENT_TICKET_TERMS}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="tc-accepted"
              checked={tcAccepted}
              onCheckedChange={(checked) => setTcAccepted(checked === true)}
            />
            <label
              htmlFor="tc-accepted"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              style={{ color: '#0F1F17' }}
            >
              I have read and agree to the Event Ticket Terms & Conditions
            </label>
          </div>
          {marketingOptInEnabled && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="marketing-opt-in"
                checked={marketingOptIn}
                onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
              />
              <label
                htmlFor="marketing-opt-in"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                style={{ color: '#0F1F17' }}
              >
                {marketingOptInLabel}
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t z-20" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
          {addonStockOrderError && (
            <p className="text-sm text-destructive">{addonStockOrderError}</p>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold" style={{ color: '#0F1F17' }}>
                {formatCurrency(total)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPriceSheet(true)}
                className="h-auto p-0 text-xs text-muted-foreground"
              >
                See details
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <Button
              type="button"
              onClick={async () => {
                if (!bookingDraft || !isFormValid()) return;

                setIsSubmitting(true);
                try {
                  // Ensure attendees are saved to draft
                  let finalDraft = bookingDraft;
                  if (event?.collect_attendee_info === 'per_ticket' && attendees.length > 0) {
                    finalDraft = { ...bookingDraft, attendees };
                    saveBookingDraft(finalDraft);
                  }

                  // Build addon lines from selections (per-ticket: include attendeeIndex)
                  const addonLines: BookingDraftAddonLine[] =
                    event?.collect_attendee_info === 'per_ticket'
                      ? Object.entries(addonSelectionsByAttendee).flatMap(([idxStr, selections]) =>
                          Object.entries(selections)
                            .filter(([, sel]) => sel.qty > 0)
                            .map(([productId, sel]) => {
                              const addon = eventAddons.find((a) => a.product_id === productId);
                              if (!addon) return null;
                              const variant = addon.variants.find((v) => v.id === sel.variantId);
                              const unitPrice = variant?.price ?? addon.base_price ?? 0;
                              return {
                                productId,
                                productVariantId: sel.variantId,
                                label: addon.product_title,
                                variantLabel: variant?.name,
                                unitPrice,
                                qty: sel.qty,
                                attendeeIndex: parseInt(idxStr, 10),
                              };
                            })
                        ).filter(Boolean) as BookingDraftAddonLine[]
                      : Object.entries(addonSelections)
                          .filter(([, sel]) => sel.qty > 0)
                          .map(([productId, sel]) => {
                            const addon = eventAddons.find((a) => a.product_id === productId);
                            if (!addon) return null;
                            const variant = addon.variants.find((v) => v.id === sel.variantId);
                            const unitPrice = variant?.price ?? addon.base_price ?? 0;
                            return {
                              productId,
                              productVariantId: sel.variantId,
                              label: addon.product_title,
                              variantLabel: variant?.name,
                              unitPrice,
                              qty: sel.qty,
                            };
                          })
                          .filter(Boolean) as BookingDraftAddonLine[];
                  finalDraft = { ...finalDraft, addonLines };

                  // Create booking (server computes total_amount from ticket_types + products)
                  const result = await createBooking(
                    finalDraft,
                    contactInfo, // Always use contactInfo (same for FREE route and Per-Ticket mode)
                    event?.collect_attendee_info === 'per_ticket' ? attendees : undefined,
                    marketingOptInEnabled ? { marketingOptIn } : undefined
                  );

                  // Clear booking draft
                  clearBookingDraft();

                  // Clear tracking_link_id attribution after successful order creation
                  localStorage.removeItem('tracking_link_id');
                  console.log('[CompleteBookingPage] Cleared tracking_link_id from localStorage after order creation');

                  // Store orderId in sessionStorage for guest checkout access
                  sessionStorage.setItem('last_order_id', result.orderId);
                  
                  // Fetch order from DB to get server-computed total_amount
                  // This is the SECURITY FIX: routing decision uses server-computed amount, not client
                  const order = await getOrderWithEvent(result.orderId);
                  
                  if (!order) {
                    throw new Error('Failed to fetch order after creation');
                  }
                  
                  // Use server-computed total_amount to decide routing
                  const serverTotalAmount = Number(order.total_amount);
                  
                  // For free tickets (server-computed total_amount = 0): navigate to success
                  if (serverTotalAmount <= 0) {
                    // RPC function already sets paid_at, confirmed_at, payment_method='free', 
                    // and fulfillment_status='confirmed' for free orders.
                    // This call is a safety net (idempotent - won't update if already confirmed)
                    try {
                      const updatedOrder = await confirmFreeOrder(result.orderId);
                      
                      console.debug('[booking-route]', {
                        orderId: result.orderId,
                        amount_total: updatedOrder.total_amount,
                        payment_status: updatedOrder.payment_status,
                        fulfillment_status: updatedOrder.fulfillment_status,
                        payment_method: updatedOrder.payment_method,
                        route: 'success',
                      });
                    } catch (error: any) {
                      console.error('Error confirming free order:', error);
                      // Continue anyway - RPC should have set it correctly
                    }

                    toast({
                      title: 'Booking created successfully',
                      description: 'Your free ticket has been confirmed!',
                    });
                    navigate(`/booking/success/${result.orderId}`, { replace: true });
                  } else {
                    // Paid ticket - go to payment page
                    console.debug('[booking-route]', {
                      orderId: result.orderId,
                      amount_total: serverTotalAmount,
                      route: 'payment',
                    });

                    toast({
                      title: 'Booking created successfully',
                      description: 'Redirecting to payment...',
                    });
                    navigate(`/booking/payment/${result.orderId}`, { replace: true });
                  }
                } catch (error: any) {
                  console.error('Error creating booking:', error);
                  toast({
                    title: 'Error',
                    description: error.message || 'Failed to create booking. Please try again.',
                    variant: 'destructive',
                  });
                } finally {
                  setIsSubmitting(false);
                }
              }}
              disabled={!isFormValid() || isSubmitting}
              className="px-8 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Processing...' : total === 0 ? 'Finish booking' : 'Go to payment'}
            </Button>
          </div>
        </div>
      </div>

      {/* Contact Info Dialog (fallback for Add button) */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="dialog-firstName">First name</Label>
              <Input
                id="dialog-firstName"
                type="text"
                value={contactInfo.firstName}
                onChange={(e) =>
                  setContactInfo({ ...contactInfo, firstName: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="dialog-lastName">Last name</Label>
              <Input
                id="dialog-lastName"
                type="text"
                value={contactInfo.lastName}
                onChange={(e) =>
                  setContactInfo({ ...contactInfo, lastName: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="dialog-phone">Phone number</Label>
              <Input
                id="dialog-phone"
                type="tel"
                value={contactInfo.phone}
                onChange={(e) =>
                  setContactInfo({ ...contactInfo, phone: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="dialog-email">Email address</Label>
              <Input
                id="dialog-email"
                type="email"
                value={contactInfo.email}
                onChange={(e) =>
                  setContactInfo({ ...contactInfo, email: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowContactDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (isContactValid()) {
                  handleContactInfoUpdate(contactInfo);
                  setShowContactDialog(false);
                }
              }}
              disabled={!isContactValid()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Summary Sheet */}
      <Sheet open={showPriceSheet} onOpenChange={setShowPriceSheet}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto [&>button]:hidden">
          <SheetHeader>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPriceSheet(false)}
                className="h-8 w-8 -ml-2"
              >
                <X className="h-4 w-4" />
              </Button>
              <SheetTitle className="flex-1">Price summary</SheetTitle>
            </div>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            {bookingDraft.lines
              .filter((line) => line.qty > 0)
              .map((line, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                      {line.label}
                    </p>
                    {line.optionLabel && (
                      <p className="text-xs text-muted-foreground">{line.optionLabel}</p>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: '#0F1F17' }}>
                    {formatCurrency(line.unitPrice)} × {line.qty}
                  </p>
                </div>
              ))}
            {event?.collect_attendee_info === 'per_ticket'
              ? Object.entries(addonSelectionsByAttendee).flatMap(([idxStr, selections]) =>
                  Object.entries(selections)
                    .filter(([, sel]) => sel.qty > 0)
                    .map(([productId, sel]) => {
                      const addon = eventAddons.find((a) => a.product_id === productId);
                      if (!addon) return null;
                      const variant = addon.variants.find((v) => v.id === sel.variantId);
                      const unitPrice = variant?.price ?? addon.base_price ?? 0;
                      const attendeeNum = parseInt(idxStr, 10) + 1;
                      return (
                        <div key={`${idxStr}-${productId}`} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                              Attendee {attendeeNum}: {addon.product_title}
                              {variant?.name && (
                                <span className="text-xs text-muted-foreground ml-1">– {variant.name}</span>
                              )}
                            </p>
                          </div>
                          <p className="text-sm" style={{ color: '#0F1F17' }}>
                            {formatCurrency(unitPrice)} × {sel.qty}
                          </p>
                        </div>
                      );
                    })
                ).filter(Boolean)
              : Object.entries(addonSelections)
                  .filter(([, sel]) => sel.qty > 0)
                  .map(([productId, sel]) => {
                    const addon = eventAddons.find((a) => a.product_id === productId);
                    if (!addon) return null;
                    const variant = addon.variants.find((v) => v.id === sel.variantId);
                    const unitPrice = variant?.price ?? addon.base_price ?? 0;
                    return (
                      <div key={productId} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                            {addon.product_title}
                            {variant?.name && (
                              <span className="text-xs text-muted-foreground ml-1">– {variant.name}</span>
                            )}
                          </p>
                        </div>
                        <p className="text-sm" style={{ color: '#0F1F17' }}>
                          {formatCurrency(unitPrice)} × {sel.qty}
                        </p>
                      </div>
                    );
                  })}
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                Subtotal
              </span>
              <span className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                {formatCurrency(subtotal)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-base font-bold" style={{ color: '#0F1F17' }}>
                Total
              </span>
              <span className="text-base font-bold" style={{ color: '#0F1F17' }}>
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

