-- =====================================================
-- Add kind/subtype to poster_spaces and create collabs/tracking tables
-- =====================================================
-- CHUNK 1: Adds listing kind/subtype + collab + tracking tables
-- Minimal flows for Promotion + Event Hosting tracking

-- =====================================================
-- 1. ADD KIND/SUBTYPE COLUMNS TO POSTER_SPACES
-- =====================================================

-- Add kind column (NOT NULL with default, but allow NULL initially for migration)
ALTER TABLE poster_spaces
ADD COLUMN IF NOT EXISTS kind text;

-- Add subtype column (nullable)
ALTER TABLE poster_spaces
ADD COLUMN IF NOT EXISTS subtype text;

-- Derive kind/subtype from existing category for backward compatibility
UPDATE poster_spaces
SET 
  kind = CASE
    WHEN category = 'consignment_shelf' THEN 'consignment'
    WHEN category IN ('poster_space', 'cup_sleeve_promotion') THEN 'promotion'
    WHEN category = 'event_hosting' THEN 'event_hosting'
    ELSE 'promotion' -- Default fallback
  END,
  subtype = CASE
    WHEN category = 'poster_space' THEN 'poster'
    WHEN category = 'cup_sleeve_promotion' THEN 'cupsleeve'
    ELSE NULL
  END
WHERE kind IS NULL;

-- Now add constraints
ALTER TABLE poster_spaces
ADD CONSTRAINT poster_spaces_kind_check 
CHECK (kind IN ('consignment', 'promotion', 'event_hosting'));

ALTER TABLE poster_spaces
ADD CONSTRAINT poster_spaces_subtype_check 
CHECK (subtype IS NULL OR subtype IN ('poster', 'cupsleeve'));

-- Set NOT NULL with default after backfilling
ALTER TABLE poster_spaces
ALTER COLUMN kind SET NOT NULL,
ALTER COLUMN kind SET DEFAULT 'promotion';

-- Create index for kind
CREATE INDEX IF NOT EXISTS idx_poster_spaces_kind ON poster_spaces(kind);

-- =====================================================
-- 2. CREATE COLLABS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.collabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.poster_spaces(id) ON DELETE CASCADE,
  host_org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  brand_org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'active', 'ended')),
  pricing_model text NOT NULL DEFAULT 'revenue_share' CHECK (pricing_model IN ('fixed', 'revenue_share', 'hybrid')),
  host_split_percent numeric DEFAULT 0,
  brand_split_percent numeric DEFAULT 0,
  platform_fee_percent numeric DEFAULT 0,
  listing_fee_cents int DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_collabs_listing_id ON public.collabs(listing_id);
CREATE INDEX IF NOT EXISTS idx_collabs_host_org_id ON public.collabs(host_org_id);
CREATE INDEX IF NOT EXISTS idx_collabs_brand_org_id ON public.collabs(brand_org_id);
CREATE INDEX IF NOT EXISTS idx_collabs_status ON public.collabs(status);

-- =====================================================
-- 3. CREATE TRACKING_CAMPAIGNS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tracking_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collab_id uuid NOT NULL REFERENCES public.collabs(id) ON DELETE CASCADE UNIQUE,
  short_code text NOT NULL UNIQUE,
  destination_type text NOT NULL CHECK (destination_type IN ('product', 'event', 'url')),
  destination_id uuid NULL,
  destination_url text NULL,
  scan_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tracking_campaigns_collab_id ON public.tracking_campaigns(collab_id);
CREATE INDEX IF NOT EXISTS idx_tracking_campaigns_short_code ON public.tracking_campaigns(short_code);

-- =====================================================
-- 4. CREATE TRIGGERS
-- =====================================================

-- Trigger for updated_at on collabs
CREATE TRIGGER update_collabs_updated_at
  BEFORE UPDATE ON public.collabs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.collabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_campaigns ENABLE ROW LEVEL SECURITY;

-- Collabs Policies
-- Allow read for authenticated users involved (host org members or brand org members)
CREATE POLICY "Users can view collabs for their orgs"
  ON public.collabs FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM org_members
        WHERE org_members.org_id = collabs.host_org_id
        AND org_members.user_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM org_members
        WHERE org_members.org_id = collabs.brand_org_id
        AND org_members.user_id = auth.uid()
      )
    )
  );

-- Allow inserts/updates for authenticated users (simplified - app logic will enforce permissions)
CREATE POLICY "Authenticated users can create collabs"
  ON public.collabs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update collabs"
  ON public.collabs FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Tracking Campaigns Policies
-- Allow read for authenticated users (same org access as collabs)
CREATE POLICY "Users can view tracking campaigns for their orgs"
  ON public.tracking_campaigns FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.collabs
      WHERE collabs.id = tracking_campaigns.collab_id
      AND (
        EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.org_id = collabs.host_org_id
          AND org_members.user_id = auth.uid()
        ) OR EXISTS (
          SELECT 1 FROM org_members
          WHERE org_members.org_id = collabs.brand_org_id
          AND org_members.user_id = auth.uid()
        )
      )
    )
  );

-- Allow public read for short_code lookups (needed for /t/:short_code route)
CREATE POLICY "Public can read tracking campaigns by short_code"
  ON public.tracking_campaigns FOR SELECT
  USING (true);

-- Allow authenticated inserts/updates
CREATE POLICY "Authenticated users can create tracking campaigns"
  ON public.tracking_campaigns FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update tracking campaigns"
  ON public.tracking_campaigns FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- 6. CREATE FUNCTION TO DERIVE CATEGORY FROM KIND/SUBTYPE
-- =====================================================
-- This function ensures category is always set correctly based on kind/subtype
-- Can be used in triggers or application logic

CREATE OR REPLACE FUNCTION derive_category_from_kind_subtype(
  p_kind text,
  p_subtype text
) RETURNS text AS $$
BEGIN
  IF p_kind = 'consignment' THEN
    RETURN 'consignment_shelf';
  ELSIF p_kind = 'promotion' AND p_subtype = 'poster' THEN
    RETURN 'poster_space';
  ELSIF p_kind = 'promotion' AND p_subtype = 'cupsleeve' THEN
    RETURN 'cup_sleeve_promotion';
  ELSIF p_kind = 'event_hosting' THEN
    RETURN 'event_hosting';
  ELSE
    -- Default fallback
    RETURN 'poster_space';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 7. CREATE TRIGGER TO AUTO-UPDATE CATEGORY FROM KIND/SUBTYPE
-- =====================================================
-- This ensures category is always in sync with kind/subtype

CREATE OR REPLACE FUNCTION sync_category_from_kind_subtype()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if kind or subtype changed
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.kind IS DISTINCT FROM NEW.kind OR OLD.subtype IS DISTINCT FROM NEW.subtype)) THEN
    NEW.category := derive_category_from_kind_subtype(NEW.kind, NEW.subtype);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_poster_spaces_category
  BEFORE INSERT OR UPDATE ON poster_spaces
  FOR EACH ROW
  EXECUTE FUNCTION sync_category_from_kind_subtype();

-- =====================================================
-- 8. CREATE FUNCTION TO GENERATE UNIQUE SHORT CODE FOR TRACKING
-- =====================================================
-- Generates a 6-8 character alphanumeric lowercase code

CREATE OR REPLACE FUNCTION generate_tracking_short_code()
RETURNS text AS $$
DECLARE
  chars text := '0123456789abcdefghijklmnopqrstuvwxyz';
  code text := '';
  i int;
  attempts int := 0;
  max_attempts int := 10;
  code_length int := 6;
BEGIN
  LOOP
    code := '';
    -- Generate random code
    FOR i IN 1..code_length LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM public.tracking_campaigns WHERE short_code = code) THEN
      RETURN code;
    END IF;
    
    attempts := attempts + 1;
    IF attempts >= max_attempts THEN
      -- Try with longer code
      code_length := code_length + 1;
      attempts := 0;
      IF code_length > 8 THEN
        RAISE EXCEPTION 'Failed to generate unique tracking short code';
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. CREATE FUNCTION TO INCREMENT SCAN COUNT
-- =====================================================
-- Safe RPC function to increment scan_count atomically

CREATE OR REPLACE FUNCTION increment_tracking_scan(short_code_param text)
RETURNS jsonb AS $$
DECLARE
  campaign_record public.tracking_campaigns;
BEGIN
  UPDATE public.tracking_campaigns
  SET scan_count = scan_count + 1
  WHERE short_code = short_code_param
  RETURNING * INTO campaign_record;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Tracking campaign not found');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'destination_type', campaign_record.destination_type,
    'destination_id', campaign_record.destination_id,
    'destination_url', campaign_record.destination_url,
    'scan_count', campaign_record.scan_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION increment_tracking_scan(text) TO authenticated, anon;

