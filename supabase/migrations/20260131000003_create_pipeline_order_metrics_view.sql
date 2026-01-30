-- Migration: Create pipeline_order_metrics view
-- Aggregates paid order revenue by tracking_link_id with commission rate calculations

-- ============================================================================
-- 1. CREATE VIEW: pipeline_order_metrics
-- ============================================================================

CREATE OR REPLACE VIEW public.pipeline_order_metrics AS
SELECT
  o.tracking_link_id,
  COUNT(*)::int AS orders_count,
  COALESCE(SUM(o.total_amount), 0)::numeric(12,2) AS gross_revenue,
  -- treat NULL commission_rate as 0
  (COALESCE(SUM(o.total_amount), 0) * (1 - COALESCE(t.commission_rate, 0)))::numeric(12,2) AS host_revenue,
  (COALESCE(SUM(o.total_amount), 0) * COALESCE(t.commission_rate, 0))::numeric(12,2) AS affiliate_revenue
FROM public.orders o
JOIN public.tracking_links t ON t.id = o.tracking_link_id
WHERE
  o.payment_status = 'paid'
  AND (o.status IS NULL OR o.status <> 'refunded')
  AND o.tracking_link_id IS NOT NULL
GROUP BY o.tracking_link_id, t.commission_rate;

-- ============================================================================
-- 2. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.pipeline_order_metrics TO authenticated;
GRANT SELECT ON public.pipeline_order_metrics TO anon;

-- ============================================================================
-- 3. ADD PERFORMANCE INDEX (optional)
-- ============================================================================

-- Partial index for paid orders with tracking_link_id
CREATE INDEX IF NOT EXISTS idx_orders_tracking_link_paid
  ON public.orders (tracking_link_id)
  WHERE payment_status = 'paid' AND tracking_link_id IS NOT NULL;

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON VIEW public.pipeline_order_metrics IS 'Aggregates paid order revenue by tracking_link_id. Computes orders_count, gross_revenue, host_revenue, and affiliate_revenue using tracking_links.commission_rate. Only includes paid orders that are not refunded.';
