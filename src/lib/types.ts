export type UserRole = 'brand' | 'venue';
export type CollabType = 'consignment' | 'event' | 'collab_product' | 'cup_sleeve_marketing';
export type CollabStatus = 'pending' | 'accepted' | 'declined' | 'closed';
export type VenueOptionType = 'event_slot' | 'shelf_space' | 'exhibition_period' | 'wall_space' | 'other';
export type ProductOwnerType = 'brand' | 'venue';
export type ProductClass = 'physical' | 'ticket' | 'booking' | 'service' | 'space';

export interface Profile {
  id: string;
  role: UserRole;
  is_venue: boolean; // If true, user is also a venue (in addition to being a brand)
  display_name: string;
  handle: string;
  avatar_url?: string;
  cover_image_url?: string;
  short_bio?: string;
  city?: string;
  country?: string;
  website_url?: string;
  instagram_handle?: string;
  tags: string[];
  preferred_collab_types: CollabType[];
  typical_budget_min?: number;
  typical_budget_max?: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  // Legacy field (kept for backward compatibility)
  brand_user_id?: string;
  // New unified ownership fields
  owner_type: ProductOwnerType;
  owner_user_id: string;
  product_class: ProductClass;
  name: string;
  slug?: string;
  short_description?: string;
  full_description?: string;
  category?: string;
  thumbnail_url?: string;
  price_range_min?: number;
  price_range_max?: number;
  price_in_cents?: number;
  currency?: string;
  suitable_collab_types: CollabType[];
  margin_notes?: string;
  inventory_notes?: string;
  is_active: boolean;
  is_public?: boolean;
  is_purchasable?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollabListing {
  id: string;
  owner_user_id: string;
  title: string;
  description?: string;
  collab_type: CollabType;
  target_role?: UserRole;
  city?: string;
  budget_min?: number;
  budget_max?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Like {
  id: string;
  from_user_id: string;
  to_user_id: string;
  is_like: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  user_one_id: string;
  user_two_id: string;
  created_at: string;
}

export interface CollabRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  collab_type: CollabType;
  collab_listing_id?: string;
  message?: string;
  status: CollabStatus;
  proposed_start_date?: string;
  proposed_end_date?: string;
  location_notes?: string;
  budget_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CollabRequestProduct {
  id: string;
  collab_request_id: string;
  product_id: string;
  note?: string;
  created_at: string;
}

export interface Message {
  id: string;
  match_id?: string;
  collab_request_id?: string;
  sender_user_id: string;
  body: string;
  created_at: string;
}

export interface VenueCollabOption {
  id: string;
  venue_user_id: string;
  name: string;
  type: VenueOptionType;
  short_description?: string;
  full_description?: string;
  collab_types: CollabType[];
  available_from?: string;
  available_to?: string;
  recurring_pattern?: string;
  capacity_note?: string;
  location_note?: string;
  pricing_note?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollabRequestVenueOption {
  id: string;
  collab_request_id: string;
  venue_collab_option_id: string;
  note?: string;
  created_at: string;
}

export const COLLAB_TYPE_LABELS: Record<CollabType, string> = {
  consignment: 'Consignment',
  event: 'Event',
  collab_product: 'Collab Product',
  cup_sleeve_marketing: 'Cup Sleeve',
};

export const COLLAB_TYPE_COLORS: Record<CollabType, string> = {
  consignment: 'collab-chip-consignment',
  event: 'collab-chip-event',
  collab_product: 'collab-chip-collab-product',
  cup_sleeve_marketing: 'collab-chip-cup-sleeve',
};

export const VENUE_OPTION_TYPE_LABELS: Record<VenueOptionType, string> = {
  event_slot: 'Event Slot',
  shelf_space: 'Shelf Space',
  exhibition_period: 'Exhibition',
  wall_space: 'Wall Space',
  other: 'Other',
};

export const VENUE_OPTION_TYPE_COLORS: Record<VenueOptionType, string> = {
  event_slot: 'bg-purple-100 text-purple-700',
  shelf_space: 'bg-blue-100 text-blue-700',
  exhibition_period: 'bg-emerald-100 text-emerald-700',
  wall_space: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-700',
};

export const PRODUCT_CLASS_LABELS: Record<ProductClass, string> = {
  physical: 'Physical',
  ticket: 'Ticket',
  booking: 'Booking',
  service: 'Service',
  space: 'Space',
};

export const PRODUCT_CLASS_COLORS: Record<ProductClass, string> = {
  physical: 'bg-blue-100 text-blue-700',
  ticket: 'bg-purple-100 text-purple-700',
  booking: 'bg-green-100 text-green-700',
  service: 'bg-orange-100 text-orange-700',
  space: 'bg-pink-100 text-pink-700',
};
