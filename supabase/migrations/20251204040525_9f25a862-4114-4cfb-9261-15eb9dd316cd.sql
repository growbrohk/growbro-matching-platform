-- Create enums
CREATE TYPE public.user_role AS ENUM ('brand', 'venue');
CREATE TYPE public.collab_type AS ENUM ('consignment', 'event', 'collab_product', 'cup_sleeve_marketing');
CREATE TYPE public.collab_status AS ENUM ('pending', 'accepted', 'declined', 'closed');

-- Create profiles table
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

-- Create products table (brand catalog)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_description TEXT,
  full_description TEXT,
  category TEXT,
  thumbnail_url TEXT,
  price_range_min INTEGER,
  price_range_max INTEGER,
  suitable_collab_types collab_type[] DEFAULT '{}',
  margin_notes TEXT,
  inventory_notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create collab_listings table
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

-- Create likes table
CREATE TABLE public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_like BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id)
);

-- Create matches table
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_two_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_one_id, user_two_id)
);

-- Create collab_requests table
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

-- Create collab_request_products table
CREATE TABLE public.collab_request_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collab_request_id UUID NOT NULL REFERENCES public.collab_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  collab_request_id UUID REFERENCES public.collab_requests(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT message_thread_check CHECK (match_id IS NOT NULL OR collab_request_id IS NOT NULL)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_request_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for products
CREATE POLICY "Products are viewable by everyone" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "Brands can insert their own products" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = brand_user_id);

CREATE POLICY "Brands can update their own products" ON public.products
  FOR UPDATE USING (auth.uid() = brand_user_id);

CREATE POLICY "Brands can delete their own products" ON public.products
  FOR DELETE USING (auth.uid() = brand_user_id);

-- RLS Policies for collab_listings
CREATE POLICY "Listings are viewable by everyone" ON public.collab_listings
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own listings" ON public.collab_listings
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update their own listings" ON public.collab_listings
  FOR UPDATE USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete their own listings" ON public.collab_listings
  FOR DELETE USING (auth.uid() = owner_user_id);

-- RLS Policies for likes
CREATE POLICY "Users can view likes they sent or received" ON public.likes
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can insert their own likes" ON public.likes
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- RLS Policies for matches
CREATE POLICY "Users can view their own matches" ON public.matches
  FOR SELECT USING (auth.uid() = user_one_id OR auth.uid() = user_two_id);

CREATE POLICY "System can insert matches" ON public.matches
  FOR INSERT WITH CHECK (auth.uid() = user_one_id OR auth.uid() = user_two_id);

-- RLS Policies for collab_requests
CREATE POLICY "Users can view collab requests they sent or received" ON public.collab_requests
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can insert collab requests" ON public.collab_requests
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update collab requests they're involved in" ON public.collab_requests
  FOR UPDATE USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- RLS Policies for collab_request_products
CREATE POLICY "Users can view products in their collab requests" ON public.collab_request_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr 
      WHERE cr.id = collab_request_id 
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert products to their collab requests" ON public.collab_request_products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr 
      WHERE cr.id = collab_request_id 
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete products from their collab requests" ON public.collab_request_products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr 
      WHERE cr.id = collab_request_id 
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their matches or collab requests" ON public.messages
  FOR SELECT USING (
    auth.uid() = sender_user_id OR
    EXISTS (
      SELECT 1 FROM public.matches m 
      WHERE m.id = match_id 
      AND (m.user_one_id = auth.uid() OR m.user_two_id = auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.collab_requests cr 
      WHERE cr.id = collab_request_id 
      AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert messages in their matches or collab requests" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_user_id AND (
      EXISTS (
        SELECT 1 FROM public.matches m 
        WHERE m.id = match_id 
        AND (m.user_one_id = auth.uid() OR m.user_two_id = auth.uid())
      ) OR
      EXISTS (
        SELECT 1 FROM public.collab_requests cr 
        WHERE cr.id = collab_request_id 
        AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
      )
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- Function to check for mutual like and create match
CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-creating matches
CREATE TRIGGER on_like_check_match
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.check_and_create_match();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;