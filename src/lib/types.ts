/**
 * Type Definitions for GrowBro Matching Platform
 * Organization-based multi-tenant system
 */

// ============================================================================
// ENUMS AND TYPES
// ============================================================================

export type OrgMemberRole = 'owner' | 'admin' | 'member';
export type ProductType = 'physical' | 'venue_asset';
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
// CATEGORIES & TAGS
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

export interface ProductTag {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface ProductTagLink {
  id: string;
  product_id: string;
  tag_id: string;
  created_at: string;
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
// BOOKINGS (for venue_asset products)
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
  status: EventStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  price: number;
  quota: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
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
  venue_asset: 'Venue Asset',
};

export const PRODUCT_TYPE_COLORS: Record<ProductType, string> = {
  physical: 'bg-blue-100 text-blue-700',
  venue_asset: 'bg-purple-100 text-purple-700',
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
