-- Aggregate tracking click counts per link (avoids fetching every click row client-side)
CREATE OR REPLACE FUNCTION public.get_tracking_link_click_counts(p_link_ids uuid[])
RETURNS TABLE (tracking_link_id uuid, click_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT tc.tracking_link_id, COUNT(*)::bigint AS click_count
  FROM public.tracking_clicks tc
  WHERE tc.tracking_link_id = ANY(p_link_ids)
  GROUP BY tc.tracking_link_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_tracking_link_click_counts(uuid[]) TO anon, authenticated;
