/**
 * Booking Draft Types
 * Used for localStorage persistence during checkout flow
 */

export interface BookingDraftLine {
  label: string; // e.g., "1-Day Ticket"
  optionLabel?: string; // e.g., "Adult"
  unitPrice: number;
  qty: number;
  ticketTypeId: string; // Reference to ticket type
  dateTimeLabel?: string; // e.g., "Fri 6 Dec 18:00–22:00"
}

export interface AttendeeInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ticketTypeId: string;
}

export interface BookingDraft {
  eventId: string;
  eventTitle: string;
  dateLabel?: string; // e.g., "12 Jan 2026"
  currency: string; // e.g., "HKD"
  lines: BookingDraftLine[];
  attendees?: AttendeeInfo[]; // Per-ticket attendee information
}

export interface ContactInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface PromoCodeState {
  code: string;
  applied: boolean;
  discountAmount: number;
}

// localStorage keys
export const BOOKING_DRAFT_KEY = 'growbro_booking_draft';
export const CONTACT_INFO_KEY = 'growbro_contact_info';
export const PROMO_CODE_KEY = 'growbro_promo_code';

// localStorage helpers
export const saveBookingDraft = (draft: BookingDraft): void => {
  try {
    localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    console.error('Failed to save booking draft:', error);
  }
};

export const loadBookingDraft = (): BookingDraft | null => {
  try {
    const stored = localStorage.getItem(BOOKING_DRAFT_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as BookingDraft;
  } catch (error) {
    console.error('Failed to load booking draft:', error);
    return null;
  }
};

export const clearBookingDraft = (): void => {
  try {
    localStorage.removeItem(BOOKING_DRAFT_KEY);
  } catch (error) {
    console.error('Failed to clear booking draft:', error);
  }
};

export const saveContactInfo = (contact: ContactInfo): void => {
  try {
    localStorage.setItem(CONTACT_INFO_KEY, JSON.stringify(contact));
  } catch (error) {
    console.error('Failed to save contact info:', error);
  }
};

export const loadContactInfo = (): ContactInfo | null => {
  try {
    const stored = localStorage.getItem(CONTACT_INFO_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as ContactInfo;
  } catch (error) {
    console.error('Failed to load contact info:', error);
    return null;
  }
};

export const savePromoCode = (promo: PromoCodeState): void => {
  try {
    localStorage.setItem(PROMO_CODE_KEY, JSON.stringify(promo));
  } catch (error) {
    console.error('Failed to save promo code:', error);
  }
};

export const loadPromoCode = (): PromoCodeState | null => {
  try {
    const stored = localStorage.getItem(PROMO_CODE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as PromoCodeState;
  } catch (error) {
    console.error('Failed to load promo code:', error);
    return null;
  }
};

// Calculate total from booking draft
export const calculateBookingTotal = (draft: BookingDraft, discount: number = 0): number => {
  const subtotal = draft.lines.reduce((sum, line) => sum + (line.unitPrice * line.qty), 0);
  return Math.max(0, subtotal - discount);
};

