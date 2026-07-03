/**
 * Type Definitions for GrowBro Matching Platform
 * Organization-based multi-tenant system
 */

// ============================================================================
// ENUMS AND TYPES
// ============================================================================

export type OrgMemberRole = 'owner' | 'admin' | 'member';
export type ProductType = 'physical' | 'addon';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded';
export type TicketStatus = 'valid' | 'scanned' | 'cancelled';
export type PricingModel = 'fixed' | 'revenue_share';

// ============================================================================
// ORGANIZATION & MEMBERS
// ============================================================================

export interface Org {
  id: string;
  name: string;
  slug?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgMemberRole;
  created_at: string;
}

// ============================================================================
// PRODUCTS & VARIANTS
// ============================================================================

export interface Product {
  id: string;
  org_id: string;
  type: ProductType;
  title: string;
  description?: string;
  base_price?: number;
  metadata: Record<string, any>;
  category_id?: string;
  /** When false, product is out of sale and hidden from POS / public in-sale views. */
  is_on_sale?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku?: string;
  price?: number;
  metadata: Record<string, any>;
  archived_at?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CATEGORIES
// ============================================================================

export interface ProductCategory {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// PRICING
// ============================================================================

export interface ProductPricing {
  id: string;
  product_id: string;
  pricing_model: PricingModel;
  rate: number;
  rate_unit?: string;
  minimum_fee?: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// INVENTORY
// ============================================================================

export interface Warehouse {
  id: string;
  org_id: string;
  name: string;
  address?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  org_id: string;
  warehouse_id: string;
  variant_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  inventory_item_id: string;
  delta: number;
  reason: string;
  note?: string;
  created_by?: string;
  created_at: string;
}

// ============================================================================
// BOOKINGS
// ============================================================================

export interface Booking {
  id: string;
  brand_org_id: string;
  venue_org_id: string;
  resource_product_id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface BookingEntitlement {
  id: string;
  booking_id: string;
  code: string;
  redeemed_at?: string;
  redeemed_by?: string;
  created_at: string;
}

// ============================================================================
// EVENTS & TICKETS
// ============================================================================

export interface Event {
  id: string;
  org_id: string;
  venue_org_id?: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  day_2_start_at?: string | null;
  day_2_end_at?: string | null;
  day_3_start_at?: string | null;
  day_3_end_at?: string | null;
  day_4_start_at?: string | null;
  day_4_end_at?: string | null;
  status: EventStatus;
  slug?: string;
  location_text?: string | null;
  instagram_preview_image_url?: string | null;
  og_preview_image_url?: string | null;
  collect_attendee_info?: 'primary' | 'per_ticket';
  enable_stripe?: boolean | null;
  enable_payme?: boolean | null;
  enable_fps?: boolean | null;
  payme_link?: string | null;
  fps_link?: string | null;
  stripe_fee_bearer?: 'host' | 'user' | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TicketTypeAccessVariant {
  id: string;
  ticket_type_id: string;
  visibility_mode: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  price_override?: number | null;
  discount_percent?: number | null;
  quota?: number | null;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
  /** Calculated: remaining when variant has quota. remaining = quota - sold_count */
  remaining_count?: number;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  price: number;
  quota: number;
  metadata: Record<string, any>;
  visibility_mode?: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  is_active?: boolean;
  availability_mode?: 'always' | 'scheduled';
  available_start_at?: string | null;
  available_end_at?: string | null;
  valid_for_days?: 'day_1' | 'day_2' | 'day_3' | 'day_4' | 'both' | 'all';
  show_remaining_count?: boolean;
  threshold_to_show?: number | null;
  description?: string | null;
  remaining_count?: number; // Calculated field: quota - sold tickets (valid/scanned)
  created_at: string;
  updated_at: string;
  /** Access variants (multiple visibility rules per ticket type). Populated when fetching with includeAccessVariants. */
  access_variants?: TicketTypeAccessVariant[];
}

export interface Order {
  id: string;
  event_id: string;
  buyer_user_id: string;
  total_amount: number;
  status: OrderStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  ticket_type_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at: string;
}

export interface Ticket {
  id: string;
  order_id: string;
  order_item_id: string;
  ticket_type_id: string;
  qr_code: string;
  status: TicketStatus;
  scanned_at?: string;
  scanned_by?: string;
  created_at: string;
}

// ============================================================================
// UI LABELS & CONSTANTS
// ============================================================================

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  physical: 'Physical Product',
  addon: 'Add-on Only',
};

export const PRODUCT_TYPE_COLORS: Record<ProductType, string> = {
  physical: 'bg-blue-100 text-blue-700',
  addon: 'bg-amber-100 text-amber-700',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  valid: 'Valid',
  scanned: 'Scanned',
  cancelled: 'Cancelled',
};

export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  fixed: 'Fixed Price',
  revenue_share: 'Revenue Share',
};

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
}
