-- Migration: Create get_channel_rows RPC function
-- Returns tracking channel data with aggregated stats (clicks, orders, revenue)
-- User access determined by org_members where user_id = auth.uid()

-- ============================================================================
-- 1. CREATE OR REPLACE FUNCTION get_channel_rows
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_channel_rows()
RETURNS TABLE (
  tracking_link_id UUID,
  label TEXT,
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
  ),
  link_stats AS (
    -- Aggregate clicks, orders, and revenue per tracking_link
    SELECT
      al.id AS tracking_link_id,
      COALESCE(al.label, al.slug) AS label,
      COALESCE(COUNT(DISTINCT tc.id), 0)::BIGINT AS clicks,
      COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.payment_status = 'paid'), 0)::BIGINT AS orders,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::NUMERIC AS revenue,
      al.destination_url,
      al.host_org_id,
      al.affiliate_org_id,
      al.is_active
    FROM accessible_links al
    LEFT JOIN tracking_clicks tc ON tc.tracking_link_id = al.id
    LEFT JOIN orders o ON o.tracking_link_id = al.id AND o.payment_status = 'paid'
    GROUP BY al.id, al.label, al.slug, al.destination_url, al.host_org_id, al.affiliate_org_id, al.is_active
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
    pi.clicks,
    pi.orders,
    pi.revenue,
    pi.destination_url,
    pi.collab_partner_org_id,
    o.name AS collab_partner_name,
    CASE 
      WHEN pi.is_active = true THEN 'active'
      ELSE 'inactive'
    END AS status
  FROM partner_info pi
  LEFT JOIN orgs o ON o.id = pi.collab_partner_org_id
  ORDER BY pi.clicks DESC, pi.label ASC;
END;
$$;

-- ============================================================================
-- 2. GRANT EXECUTE PERMISSION
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_channel_rows() TO authenticated;

-- ============================================================================
-- 3. CREATE INDEXES (if not already exist)
-- ============================================================================
-- Indexes should already exist from previous migrations, but ensure they're present
CREATE INDEX IF NOT EXISTS idx_tracking_clicks_tracking_link_id ON tracking_clicks(tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_link_id ON orders(tracking_link_id) WHERE payment_status = 'paid';
CREATE INDEX IF NOT EXISTS idx_tracking_links_host_org_id ON tracking_links(host_org_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_affiliate_org_id ON tracking_links(affiliate_org_id);

COMMENT ON FUNCTION public.get_channel_rows IS 'Returns tracking channel rows with aggregated stats (clicks, orders, revenue) for authenticated users based on org membership';
