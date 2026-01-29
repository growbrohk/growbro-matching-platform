-- Migration: Remove qr_enabled column from tracking_links table
-- QR codes are now always enabled and generated client-side, so no backend storage needed

-- ============================================================================
-- 1. UPDATE get_channel_rows FUNCTION - Remove qr_enabled
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_channel_rows();

CREATE FUNCTION public.get_channel_rows()
RETURNS TABLE (
  tracking_link_id UUID,
  label TEXT,
  slug TEXT,
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
    SELECT DISTINCT org_id
    FROM org_members
    WHERE user_id = v_user_id
  ),
  accessible_links AS (
    SELECT DISTINCT tl.*
    FROM tracking_links tl
    INNER JOIN user_orgs uo ON (
      tl.host_org_id = uo.org_id OR tl.affiliate_org_id = uo.org_id
    )
    WHERE tl.status = 'active'
  ),
  link_stats AS (
    SELECT
      al.id AS tracking_link_id,
      COALESCE(al.label, al.slug) AS label,
      al.slug,
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
    GROUP BY al.id, al.label, al.slug, al.destination_url, al.host_org_id, al.affiliate_org_id, al.status
  ),
  partner_info AS (
    SELECT
      ls.*,
      CASE
        WHEN EXISTS (SELECT 1 FROM user_orgs WHERE org_id = ls.host_org_id) 
          AND ls.affiliate_org_id IS NOT NULL
        THEN ls.affiliate_org_id
        WHEN EXISTS (SELECT 1 FROM user_orgs WHERE org_id = ls.affiliate_org_id)
          AND ls.host_org_id IS NOT NULL
        THEN ls.host_org_id
        ELSE NULL
      END AS collab_partner_org_id
    FROM link_stats ls
  )
  SELECT
    pi.tracking_link_id,
    pi.label,
    pi.slug,
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

COMMENT ON FUNCTION public.get_channel_rows IS 'Returns active tracking channel rows with aggregated stats (clicks, orders, revenue) including slug for authenticated users based on org membership. Uses status instead of is_active. QR codes are always enabled.';

-- ============================================================================
-- 2. UPDATE update_tracking_link_safe FUNCTION - Remove p_qr_enabled parameter
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_tracking_link_safe(UUID, TEXT, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.update_tracking_link_safe(
  p_tracking_link_id UUID,
  p_label TEXT DEFAULT NULL,
  p_destination_url TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
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

  -- Update only whitelisted fields (qr_enabled removed - QR codes are always enabled)
  UPDATE tracking_links
  SET
    label = COALESCE(p_label, label),
    destination_url = COALESCE(p_destination_url, destination_url),
    status = COALESCE(p_status, status)
  WHERE id = p_tracking_link_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Failed to update tracking link';
  END IF;

  RETURN v_updated_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tracking_link_safe(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_tracking_link_safe IS 'Safely updates tracking_links with only whitelisted fields (label, destination_url, status). Prevents updating slug, host_org_id, affiliate_org_id, type, commission_rate, or dates. QR codes are always enabled.';

-- ============================================================================
-- 3. DROP INDEX ON qr_enabled (if exists)
-- ============================================================================

DROP INDEX IF EXISTS idx_tracking_links_qr_enabled;

-- ============================================================================
-- 4. DROP qr_enabled COLUMN
-- ============================================================================

ALTER TABLE public.tracking_links DROP COLUMN IF EXISTS qr_enabled;
