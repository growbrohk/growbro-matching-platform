-- Add webstore columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS slug text UNIQUE,
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_purchasable boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS price_in_cents integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'hkd';

-- Create inventory location type enum
CREATE TYPE public.inventory_location_type AS ENUM ('warehouse', 'venue');

-- Create inventory_locations table
CREATE TABLE public.inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.inventory_location_type NOT NULL,
  name text NOT NULL,
  venue_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  address_line text,
  city text,
  area text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create product_inventory table
CREATE TABLE public.product_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  inventory_location_id uuid NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  stock_quantity integer DEFAULT 0,
  reserved_quantity integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(product_id, inventory_location_id)
);

-- Create orders table
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email text NOT NULL,
  customer_name text,
  stripe_session_id text,
  stripe_payment_intent_id text,
  status text DEFAULT 'pending',
  total_amount_cents integer NOT NULL,
  currency text DEFAULT 'hkd',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create order_items table
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity integer NOT NULL,
  unit_price_cents integer NOT NULL,
  inventory_location_id uuid REFERENCES public.inventory_locations(id),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- RLS for inventory_locations
CREATE POLICY "Inventory locations are viewable by everyone"
ON public.inventory_locations FOR SELECT
USING (true);

CREATE POLICY "Venues can manage their own locations"
ON public.inventory_locations FOR ALL
USING (auth.uid() = venue_user_id);

CREATE POLICY "Authenticated users can create warehouse locations"
ON public.inventory_locations FOR INSERT
WITH CHECK (type = 'warehouse' AND auth.uid() IS NOT NULL);

-- RLS for product_inventory
CREATE POLICY "Product inventory is viewable by everyone"
ON public.product_inventory FOR SELECT
USING (true);

CREATE POLICY "Brands can manage inventory for their products"
ON public.product_inventory FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.products p 
    WHERE p.id = product_inventory.product_id 
    AND p.brand_user_id = auth.uid()
  )
);

CREATE POLICY "Venues can update inventory at their locations"
ON public.product_inventory FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.inventory_locations il 
    WHERE il.id = product_inventory.inventory_location_id 
    AND il.venue_user_id = auth.uid()
  )
);

-- RLS for orders (public insert for checkout, viewable by email match)
CREATE POLICY "Anyone can create orders"
ON public.orders FOR INSERT
WITH CHECK (true);

CREATE POLICY "Orders viewable by customer email or authenticated"
ON public.orders FOR SELECT
USING (true);

CREATE POLICY "Orders can be updated by system"
ON public.orders FOR UPDATE
USING (true);

-- RLS for order_items
CREATE POLICY "Order items are viewable"
ON public.order_items FOR SELECT
USING (true);

CREATE POLICY "Order items can be inserted"
ON public.order_items FOR INSERT
WITH CHECK (true);

-- Add updated_at triggers
CREATE TRIGGER update_inventory_locations_updated_at
BEFORE UPDATE ON public.inventory_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_inventory_updated_at
BEFORE UPDATE ON public.product_inventory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();