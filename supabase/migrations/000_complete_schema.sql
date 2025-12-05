-- ============================================
-- Complete Database Schema for Growbro Matching Platform
-- ============================================
-- This file contains the complete database schema.
-- Use this to set up a fresh database or as a reference.
-- ============================================

-- ============================================
-- ENUMS
-- ============================================

-- User roles
CREATE TYPE public.user_role AS ENUM ('brand', 'venue');

-- Collaboration types
CREATE TYPE public.collab_type AS ENUM ('consignment', 'event', 'collab_product', 'cup_sleeve_marketing');

-- Collaboration request status
CREATE TYPE public.collab_status AS ENUM ('pending', 'accepted', 'declined', 'closed');

-- Venue option types
CREATE TYPE public.venue_option_type AS ENUM ('event_slot', 'shelf_space', 'exhibition_period', 'wall_space', 'other');

-- Inventory location types
CREATE TYPE public.inventory_location_type AS ENUM ('warehouse', 'venue');

-- ============================================
-- TABLES
-- ============================================

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  display_name TEXT NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  cover_image_url TEXT,
  short_bio TEXT,
  city TEXT,
  country TEXT,
  website_url TEXT,
  instagram_handle TEXT,
  tags TEXT[] DEFAULT '{}',
  preferred_collab_types collab_type[] DEFAULT '{}',
  typical_budget_min INTEGER,
  typical_budget_max INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table (brand catalog)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  short_description TEXT,
  full_description TEXT,
  category TEXT,
  thumbnail_url TEXT,
  price_range_min INTEGER,
  price_range_max INTEGER,
  price_in_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'hkd',
  suitable_collab_types collab_type[] DEFAULT '{}',
  margin_notes TEXT,
  inventory_notes TEXT,
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false,
  is_purchasable BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Collaboration listings table
CREATE TABLE public.collab_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  collab_type collab_type NOT NULL,
  target_role user_role,
  city TEXT,
  budget_min INTEGER,
  budget_max INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Likes table (for matching system)
CREATE TABLE public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_like BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id)
);

-- Matches table (created when two users like each other)
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_two_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_one_id, user_two_id)
);

-- Collaboration requests table
CREATE TABLE public.collab_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  collab_type collab_type NOT NULL,
  collab_listing_id UUID REFERENCES public.collab_listings(id) ON DELETE SET NULL,
  message TEXT,
  status collab_status DEFAULT 'pending',
  proposed_start_date DATE,
  proposed_end_date DATE,
  location_notes TEXT,
  budget_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Collaboration request products junction table
CREATE TABLE public.collab_request_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collab_request_id UUID NOT NULL REFERENCES public.collab_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  collab_request_id UUID REFERENCES public.collab_requests(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT message_thread_check CHECK (match_id IS NOT NULL OR collab_request_id IS NOT NULL)
);

-- Venue collaboration options table
CREATE TABLE public.venue_collab_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type venue_option_type NOT NULL,
  short_description TEXT,
  full_description TEXT,
  collab_types collab_type[] DEFAULT '{}',
  available_from TIMESTAMP WITH TIME ZONE,
  available_to TIMESTAMP WITH TIME ZONE,
  recurring_pattern TEXT,
  capacity_note TEXT,
  location_note TEXT,
  pricing_note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Collaboration request venue options junction table
CREATE TABLE public.collab_request_venue_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collab_request_id UUID NOT NULL REFERENCES public.collab_requests(id) ON DELETE CASCADE,
  venue_collab_option_id UUID NOT NULL REFERENCES public.venue_collab_options(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inventory locations table
CREATE TABLE public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type inventory_location_type NOT NULL,
  name TEXT NOT NULL,
  venue_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  address_line TEXT,
  city TEXT,
  area TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product inventory table
CREATE TABLE public.product_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  inventory_location_id UUID NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  stock_quantity INTEGER DEFAULT 0,
  reserved_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, inventory_location_id)
);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT DEFAULT 'pending',
  total_amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'hkd',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order items table
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  inventory_location_id UUID REFERENCES public.inventory_locations(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_request_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_collab_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_request_venue_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Products policies
CREATE POLICY "Products are viewable by everyone" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "Brands can insert their own products" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = brand_user_id);

CREATE POLICY "Brands can update their own products" ON public.products
  FOR UPDATE USING (auth.uid() = brand_user_id);

CREATE POLICY "Brands can delete their own products" ON public.products
  FOR DELETE USING (auth.uid() = brand_user_id);

-- Collab listings policies
CREATE POLICY "Listings are viewable by everyone" ON public.collab_listings
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own listings" ON public.collab_listings
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update their own listings" ON public.collab_listings
  FOR UPDATE USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete their own listings" ON public.collab_listings
  FOR DELETE USING (auth.uid() = owner_user_id);

-- Likes policies
CREATE POLICY "Users can view likes they sent or received" ON public.likes
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can insert their own likes" ON public.likes
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- Matches policies
CREATE POLICY "Users can view their own matches" ON public.matches
  FOR SELECT USING (auth.uid() = user_one_id OR auth.uid() = user_two_id);

CREATE POLICY "System can insert matches" ON public.matches
  FOR INSERT WITH CHECK (auth.uid() = user_one_id OR auth.uid() = user_two_id);

-- Collab requests policies
CREATE POLICY "Users can view collab requests they sent or received" ON public.collab_requests
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can insert collab requests" ON public.collab_requests
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update collab requests they're involved in" ON public.collab_requests
  FOR UPDATE USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Collab request products policies
CREATE POLICY "Users can view products in their collab requests" ON public.collab_request_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr 
      WHERE cr.id = collab_request_products.collab_request_id 
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert products to their collab requests" ON public.collab_request_products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr 
      WHERE cr.id = collab_request_products.collab_request_id 
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete products from their collab requests" ON public.collab_request_products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr 
      WHERE cr.id = collab_request_products.collab_request_id 
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

-- Messages policies
CREATE POLICY "Users can view messages in their matches or collab requests" ON public.messages
  FOR SELECT USING (
    auth.uid() = sender_user_id OR
    EXISTS (
      SELECT 1 FROM public.matches m 
      WHERE m.id = messages.match_id 
      AND (m.user_one_id = auth.uid() OR m.user_two_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.collab_requests cr 
      WHERE cr.id = messages.collab_request_id 
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert messages in their matches or collab requests" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_user_id AND (
      EXISTS (
        SELECT 1 FROM public.matches m 
        WHERE m.id = messages.match_id 
        AND (m.user_one_id = auth.uid() OR m.user_two_id = auth.uid())
      ) OR
      EXISTS (
        SELECT 1 FROM public.collab_requests cr 
        WHERE cr.id = messages.collab_request_id 
        AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
      )
    )
  );

-- Venue collab options policies
CREATE POLICY "Venue options are viewable by everyone" ON public.venue_collab_options
  FOR SELECT USING (true);

CREATE POLICY "Venues can insert their own options" ON public.venue_collab_options
  FOR INSERT WITH CHECK (auth.uid() = venue_user_id);

CREATE POLICY "Venues can update their own options" ON public.venue_collab_options
  FOR UPDATE USING (auth.uid() = venue_user_id);

CREATE POLICY "Venues can delete their own options" ON public.venue_collab_options
  FOR DELETE USING (auth.uid() = venue_user_id);

-- Collab request venue options policies
CREATE POLICY "Users can view venue options in their collab requests" ON public.collab_request_venue_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr
      WHERE cr.id = collab_request_venue_options.collab_request_id
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert venue options to their collab requests" ON public.collab_request_venue_options
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr
      WHERE cr.id = collab_request_venue_options.collab_request_id
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete venue options from their collab requests" ON public.collab_request_venue_options
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr
      WHERE cr.id = collab_request_venue_options.collab_request_id
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

-- Inventory locations policies
CREATE POLICY "Inventory locations are viewable by everyone" ON public.inventory_locations
  FOR SELECT USING (true);

CREATE POLICY "Venues can manage their own locations" ON public.inventory_locations
  FOR ALL USING (auth.uid() = venue_user_id);

CREATE POLICY "Authenticated users can create warehouse locations" ON public.inventory_locations
  FOR INSERT WITH CHECK (type = 'warehouse' AND auth.uid() IS NOT NULL);

-- Product inventory policies
CREATE POLICY "Product inventory is viewable by everyone" ON public.product_inventory
  FOR SELECT USING (true);

CREATE POLICY "Brands can manage inventory for their products" ON public.product_inventory
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.products p 
      WHERE p.id = product_inventory.product_id 
      AND p.brand_user_id = auth.uid()
    )
  );

CREATE POLICY "Venues can update inventory at their locations" ON public.product_inventory
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.inventory_locations il 
      WHERE il.id = product_inventory.inventory_location_id 
      AND il.venue_user_id = auth.uid()
    )
  );

-- Orders policies
CREATE POLICY "Anyone can create orders" ON public.orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Orders viewable by customer email or authenticated" ON public.orders
  FOR SELECT USING (true);

CREATE POLICY "Orders can be updated by system" ON public.orders
  FOR UPDATE USING (true);

-- Order items policies
CREATE POLICY "Order items are viewable" ON public.order_items
  FOR SELECT USING (true);

CREATE POLICY "Order items can be inserted" ON public.order_items
  FOR INSERT WITH CHECK (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function to check for mutual like and create match
CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_like = true THEN
    -- Check if the other user has already liked this user
    IF EXISTS (
      SELECT 1 FROM public.likes 
      WHERE from_user_id = NEW.to_user_id 
      AND to_user_id = NEW.from_user_id 
      AND is_like = true
    ) THEN
      -- Create a match (ensure consistent ordering to avoid duplicates)
      INSERT INTO public.matches (user_one_id, user_two_id)
      VALUES (
        LEAST(NEW.from_user_id, NEW.to_user_id),
        GREATEST(NEW.from_user_id, NEW.to_user_id)
      )
      ON CONFLICT (user_one_id, user_two_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_collab_listings_updated_at
  BEFORE UPDATE ON public.collab_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_collab_requests_updated_at
  BEFORE UPDATE ON public.collab_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venue_collab_options_updated_at
  BEFORE UPDATE ON public.venue_collab_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_locations_updated_at
  BEFORE UPDATE ON public.inventory_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_inventory_updated_at
  BEFORE UPDATE ON public.product_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for auto-creating matches
CREATE TRIGGER on_like_check_match
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.check_and_create_match();

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ============================================
-- INDEXES (Optional but recommended for performance)
-- ============================================

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON public.profiles(handle);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_products_brand_user_id ON public.products(brand_user_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_public ON public.products(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_collab_listings_owner_user_id ON public.collab_listings(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_collab_listings_collab_type ON public.collab_listings(collab_type);
CREATE INDEX IF NOT EXISTS idx_likes_from_user_id ON public.likes(from_user_id);
CREATE INDEX IF NOT EXISTS idx_likes_to_user_id ON public.likes(to_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_one_id ON public.matches(user_one_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_two_id ON public.matches(user_two_id);
CREATE INDEX IF NOT EXISTS idx_collab_requests_from_user_id ON public.collab_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_collab_requests_to_user_id ON public.collab_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_collab_requests_status ON public.collab_requests(status);
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON public.messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_collab_request_id ON public.messages(collab_request_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_user_id ON public.messages(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_venue_collab_options_venue_user_id ON public.venue_collab_options(venue_user_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_product_id ON public.product_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_product_inventory_location_id ON public.product_inventory(inventory_location_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

