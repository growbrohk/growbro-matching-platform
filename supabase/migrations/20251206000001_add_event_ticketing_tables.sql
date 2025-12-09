-- ============================================
-- Event & Ticketing System Schema
-- ============================================
-- This migration adds support for event ticket products
-- Compatible with existing UUID-based schema
-- ============================================

-- 1. Add event_id column to products table (to link products to events)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS event_id UUID;

-- 2. Create events table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  cover_image_url TEXT,
  date_start TIMESTAMPTZ NOT NULL,
  date_end TIMESTAMPTZ NOT NULL,
  location_name TEXT,
  location_address TEXT,
  location_map_url TEXT,
  organizer_name TEXT,
  admission_settings JSONB,
  event_password TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add foreign key from products to events
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_event_id_fkey'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_event_id_fkey
        FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create ticket_products table (ticket types for an event)
CREATE TABLE IF NOT EXISTS public.ticket_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL, -- Stored in cents (will be converted from dollars)
  currency TEXT NOT NULL DEFAULT 'HKD',
  capacity_total INTEGER NOT NULL,
  capacity_remaining INTEGER NOT NULL,
  sales_start TIMESTAMPTZ,
  sales_end TIMESTAMPTZ,
  max_per_customer INTEGER,
  wave_label TEXT,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  require_holder_name BOOLEAN DEFAULT false,
  require_holder_email BOOLEAN DEFAULT false,
  allow_transfer BOOLEAN DEFAULT true,
  allow_reentry BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create tickets table (individual tickets with QR code)
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_product_id UUID NOT NULL REFERENCES public.ticket_products(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id),
  holder_name TEXT,
  holder_email TEXT,
  holder_phone TEXT,
  ticket_code TEXT NOT NULL UNIQUE,
  qr_data TEXT,
  is_redeemed BOOLEAN NOT NULL DEFAULT false,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create ticket_scans table (for check-in audit)
CREATE TABLE IF NOT EXISTS public.ticket_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scanned_by_user_id UUID REFERENCES auth.users(id),
  scan_location TEXT
);

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_brand_id ON public.events(brand_id);
CREATE INDEX IF NOT EXISTS idx_events_date_start ON public.events(date_start);
CREATE INDEX IF NOT EXISTS idx_ticket_products_event_id ON public.ticket_products(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_product_id ON public.tickets(ticket_product_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_code ON public.tickets(ticket_code);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON public.tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_ticket_scans_ticket_id ON public.ticket_scans(ticket_id);
CREATE INDEX IF NOT EXISTS idx_products_event_id ON public.products(event_id);

-- 8. RLS Policies for events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own events" ON public.events;
DROP POLICY IF EXISTS "Users can create their own events" ON public.events;
DROP POLICY IF EXISTS "Users can update their own events" ON public.events;
DROP POLICY IF EXISTS "Users can delete their own events" ON public.events;

CREATE POLICY "Users can view their own events"
  ON public.events FOR SELECT
  USING (auth.uid() = brand_id);

CREATE POLICY "Users can create their own events"
  ON public.events FOR INSERT
  WITH CHECK (auth.uid() = brand_id);

CREATE POLICY "Users can update their own events"
  ON public.events FOR UPDATE
  USING (auth.uid() = brand_id);

CREATE POLICY "Users can delete their own events"
  ON public.events FOR DELETE
  USING (auth.uid() = brand_id);

-- 9. RLS Policies for ticket_products
ALTER TABLE public.ticket_products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view ticket products for their events" ON public.ticket_products;
DROP POLICY IF EXISTS "Users can create ticket products for their events" ON public.ticket_products;
DROP POLICY IF EXISTS "Users can update ticket products for their events" ON public.ticket_products;
DROP POLICY IF EXISTS "Users can delete ticket products for their events" ON public.ticket_products;

CREATE POLICY "Users can view ticket products for their events"
  ON public.ticket_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = ticket_products.event_id
      AND events.brand_id = auth.uid()
    )
  );

CREATE POLICY "Users can create ticket products for their events"
  ON public.ticket_products FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = ticket_products.event_id
      AND events.brand_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ticket products for their events"
  ON public.ticket_products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = ticket_products.event_id
      AND events.brand_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete ticket products for their events"
  ON public.ticket_products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = ticket_products.event_id
      AND events.brand_id = auth.uid()
    )
  );

-- 10. RLS Policies for tickets
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view tickets for their events" ON public.tickets;
DROP POLICY IF EXISTS "Users can create tickets for their events" ON public.tickets;

CREATE POLICY "Users can view tickets for their events"
  ON public.tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_products
      JOIN public.events ON events.id = ticket_products.event_id
      WHERE ticket_products.id = tickets.ticket_product_id
      AND events.brand_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tickets for their events"
  ON public.tickets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ticket_products
      JOIN public.events ON events.id = ticket_products.event_id
      WHERE ticket_products.id = tickets.ticket_product_id
      AND events.brand_id = auth.uid()
    )
  );

-- 11. RLS Policies for ticket_scans
ALTER TABLE public.ticket_scans ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view scans for their events" ON public.ticket_scans;
DROP POLICY IF EXISTS "Users can create scans for their events" ON public.ticket_scans;

CREATE POLICY "Users can view scans for their events"
  ON public.ticket_scans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets
      JOIN public.ticket_products ON ticket_products.id = tickets.ticket_product_id
      JOIN public.events ON events.id = ticket_products.event_id
      WHERE tickets.id = ticket_scans.ticket_id
      AND events.brand_id = auth.uid()
    )
  );

CREATE POLICY "Users can create scans for their events"
  ON public.ticket_scans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets
      JOIN public.ticket_products ON ticket_products.id = tickets.ticket_product_id
      JOIN public.events ON events.id = ticket_products.event_id
      WHERE tickets.id = ticket_scans.ticket_id
      AND events.brand_id = auth.uid()
    )
  );

-- 12. Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS events_updated_at ON public.events;
DROP TRIGGER IF EXISTS ticket_products_updated_at ON public.ticket_products;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION update_events_updated_at();

CREATE TRIGGER ticket_products_updated_at
  BEFORE UPDATE ON public.ticket_products
  FOR EACH ROW
  EXECUTE FUNCTION update_events_updated_at();

-- 13. Function to generate unique ticket codes
CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    -- Generate a random 8-character alphanumeric code
    code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.tickets WHERE ticket_code = code) INTO exists_check;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT exists_check;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- 14. Add comments for documentation
COMMENT ON TABLE public.events IS 'Events that can have ticket products';
COMMENT ON TABLE public.ticket_products IS 'Ticket types/options for events';
COMMENT ON TABLE public.tickets IS 'Individual tickets issued to customers';
COMMENT ON TABLE public.ticket_scans IS 'Audit log of ticket check-ins/scans';
COMMENT ON COLUMN public.products.event_id IS 'Links product to event (for event_ticket product_class)';
COMMENT ON COLUMN public.ticket_products.price IS 'Price in cents (stored as numeric for precision)';
COMMENT ON COLUMN public.tickets.ticket_code IS 'Unique code for ticket verification';

