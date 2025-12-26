-- Migration 4: Bookings and Booking Entitlements (for venue_asset products only)

-- Bookings table
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, -- brand renting the space
  venue_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, -- venue providing the space
  resource_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, -- must be type='venue_asset'
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);

-- Booking entitlements table (QR codes for redemption)
CREATE TABLE booking_entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE, -- unique QR code for redemption
  redeemed_at TIMESTAMPTZ,
  redeemed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_bookings_brand_org_id ON bookings(brand_org_id);
CREATE INDEX idx_bookings_venue_org_id ON bookings(venue_org_id);
CREATE INDEX idx_bookings_resource_product_id ON bookings(resource_product_id);
CREATE INDEX idx_bookings_start_at ON bookings(start_at);
CREATE INDEX idx_booking_entitlements_booking_id ON booking_entitlements(booking_id);
CREATE INDEX idx_booking_entitlements_code ON booking_entitlements(code);

-- Constraint: resource_product_id must reference a venue_asset product
CREATE OR REPLACE FUNCTION check_booking_product_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM products
    WHERE id = NEW.resource_product_id
    AND type = 'venue_asset'
  ) THEN
    RAISE EXCEPTION 'Booking resource_product_id must reference a product with type=venue_asset';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_booking_product_type_trigger
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_booking_product_type();

-- RLS for bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bookings involving their orgs"
  ON bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE (org_members.org_id = bookings.brand_org_id OR org_members.org_id = bookings.venue_org_id)
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create bookings for their orgs"
  ON bookings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = bookings.brand_org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update bookings involving their orgs"
  ON bookings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE (org_members.org_id = bookings.brand_org_id OR org_members.org_id = bookings.venue_org_id)
      AND org_members.user_id = auth.uid()
    )
  );

-- RLS for booking_entitlements
ALTER TABLE booking_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view entitlements for bookings involving their orgs"
  ON booking_entitlements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN org_members om ON (om.org_id = b.brand_org_id OR om.org_id = b.venue_org_id)
      WHERE b.id = booking_entitlements.booking_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create entitlements for bookings in their orgs"
  ON booking_entitlements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN org_members om ON om.org_id = b.brand_org_id
      WHERE b.id = booking_entitlements.booking_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update entitlements for bookings in their orgs"
  ON booking_entitlements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN org_members om ON (om.org_id = b.brand_org_id OR om.org_id = b.venue_org_id)
      WHERE b.id = booking_entitlements.booking_id
      AND om.user_id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



