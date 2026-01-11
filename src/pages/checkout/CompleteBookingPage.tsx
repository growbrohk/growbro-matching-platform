import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Plus, ChevronUp, ChevronDown, X, Copy } from 'lucide-react';
import {
  BookingDraft,
  ContactInfo,
  AttendeeInfo,
  PromoCodeState,
  loadBookingDraft,
  saveContactInfo,
  loadContactInfo,
  savePromoCode,
  loadPromoCode,
  calculateBookingTotal,
  saveBookingDraft,
} from '@/lib/types/booking';
import { formatEventDate } from '@/lib/utils/datetime';
import { getEvent } from '@/lib/api/events';
import { createBooking } from '@/lib/api/bookings';
import { clearBookingDraft } from '@/lib/types/booking';
import { useToast } from '@/hooks/use-toast';
import type { Event } from '@/lib/types';

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
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showPriceSheet, setShowPriceSheet] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoState, setPromoState] = useState<PromoCodeState>({
    code: '',
    applied: false,
    discountAmount: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    // Load saved promo code
    const savedPromo = loadPromoCode();
    if (savedPromo) {
      setPromoState(savedPromo);
      setPromoCode(savedPromo.code);
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
              } else {
                setAttendees(initialAttendees);
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch event:', error);
        }
      }
    };

    fetchEvent();
  }, [navigate]);

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

  // Check if form is valid (either contact info or all attendees)
  const isFormValid = (): boolean => {
    if (event?.collect_attendee_info === 'per_ticket') {
      return areAttendeesValid();
    }
    return isContactValid();
  };

  // Handle contact info save
  const handleSaveContact = () => {
    if (isContactValid()) {
      saveContactInfo(contactInfo);
      setShowContactDialog(false);
    }
  };

  // Handle attendee update
  const handleAttendeeUpdate = (index: number, field: keyof AttendeeInfo, value: string) => {
    const updated = [...attendees];
    updated[index] = { ...updated[index], [field]: value };
    setAttendees(updated);
    
    // Save to booking draft
    if (bookingDraft) {
      const updatedDraft = { ...bookingDraft, attendees: updated };
      setBookingDraft(updatedDraft);
      saveBookingDraft(updatedDraft);
    }
  };

  // Copy from Attendee 1
  const handleCopyFromFirst = (index: number) => {
    if (attendees.length > 0 && index > 0) {
      const firstAttendee = attendees[0];
      handleAttendeeUpdate(index, 'firstName', firstAttendee.firstName);
      handleAttendeeUpdate(index, 'lastName', firstAttendee.lastName);
      handleAttendeeUpdate(index, 'email', firstAttendee.email);
      handleAttendeeUpdate(index, 'phone', firstAttendee.phone);
    }
  };

  // Handle promo code apply
  const handleApplyPromo = () => {
    const code = promoCode.trim().toLowerCase();
    if (code === 'growbro') {
      const discount = 50; // HK$50 discount
      const newState: PromoCodeState = {
        code: promoCode.trim(),
        applied: true,
        discountAmount: discount,
      };
      setPromoState(newState);
      savePromoCode(newState);
    } else {
      const newState: PromoCodeState = {
        code: promoCode.trim(),
        applied: false,
        discountAmount: 0,
      };
      setPromoState(newState);
      savePromoCode(newState);
    }
  };

  // Calculate totals
  const subtotal = bookingDraft
    ? bookingDraft.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)
    : 0;
  const discount = promoState.applied ? promoState.discountAmount : 0;
  const total = Math.max(0, subtotal - discount);

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

  // Check if contact info is empty
  const hasContactInfo = contactInfo.firstName || contactInfo.lastName || contactInfo.phone || contactInfo.email;

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
                </div>
              ))}
          </div>
          <div className="pt-2">
            <p className="text-xl font-bold" style={{ color: '#0F1F17' }}>
              {formatCurrency(total)}
            </p>
          </div>
        </div>

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
            /* Per-Ticket Attendee Forms */
            <div className="space-y-4">
              {attendees.map((attendee, index) => {
                const lineIndex = bookingDraft?.lines.findIndex(
                  (line) => line.ticketTypeId === attendee.ticketTypeId
                );
                const ticketLabel = bookingDraft?.lines[lineIndex || 0]?.label || 'Ticket';
                
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
                        {index > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyFromFirst(index)}
                            className="text-xs"
                            style={{ color: '#0E7A3A' }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy from Attendee 1
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{ticketLabel}</p>
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
                            value={attendee.firstName}
                            onChange={(e) => handleAttendeeUpdate(index, 'firstName', e.target.value)}
                            className="mt-1"
                            placeholder="Enter first name"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`attendee-lastName-${index}`} className="text-sm">
                            Last name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id={`attendee-lastName-${index}`}
                            type="text"
                            value={attendee.lastName}
                            onChange={(e) => handleAttendeeUpdate(index, 'lastName', e.target.value)}
                            className="mt-1"
                            placeholder="Enter last name"
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
                          value={attendee.email}
                          onChange={(e) => handleAttendeeUpdate(index, 'email', e.target.value)}
                          className="mt-1"
                          placeholder="Enter email address"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`attendee-phone-${index}`} className="text-sm">
                          Phone number <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id={`attendee-phone-${index}`}
                          type="tel"
                          value={attendee.phone}
                          onChange={(e) => handleAttendeeUpdate(index, 'phone', e.target.value)}
                          className="mt-1"
                          placeholder="Enter phone number"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* Primary Contact Info (Original) */
            <>
              {!hasContactInfo && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Clear form and open dialog for adding new contact
                      setContactInfo({
                        firstName: '',
                        lastName: '',
                        phone: '',
                        email: '',
                      });
                      setShowContactDialog(true);
                    }}
                    style={{ borderColor: 'rgba(14,122,58,0.2)', color: '#0E7A3A' }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              )}

              {/* Contact Card */}
              {hasContactInfo && (
                <div className="border rounded-2xl p-4 space-y-3" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">First name</Label>
                        <p className="text-sm mt-1" style={{ color: contactInfo.firstName ? '#0F1F17' : '#0E7A3A' }}>
                          {contactInfo.firstName || 'Please enter'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Last name</Label>
                        <p className="text-sm mt-1" style={{ color: contactInfo.lastName ? '#0F1F17' : '#0E7A3A' }}>
                          {contactInfo.lastName || 'Please enter'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Phone number</Label>
                        <p className="text-sm mt-1" style={{ color: contactInfo.phone ? '#0F1F17' : '#0E7A3A' }}>
                          {contactInfo.phone || 'Please enter'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Email address</Label>
                        <p className="text-sm mt-1" style={{ color: contactInfo.email ? '#0F1F17' : '#0E7A3A' }}>
                          {contactInfo.email || 'Please enter'}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowContactDialog(true)}
                      className="ml-2"
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Discounts Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: '#0E7A3A' }} />
            <h3 className="text-base font-semibold" style={{ color: '#0F1F17' }}>
              Discounts
            </h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleApplyPromo}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Apply
              </Button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'rgba(15,31,23,0.72)' }}>discounts promo codes</span>
              <div className="flex items-center gap-1">
                <span style={{ color: promoState.applied ? '#0F1F17' : 'rgba(15,31,23,0.72)' }}>
                  {promoState.applied ? `-${formatCurrency(promoState.discountAmount)}` : 'Not available'}
                </span>
                {!promoState.applied && <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sticky Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t z-20" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
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

                  // Create booking
                  const discount = promoState.applied ? promoState.discountAmount : 0;
                  const result = await createBooking(
                    finalDraft,
                    contactInfo,
                    event?.collect_attendee_info === 'per_ticket' ? attendees : undefined,
                    discount
                  );

                  // Clear booking draft
                  clearBookingDraft();

                  // Show success message
                  toast({
                    title: 'Booking created successfully',
                    description: 'Your order has been created. Redirecting to payment...',
                  });

                  // Store orderId in sessionStorage for guest checkout access
                  sessionStorage.setItem('last_order_id', result.orderId);
                  
                  // TODO: Redirect to payment provider (Stripe) or success page
                  // For now, redirect to a success page or orders page
                  navigate(`/booking/${result.orderId}/success`);
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
              {isSubmitting ? 'Processing...' : 'Go to payment'}
            </Button>
          </div>
        </div>
      </div>

      {/* Contact Info Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                type="text"
                value={contactInfo.firstName}
                onChange={(e) =>
                  setContactInfo({ ...contactInfo, firstName: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                type="text"
                value={contactInfo.lastName}
                onChange={(e) =>
                  setContactInfo({ ...contactInfo, lastName: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={contactInfo.phone}
                onChange={(e) =>
                  setContactInfo({ ...contactInfo, phone: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
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
              onClick={handleSaveContact}
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
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                Subtotal
              </span>
              <span className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                {formatCurrency(subtotal)}
              </span>
            </div>
            {promoState.applied && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  Discount
                </span>
                <span className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                  -{formatCurrency(promoState.discountAmount)}
                </span>
              </div>
            )}
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

