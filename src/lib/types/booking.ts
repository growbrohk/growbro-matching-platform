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
  /** Variant used when purchasing via code/affiliate. For per-variant quota tracking. */
  ticketTypeAccessVariantId?: string | null;
  dateTimeLabel?: string; // e.g., "Fri 6 Dec 18:00–22:00"
}

export interface BookingDraftAddonLine {
  productId: string;
  productVariantId?: string;
  label: string;
  variantLabel?: string;
  unitPrice: number;
  qty: number;
  /** When set, add-on is for this attendee (per-ticket mode). */
  attendeeIndex?: number;
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
  addonLines?: BookingDraftAddonLine[];
  attendees?: AttendeeInfo[]; // Per-ticket attendee information
}

export interface ContactInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

// localStorage keys
export const BOOKING_DRAFT_KEY = 'growbro_booking_draft';
export const CONTACT_INFO_KEY = 'growbro_contact_info';

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

