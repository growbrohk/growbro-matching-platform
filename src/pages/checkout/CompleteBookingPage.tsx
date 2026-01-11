import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ArrowLeft, Plus, ChevronUp, ChevronDown, X } from 'lucide-react';
import {
  BookingDraft,
  ContactInfo,
  PromoCodeState,
  loadBookingDraft,
  saveContactInfo,
  loadContactInfo,
  savePromoCode,
  loadPromoCode,
  calculateBookingTotal,
} from '@/lib/types/booking';
import { formatEventDate } from '@/lib/utils/datetime';

export default function CompleteBookingPage() {
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
  });
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showPriceSheet, setShowPriceSheet] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoState, setPromoState] = useState<PromoCodeState>({
    code: '',
    applied: false,
    discountAmount: 0,
  });

  // Load booking draft on mount
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
  }, [navigate]);

  // Validate contact info
  const isContactValid = (): boolean => {
    return (
      contactInfo.firstName.trim() !== '' &&
      contactInfo.lastName.trim() !== '' &&
      contactInfo.phone.trim() !== '' &&
      isValidEmail(contactInfo.email)
    );
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle contact info save
  const handleSaveContact = () => {
    if (isContactValid()) {
      saveContactInfo(contactInfo);
      setShowContactDialog(false);
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
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading booking details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex-1">Complete booking</h1>
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
        <div className="space-y-3">
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

        {/* Contact Info Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: '#f97316' }} />
            <h3 className="text-base font-semibold" style={{ color: '#0F1F17' }}>
              Contact info
            </h3>
          </div>
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            We'll contact you only if there's any updates to your booking
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {contactInfo.firstName || contactInfo.lastName ? (
              <div
                className="px-3 py-1 rounded-full text-sm"
                style={{ backgroundColor: '#f97316', color: 'white' }}
              >
                {contactInfo.firstName} {contactInfo.lastName}
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowContactDialog(true)}
              style={{ borderColor: '#f97316', color: '#f97316' }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Contact Card */}
          {(contactInfo.firstName || contactInfo.lastName || contactInfo.phone || contactInfo.email) && (
            <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <div className="flex items-center justify-between">
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">First name</Label>
                    <p className="text-sm mt-1" style={{ color: contactInfo.firstName ? '#0F1F17' : '#f97316' }}>
                      {contactInfo.firstName || 'Please enter'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last name</Label>
                    <p className="text-sm mt-1" style={{ color: contactInfo.lastName ? '#0F1F17' : '#f97316' }}>
                      {contactInfo.lastName || 'Please enter'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone number</Label>
                    <p className="text-sm mt-1" style={{ color: contactInfo.phone ? '#0F1F17' : '#f97316' }}>
                      {contactInfo.phone || 'Please enter'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email address</Label>
                    <p className="text-sm mt-1" style={{ color: contactInfo.email ? '#0F1F17' : '#f97316' }}>
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
        </div>

        {/* Discounts Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: '#f97316' }} />
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
                style={{ backgroundColor: '#f97316' }}
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-20">
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
              onClick={() => {
                // Handle payment - placeholder
                console.log('Go to payment');
              }}
              disabled={!isContactValid()}
              className="px-8"
              style={{
                backgroundColor: isContactValid() ? '#f97316' : '#ccc',
                color: 'white',
              }}
            >
              Go to payment
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
              style={{ backgroundColor: '#f97316' }}
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

