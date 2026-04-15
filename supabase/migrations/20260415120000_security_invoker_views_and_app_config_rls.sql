-- Security: PG15+ views default to owner execution (security_invoker off), which bypasses
-- invoker RLS on underlying tables. Enable security_invoker on public views used by the API.
-- Lock down app_config: enable RLS and revoke client SELECT (secrets / internal settings).

-- ============================================================================
-- 1. VIEWS: security invoker (RLS evaluated as querying user)
-- ============================================================================

ALTER VIEW public.pipeline_order_metrics SET (security_invoker = true);
ALTER VIEW public.host_order_cards SET (security_invoker = true);

COMMENT ON VIEW public.pipeline_order_metrics IS
  'Aggregates paid order revenue by tracking_link_id. Computes orders_count, gross_revenue, host_revenue, and affiliate_revenue using tracking_links.commission_rate. Only includes paid orders that are not refunded. Uses security_invoker so RLS on underlying tables applies to the querying user.';

COMMENT ON VIEW public.host_order_cards IS
  'View for hosts to see order cards (event + product). Includes orders that are confirmed OR pending confirmation with receipt uploaded. Uses security_invoker so RLS on underlying tables applies to the querying user.';

-- ============================================================================
-- 2. PIPELINE METRICS: unauthenticated users should not read aggregates via API
-- ============================================================================

REVOKE SELECT ON public.pipeline_order_metrics FROM anon;

-- ============================================================================
-- 3. APP_CONFIG: RLS + revoke direct client reads (triggers use SECURITY DEFINER)
-- ============================================================================

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

REVOKE SELECT ON TABLE public.app_config FROM anon;
REVOKE SELECT ON TABLE public.app_config FROM authenticated;

-- postgres + service_role retain SELECT from original migration; service_role bypasses RLS in Supabase.
-- SECURITY DEFINER trigger functions run as owner and continue to read secrets when needed.
