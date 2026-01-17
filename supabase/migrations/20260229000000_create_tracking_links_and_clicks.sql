-- Migration: Create tracking_links and tracking_clicks tables
-- Enables Bitly-style tracking links with click logging and tid parameter tracking

-- ============================================================================
-- 1. CREATE tracking_links TABLE
-- ============================================================================
CREATE TABLE public.tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT,
  destination_url TEXT NOT NULL,
  host_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  affiliate_org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for tracking_links
CREATE INDEX idx_tracking_links_host_org_id ON tracking_links(host_org_id);
CREATE INDEX idx_tracking_links_affiliate_org_id ON tracking_links(affiliate_org_id);
CREATE INDEX idx_tracking_links_slug ON tracking_links(slug);
CREATE INDEX idx_tracking_links_is_active ON tracking_links(is_active) WHERE is_active = true;

-- ============================================================================
-- 2. CREATE tracking_clicks TABLE
-- ============================================================================
CREATE TABLE public.tracking_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_link_id UUID NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  referrer TEXT,
  user_agent TEXT
);

-- Indexes for tracking_clicks
CREATE INDEX idx_tracking_clicks_tracking_link_id_clicked_at ON tracking_clicks(tracking_link_id, clicked_at DESC);
CREATE INDEX idx_tracking_clicks_clicked_at ON tracking_clicks(clicked_at DESC);

-- ============================================================================
-- 3. ADD tracking_link_id COLUMN TO orders
-- ============================================================================
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_link_id UUID REFERENCES public.tracking_links(id);

CREATE INDEX IF NOT EXISTS idx_orders_tracking_link_id ON orders(tracking_link_id);

-- ============================================================================
-- 4. ENABLE RLS
-- ============================================================================
ALTER TABLE tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_clicks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS POLICIES FOR tracking_links
-- ============================================================================

-- SELECT: Users can view tracking_links if they are members of host_org_id OR affiliate_org_id
CREATE POLICY "Users can view tracking_links for their orgs"
  ON tracking_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = tracking_links.host_org_id
      AND om.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = tracking_links.affiliate_org_id
      AND om.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: Only members of host_org_id can modify
CREATE POLICY "Users can create tracking_links for their host org"
  ON tracking_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = tracking_links.host_org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tracking_links for their host org"
  ON tracking_links FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = tracking_links.host_org_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tracking_links for their host org"
  ON tracking_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = tracking_links.host_org_id
      AND om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. RLS POLICIES FOR tracking_clicks
-- ============================================================================

-- SELECT: Users can view clicks if they can view the parent tracking_link
CREATE POLICY "Users can view tracking_clicks for accessible tracking_links"
  ON tracking_clicks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tracking_links tl
      WHERE tl.id = tracking_clicks.tracking_link_id
      AND (
        EXISTS (
          SELECT 1 FROM org_members om
          WHERE om.org_id = tl.host_org_id
          AND om.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM org_members om
          WHERE om.org_id = tl.affiliate_org_id
          AND om.user_id = auth.uid()
        )
      )
    )
  );

-- INSERT: Allow anonymous inserts (for redirect handler)
-- Note: If using edge function with service role, this can be restricted
-- For now, we allow anonymous inserts so the redirect handler can log clicks
CREATE POLICY "Allow anonymous inserts for tracking_clicks"
  ON tracking_clicks FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 7. FUNCTION TO GENERATE UNIQUE SLUG
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_tracking_slug(base_text TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug TEXT;
  v_counter INTEGER := 0;
  v_exists BOOLEAN;
BEGIN
  -- Generate base slug from text or random
  IF base_text IS NOT NULL AND base_text != '' THEN
    v_slug := lower(regexp_replace(base_text, '[^a-z0-9]+', '-', 'gi'));
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    IF length(v_slug) = 0 THEN
      v_slug := 'link';
    END IF;
  ELSE
    -- Generate random short slug (8 chars)
    v_slug := lower(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  END IF;

  -- Check uniqueness and append counter if needed
  LOOP
    SELECT EXISTS(SELECT 1 FROM tracking_links WHERE slug = v_slug) INTO v_exists;
    EXIT WHEN NOT v_exists;
    
    v_counter := v_counter + 1;
    IF base_text IS NOT NULL THEN
      v_slug := lower(regexp_replace(base_text, '[^a-z0-9]+', '-', 'gi')) || '-' || v_counter::text;
    ELSE
      v_slug := lower(substring(md5(random()::text || clock_timestamp()::text || v_counter::text) from 1 for 8));
    END IF;
  END LOOP;

  RETURN v_slug;
END;
$$;

COMMENT ON FUNCTION generate_tracking_slug IS 'Generates a unique slug for tracking links';
