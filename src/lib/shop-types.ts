export type InventoryLocationType = 'warehouse' | 'venue';

export interface InventoryLocation {
  id: string;
  type: InventoryLocationType;
  name: string;
  venue_user_id?: string;
  address_line?: string;
  city?: string;
  area?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductInventory {
  id: string;
  product_id: string;
  inventory_location_id: string;
  stock_quantity: number;
  reserved_quantity: number;
  created_at: string;
  updated_at: string;
  inventory_location?: InventoryLocation;
}

export interface ShopProduct {
  id: string;
  brand_user_id: string;
  name: string;
  slug?: string;
  short_description?: string;
  full_description?: string;
  category?: string;
  thumbnail_url?: string;
  price_in_cents: number;
  currency: string;
  is_public: boolean;
  is_purchasable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  brand?: {
    display_name: string;
    handle: string;
    avatar_url?: string;
  };
  inventory?: ProductInventory[];
}

export interface Order {
  id: string;
  customer_email: string;
  customer_name?: string;
  stripe_session_id?: string;
  stripe_payment_intent_id?: string;
  status: string;
  total_amount_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price_cents: number;
  inventory_location_id?: string;
  created_at: string;
}

export function formatPrice(cents: number, currency: string = 'hkd'): string {
  if (cents === 0) return 'Free';
  const amount = cents / 100;
  const currencySymbols: Record<string, string> = {
    hkd: 'HK$',
    usd: '$',
    eur: '€',
    gbp: '£',
  };
  const symbol = currencySymbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
  return `${symbol}${amount.toFixed(0)}`;
}
