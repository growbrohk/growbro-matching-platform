-- =====================================================
-- Add ticket_type_access_variants for multiple Access & Visibility per ticket type
-- =====================================================
-- Each ticket type can have multiple access variants (public, code, affiliate, hidden)
-- Each variant can have price_override or discount_percent for discounted display

-- 1) Create ticket_type_access_variants table
CREATE TABLE ticket_type_access_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  visibility_mode TEXT NOT NULL CHECK (visibility_mode IN ('public', 'code', 'affiliate', 'hidden')),
  access_code TEXT,
  allowed_affiliates TEXT[],
  price_override DECIMAL(10,2) CHECK (price_override IS NULL OR price_override >= 0),
  discount_percent DECIMAL(5,2) CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- For code mode: access_code required
  CONSTRAINT chk_code_has_access_code CHECK (
    visibility_mode != 'code' OR access_code IS NOT NULL
  ),
  -- At most one of price_override or discount_percent (both null = use base price)
  CONSTRAINT chk_override_xor_discount CHECK (
    (price_override IS NULL AND discount_percent IS NULL) OR
    (price_override IS NULL AND discount_percent IS NOT NULL) OR
    (price_override IS NOT NULL AND discount_percent IS NULL)
  )
);

CREATE INDEX idx_ticket_type_access_variants_ticket_type_id ON ticket_type_access_variants(ticket_type_id);
CREATE INDEX idx_ticket_type_access_variants_access_code ON ticket_type_access_variants(access_code) WHERE access_code IS NOT NULL;

-- 2) Trigger for updated_at
CREATE TRIGGER update_ticket_type_access_variants_updated_at
  BEFORE UPDATE ON ticket_type_access_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3) RLS
ALTER TABLE ticket_type_access_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view access variants for ticket types in their orgs"
  ON ticket_type_access_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ticket_types tt
      JOIN events e ON e.id = tt.event_id
      JOIN org_members om ON om.org_id = e.org_id
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert access variants for ticket types in their orgs"
  ON ticket_type_access_variants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ticket_types tt
      JOIN events e ON e.id = tt.event_id
      JOIN org_members om ON om.org_id = e.org_id
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update access variants for ticket types in their orgs"
  ON ticket_type_access_variants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ticket_types tt
      JOIN events e ON e.id = tt.event_id
      JOIN org_members om ON om.org_id = e.org_id
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete access variants for ticket types in their orgs"
  ON ticket_type_access_variants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ticket_types tt
      JOIN events e ON e.id = tt.event_id
      JOIN org_members om ON om.org_id = e.org_id
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
      AND om.user_id = auth.uid()
    )
  );

-- 4) Public read for anon (public event pages need to resolve variants)
CREATE POLICY "Public can read access variants for published events"
  ON ticket_type_access_variants FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM ticket_types tt
      JOIN events e ON e.id = tt.event_id
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
      AND e.status = 'published'
    )
  );

-- 5) Migrate existing ticket_types to access_variants
INSERT INTO ticket_type_access_variants (ticket_type_id, visibility_mode, access_code, allowed_affiliates, price_override, discount_percent)
SELECT 
  tt.id,
  COALESCE(tt.visibility_mode, 'public'),
  tt.access_code,
  tt.allowed_affiliates,
  NULL,
  NULL
FROM ticket_types tt;

COMMENT ON TABLE ticket_type_access_variants IS 'Multiple access/visibility rules per ticket type. Each variant can have price_override or discount_percent for discounted display.';
COMMENT ON COLUMN ticket_type_access_variants.price_override IS 'Explicit price for this variant. Mutually exclusive with discount_percent.';
COMMENT ON COLUMN ticket_type_access_variants.discount_percent IS 'Discount percentage off base price (e.g. 20 for 20% off). Mutually exclusive with price_override.';
