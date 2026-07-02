-- Dashboard host-order aggregates (revenue, counts, pending shipping) for a date range.
CREATE OR REPLACE FUNCTION public.get_dashboard_order_stats(
  p_org_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  revenue_total numeric,
  orders_count_submitted_paid bigint,
  pending_count_submitted bigint,
  pending_shipping_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
    AND user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH host_orders AS (
    SELECT o.*
    FROM orders o
    WHERE o.created_at >= p_start
      AND o.created_at <= p_end
      AND (
        (o.order_type = 'product' AND o.host_org_id = p_org_id)
        OR o.event_id IN (SELECT e.id FROM events e WHERE e.org_id = p_org_id)
      )
  ),
  host_stats AS (
    SELECT
      COALESCE(SUM(o.total_amount) FILTER (
        WHERE o.payment_status = 'paid' OR o.fulfillment_status = 'confirmed'
      ), 0)::numeric AS revenue_total,
      COUNT(*) FILTER (WHERE o.payment_status IN ('submitted', 'paid')) AS orders_count_submitted_paid,
      COUNT(*) FILTER (WHERE o.payment_status = 'submitted') AS pending_count_submitted
    FROM host_orders o
  ),
  product_pending_shipping AS (
    SELECT COUNT(*)::bigint AS cnt
    FROM host_orders o
    WHERE o.order_type = 'product'
      AND (o.payment_status = 'paid' OR o.fulfillment_status = 'confirmed')
      AND o.shipped_at IS NULL
  ),
  addon_pending_shipping AS (
    SELECT COUNT(*)::bigint AS cnt
    FROM order_addon_items oai
    INNER JOIN orders o ON o.id = oai.order_id
    INNER JOIN events e ON e.id = o.event_id
    WHERE e.org_id = p_org_id
      AND oai.shipped_at IS NULL
      AND o.created_at >= p_start
      AND o.created_at <= p_end
      AND (o.payment_status = 'paid' OR o.fulfillment_status = 'confirmed')
  )
  SELECT
    hs.revenue_total,
    hs.orders_count_submitted_paid,
    hs.pending_count_submitted,
    pps.cnt + aps.cnt AS pending_shipping_count
  FROM host_stats hs
  CROSS JOIN product_pending_shipping pps
  CROSS JOIN addon_pending_shipping aps;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_order_stats(uuid, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_order_stats IS
  'Host-org order aggregates for dashboard: revenue, order counts, and pending shipping count within a date range.';
