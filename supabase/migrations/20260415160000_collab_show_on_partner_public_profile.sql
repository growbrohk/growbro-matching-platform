-- Host-controlled: show collab event/product on affiliate org's public brand page.

-- ============================================================================
-- 1. Column + backfill
-- ============================================================================
ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS collab_show_on_partner_public_profile BOOLEAN;

UPDATE public.tracking_links
SET collab_show_on_partner_public_profile = true
WHERE type = 'collab'
  AND collab_show_on_partner_public_profile IS NULL;

COMMENT ON COLUMN public.tracking_links.collab_show_on_partner_public_profile IS
  'collab: when true, linked event or product may appear on affiliate org public brand page.';

-- ============================================================================
-- 2. CHECK constraint (include new column in both branches)
-- ============================================================================
ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_collab_fields_check;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_collab_fields_check
  CHECK (
    (
      type <> 'collab'
      AND collab_sales_scope IS NULL
      AND collab_partner_role IS NULL
      AND collab_can_view_order_details IS NULL
      AND collab_can_mark_shipped IS NULL
      AND collab_show_event_in_partner_events_tab IS NULL
      AND collab_partner_allow_edit_tab IS NULL
      AND collab_partner_allow_tickets_tab IS NULL
      AND collab_partner_allow_scan_tab IS NULL
      AND collab_show_on_partner_public_profile IS NULL
    )
    OR (
      type = 'collab'
      AND collab_sales_scope IS NOT NULL
      AND collab_sales_scope IN ('attributed', 'all_for_resource')
      AND collab_partner_role IS NOT NULL
      AND collab_partner_role IN ('viewer', 'editor')
      AND collab_can_view_order_details IS NOT NULL
      AND collab_can_mark_shipped IS NOT NULL
      AND collab_show_event_in_partner_events_tab IS NOT NULL
      AND collab_partner_allow_edit_tab IS NOT NULL
      AND collab_partner_allow_tickets_tab IS NOT NULL
      AND collab_partner_allow_scan_tab IS NOT NULL
      AND collab_show_on_partner_public_profile IS NOT NULL
    )
  );

-- ============================================================================
-- 3. RPC: collab items for partner public brand page (host slug for deep links)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_collab_brand_page_items(p_affiliate_org_id uuid)
RETURNS TABLE (
  kind text,
  item_id uuid,
  host_org_slug text,
  tracking_link_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN tl.event_id IS NOT NULL THEN 'event'::text ELSE 'product'::text END,
    COALESCE(tl.event_id, tl.product_id),
    ho.slug,
    tl.id
  FROM public.tracking_links tl
  INNER JOIN public.orgs ho ON ho.id = tl.host_org_id
  WHERE tl.affiliate_org_id = p_affiliate_org_id
    AND tl.type = 'collab'
    AND tl.status = 'active'
    AND tl.collab_show_on_partner_public_profile = true
    AND (tl.event_id IS NOT NULL OR tl.product_id IS NOT NULL);
$$;

COMMENT ON FUNCTION public.get_collab_brand_page_items(uuid) IS
  'Public brand page: active collab links where host content may show on affiliate profile; returns item id, host org slug for URLs, and tracking_link_id.';

GRANT EXECUTE ON FUNCTION public.get_collab_brand_page_items(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_collab_brand_page_items(uuid) TO authenticated;
