/**
 * Ticketing System Types
 * Types for events, ticket products, and tickets
 * 
 * Note: ProductClass is also defined in /lib/types.ts to keep it centralized
 */

export type EventCategory = 
  | 'Run Event'
  | 'Workshop'
  | 'Exhibition'
  | 'Party'
  | 'Talk'
  | 'Community Event'
  | 'Other';

export type CheckInMethod = 'qr_scan_only' | 'name_lookup' | 'manual_override';

export type EventVisibility = 'public' | 'hidden' | 'password_protected';

export interface EventRecord {
  id: string;
  brand_id: string; // References profiles.id (owner_user_id)
  name: string;
  description?: string;
  category?: EventCategory;
  cover_image_url?: string;
  date_start: string; // ISO datetime string
  date_end: string; // ISO datetime string
  location_name?: string;
  location_address?: string;
  location_map_url?: string;
  organizer_name?: string;
  admission_settings?: {
    check_in_method?: CheckInMethod;
    redemption_notes?: string;
  };
  event_password?: string; // For password-protected events
  created_at: string;
  updated_at?: string;
}

export interface TicketProductRecord {
  id: string;
  event_id: string;
  name: string;
  description?: string;
  price: number; // In dollars (will be converted to cents in DB)
  currency: string;
  capacity_total: number;
  capacity_remaining: number;
  sales_start?: string; // ISO datetime string
  sales_end?: string; // ISO datetime string
  max_per_customer?: number;
  wave_label?: string;
  valid_from?: string; // ISO datetime string
  valid_until?: string; // ISO datetime string
  require_holder_name: boolean;
  require_holder_email: boolean;
  allow_transfer: boolean;
  allow_reentry: boolean;
  created_at: string;
  updated_at?: string;
}

export interface TicketRecord {
  id: string;
  ticket_product_id: string;
  order_id?: string;
  holder_name?: string;
  holder_email?: string;
  holder_phone?: string;
  ticket_code: string;
  qr_data?: string;
  is_redeemed: boolean;
  redeemed_at?: string;
  created_at: string;
}

export interface TicketScanRecord {
  id: string;
  ticket_id: string;
  scanned_at: string;
  scanned_by_user_id?: string;
  scan_location?: string;
}

export interface EventWithTicketProducts extends EventRecord {
  ticket_products: TicketProductRecord[];
}

export interface TicketProductWithStats extends TicketProductRecord {
  tickets_sold?: number;
  tickets_remaining?: number;
}

// Form types for UI
export interface EventFormData {
  name: string;
  description?: string;
  category?: EventCategory;
  cover_image_url?: string;
  date_start: string;
  date_end: string;
  location_name?: string;
  location_address?: string;
  location_map_url?: string;
  organizer_name?: string;
  admission_settings?: {
    check_in_method?: CheckInMethod;
    redemption_notes?: string;
  };
  event_password?: string;
  is_purchasable: boolean;
  is_public: boolean;
  is_active: boolean;
  visibility: EventVisibility;
}

export interface TicketProductFormData {
  name: string;
  description?: string;
  price: number;
  currency: string;
  capacity_total: number;
  sales_start?: string;
  sales_end?: string;
  max_per_customer?: number;
  wave_label?: string;
  valid_from?: string;
  valid_until?: string;
  require_holder_name: boolean;
  require_holder_email: boolean;
  allow_transfer: boolean;
  allow_reentry: boolean;
}

export const EVENT_CATEGORIES: EventCategory[] = [
  'Run Event',
  'Workshop',
  'Exhibition',
  'Party',
  'Talk',
  'Community Event',
  'Other',
];

export const CHECK_IN_METHODS: { value: CheckInMethod; label: string }[] = [
  { value: 'qr_scan_only', label: 'QR Scan only' },
  { value: 'name_lookup', label: 'Name lookup allowed' },
  { value: 'manual_override', label: 'Manual override allowed' },
];

export const EVENT_VISIBILITY_OPTIONS: { value: EventVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'password_protected', label: 'Password protected' },
];

