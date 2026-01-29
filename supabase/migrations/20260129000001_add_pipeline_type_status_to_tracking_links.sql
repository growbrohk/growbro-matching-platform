-- Migration: Add pipeline type, status, commission_rate, and affiliate period to tracking_links
-- Replaces is_active boolean with status text enum
-- Adds type column to distinguish tracking vs affiliate links
-- Adds commission_rate and date range for affiliate links

-- ============================================================================
-- 1. ADD NEW COLUMNS
-- ============================================================================

-- Add type column (tracking, affiliate)
ALTER TABLE public.tracking_links 
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'tracking';

-- Add commission_rate column (stored as decimal, e.g., 0.15 for 15%)
ALTER TABLE public.tracking_links 
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) NULL;

-- Add affiliate period dates
ALTER TABLE public.tracking_links 
ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ NULL;
ALTER TABLE public.tracking_links 
ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ NULL;

-- Add status column (pending, active, inactive) - will replace is_active
ALTER TABLE public.tracking_links 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- ============================================================================
-- 2. MIGRATE EXISTING DATA
-- ============================================================================

-- Migrate is_active to status
UPDATE public.tracking_links
SET status = CASE 
  WHEN is_active = true THEN 'active'
  ELSE 'inactive'
END
WHERE status = 'active'; -- Only update if still default (to avoid overwriting manually set values)

-- ============================================================================
-- 3. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tracking_links_type ON tracking_links(type);
CREATE INDEX IF NOT EXISTS idx_tracking_links_status ON tracking_links(status);
CREATE INDEX IF NOT EXISTS idx_tracking_links_status_active ON tracking_links(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tracking_links_affiliate_period ON tracking_links(start_date, end_date) WHERE type = 'affiliate';

-- ============================================================================
-- 4. ADD CHECK CONSTRAINTS
-- ============================================================================

-- Ensure type is valid
ALTER TABLE public.tracking_links
ADD CONSTRAINT tracking_links_type_check 
CHECK (type IN ('tracking', 'affiliate'));

-- Ensure status is valid
ALTER TABLE public.tracking_links
ADD CONSTRAINT tracking_links_status_check 
CHECK (status IN ('pending', 'active', 'inactive'));

-- Ensure commission_rate is between 0 and 1 (0% to 100%)
ALTER TABLE public.tracking_links
ADD CONSTRAINT tracking_links_commission_rate_check 
CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1));

-- Ensure end_date is after start_date if both are set
ALTER TABLE public.tracking_links
ADD CONSTRAINT tracking_links_period_check 
CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

-- Ensure affiliate links have required fields
ALTER TABLE public.tracking_links
ADD CONSTRAINT tracking_links_affiliate_fields_check 
CHECK (
  type != 'affiliate' OR (
    affiliate_org_id IS NOT NULL AND
    commission_rate IS NOT NULL AND
    start_date IS NOT NULL AND
    end_date IS NOT NULL
  )
);

-- ============================================================================
-- 5. UPDATE RLS POLICIES (if needed - they should still work with status)
-- ============================================================================

-- RLS policies should continue to work since they check org membership, not status
-- No changes needed here

-- ============================================================================
-- 6. UPDATE get_channel_rows FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_channel_rows();

CREATE FUNCTION public.get_channel_rows()
RETURNS TABLE (
  tracking_link_id UUID,
  label TEXT,
  slug TEXT,
  qr_enabled BOOLEAN,
  clicks BIGINT,
  orders BIGINT,
  revenue NUMERIC,
  destination_url TEXT,
  collab_partner_org_id UUID,
  collab_partner_name TEXT,
  status TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  RETURN QUERY
  WITH user_orgs AS (
    -- Get all orgs the user is a member of
    SELECT DISTINCT org_id
    FROM org_members
    WHERE user_id = v_user_id
  ),
  accessible_links AS (
    -- Get tracking_links where user's org is host OR affiliate
    SELECT DISTINCT tl.*
    FROM tracking_links tl
    INNER JOIN user_orgs uo ON (
      tl.host_org_id = uo.org_id OR tl.affiliate_org_id = uo.org_id
    )
    -- Only show active links (exclude pending)
    WHERE tl.status = 'active'
  ),
  link_stats AS (
    -- Aggregate clicks, orders, and revenue per tracking_link
    SELECT
      al.id AS tracking_link_id,
      COALESCE(al.label, al.slug) AS label,
      al.slug,
      al.qr_enabled,
      COALESCE(COUNT(DISTINCT tc.id), 0)::BIGINT AS clicks,
      COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.payment_status = 'paid'), 0)::BIGINT AS orders,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::NUMERIC AS revenue,
      al.destination_url,
      al.host_org_id,
      al.affiliate_org_id,
      al.status
    FROM accessible_links al
    LEFT JOIN tracking_clicks tc ON tc.tracking_link_id = al.id
    LEFT JOIN orders o ON o.tracking_link_id = al.id AND o.payment_status = 'paid'
    GROUP BY al.id, al.label, al.slug, al.qr_enabled, al.destination_url, al.host_org_id, al.affiliate_org_id, al.status
  ),
  partner_info AS (
    -- Determine collab partner (the "other org")
    SELECT
      ls.*,
      CASE
        -- If user's org is host, partner is affiliate
        WHEN EXISTS (SELECT 1 FROM user_orgs WHERE org_id = ls.host_org_id) 
          AND ls.affiliate_org_id IS NOT NULL
        THEN ls.affiliate_org_id
        -- If user's org is affiliate, partner is host
        WHEN EXISTS (SELECT 1 FROM user_orgs WHERE org_id = ls.affiliate_org_id)
          AND ls.host_org_id IS NOT NULL
        THEN ls.host_org_id
        -- Otherwise no partner
        ELSE NULL
      END AS collab_partner_org_id
    FROM link_stats ls
  )
  SELECT
    pi.tracking_link_id,
    pi.label,
    pi.slug,
    pi.qr_enabled,
    pi.clicks,
    pi.orders,
    pi.revenue,
    pi.destination_url,
    pi.collab_partner_org_id,
    o.name AS collab_partner_name,
    pi.status
  FROM partner_info pi
  LEFT JOIN orgs o ON o.id = pi.collab_partner_org_id
  ORDER BY pi.clicks DESC, pi.label ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_channel_rows() TO authenticated;

COMMENT ON FUNCTION public.get_channel_rows IS 'Returns active tracking channel rows with aggregated stats (clicks, orders, revenue) including slug and qr_enabled for authenticated users based on org membership';

-- ============================================================================
-- 7. UPDATE update_tracking_link_safe FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_tracking_link_safe(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION public.update_tracking_link_safe(
  p_tracking_link_id UUID,
  p_label TEXT DEFAULT NULL,
  p_destination_url TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_qr_enabled BOOLEAN DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_host_org_id UUID;
  v_updated_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Validate status if provided
  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid status. Must be pending, active, or inactive';
  END IF;

  -- Verify user has permission (must be member of host_org_id)
  SELECT host_org_id INTO v_host_org_id
  FROM tracking_links
  WHERE id = p_tracking_link_id;

  IF v_host_org_id IS NULL THEN
    RAISE EXCEPTION 'Tracking link not found';
  END IF;

  -- Check if user is member of host org
  IF NOT EXISTS (
    SELECT 1 FROM org_members om
    WHERE om.org_id = v_host_org_id
    AND om.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not have permission to update this tracking link';
  END IF;

  -- Update only whitelisted fields
  UPDATE tracking_links
  SET
    label = COALESCE(p_label, label),
    destination_url = COALESCE(p_destination_url, destination_url),
    status = COALESCE(p_status, status),
    qr_enabled = COALESCE(p_qr_enabled, qr_enabled)
  WHERE id = p_tracking_link_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Failed to update tracking link';
  END IF;

  RETURN v_updated_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tracking_link_safe(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.update_tracking_link_safe IS 'Safely updates tracking_links with only whitelisted fields (label, destination_url, status, qr_enabled). Prevents updating slug, host_org_id, affiliate_org_id, type, commission_rate, or dates.';

-- ============================================================================
-- 8. CREATE FUNCTION TO AUTO-DEACTIVATE EXPIRED AFFILIATE LINKS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_expired_affiliate_links()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set status to inactive for affiliate links where end_date has passed
  UPDATE tracking_links
  SET status = 'inactive'
  WHERE type = 'affiliate'
    AND status = 'active'
    AND end_date IS NOT NULL
    AND end_date < now();
END;
$$;

COMMENT ON FUNCTION public.check_expired_affiliate_links IS 'Sets status to inactive for affiliate links where end_date has passed. Should be called periodically (e.g., via cron).';

-- Note: To set up automatic execution, create a pg_cron job or edge function
-- Example pg_cron: SELECT cron.schedule('check-expired-affiliates', '0 * * * *', 'SELECT check_expired_affiliate_links();');
