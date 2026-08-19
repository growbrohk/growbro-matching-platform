-- Ticket refunds: refunded_at column, host-only authority, inventory counters, effective revenue view.

-- ============================================================================
-- 1. Columns + index
-- ============================================================================
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.tickets.refunded_at IS 'When set, ticket is refunded (manual host action). Check-in status (valid/scanned) is preserved.';
COMMENT ON COLUMN public.tickets.refunded_by IS 'Host org member who marked the ticket refunded.';

CREATE INDEX IF NOT EXISTS idx_tickets_order_id_refunded
  ON public.tickets (order_id)
  WHERE refunded_at IS NOT NULL;

-- ============================================================================
-- 2. Host-only refund authority trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_ticket_refund_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_org_id UUID;
BEGIN
  IF NEW.refunded_at IS NOT DISTINCT FROM OLD.refunded_at THEN
    RETURN NEW;
  END IF;

  SELECT e.org_id INTO v_event_org_id
  FROM public.orders o
  JOIN public.events e ON e.id = o.event_id
  WHERE o.id = NEW.order_id;

  IF v_event_org_id IS NULL THEN
    RAISE EXCEPTION 'Cannot refund ticket: order is not an event order';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.org_id = v_event_org_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only host organization members can refund tickets';
  END IF;

  IF NEW.refunded_at IS NOT NULL THEN
    NEW.refunded_by := auth.uid();
  ELSE
    NEW.refunded_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_refund_authority ON public.tickets;
CREATE TRIGGER tickets_refund_authority
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ticket_refund_authority();

-- ============================================================================
-- 3. Patch ticket counters to exclude refunded tickets
-- ============================================================================
CREATE OR REPLACE FUNCTION public.count_paid_tickets_for_inventory(
  p_ticket_type_id UUID,
  p_time_slot TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.tickets t
  JOIN public.orders o ON o.id = t.order_id
  WHERE t.ticket_type_id = p_ticket_type_id
    AND t.refunded_at IS NULL
    AND t.status IN ('valid', 'scanned')
    AND o.payment_status IN ('paid', 'submitted')
    AND (o.fulfillment_status IS NULL OR o.fulfillment_status != 'cancelled')
    AND (
      p_time_slot IS NULL
      OR t.time_slot = p_time_slot
    );
$$;

CREATE OR REPLACE FUNCTION public.count_paid_tickets_for_event_slot(
  p_event_id UUID,
  p_time_slot TEXT
)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.tickets t
  JOIN public.orders o ON o.id = t.order_id
  JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
  WHERE tt.event_id = p_event_id
    AND t.time_slot = p_time_slot
    AND t.refunded_at IS NULL
    AND t.status IN ('valid', 'scanned')
    AND o.payment_status IN ('paid', 'submitted')
    AND (o.fulfillment_status IS NULL OR o.fulfillment_status != 'cancelled');
$$;

CREATE OR REPLACE FUNCTION public.get_variant_remaining_counts(p_event_id UUID)
RETURNS TABLE (
  variant_id UUID,
  sold_count BIGINT,
  quota INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id AS variant_id,
    COALESCE((
      SELECT COUNT(*)::BIGINT
      FROM public.tickets t
      JOIN public.order_items oi ON oi.id = t.order_item_id AND oi.ticket_type_access_variant_id = v.id
      WHERE t.ticket_type_id = v.ticket_type_id
        AND t.refunded_at IS NULL
        AND t.status IN ('valid', 'scanned')
        AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = t.order_id
            AND o.event_id = p_event_id
            AND o.payment_status IN ('paid', 'submitted')
            AND (o.fulfillment_status IS NULL OR o.fulfillment_status != 'cancelled')
        )
    ), 0) AS sold_count,
    v.quota
  FROM public.ticket_type_access_variants v
  JOIN public.ticket_types tt ON tt.id = v.ticket_type_id
  WHERE tt.event_id = p_event_id
    AND v.quota IS NOT NULL
    AND v.is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.scan_ticket(p_qr_code TEXT)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  SELECT t.id INTO v_ticket_id
  FROM public.tickets t
  JOIN public.orders o ON o.id = t.order_id
  JOIN public.events e ON e.id = o.event_id
  JOIN public.org_members om ON om.org_id = e.org_id
  WHERE t.qr_code = p_qr_code
    AND t.refunded_at IS NULL
    AND t.status = 'valid'
    AND om.user_id = v_user_id;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Ticket not found, already scanned, refunded, or user does not have access';
  END IF;

  UPDATE public.tickets
  SET status = 'scanned',
      scanned_at = NOW(),
      scanned_by = v_user_id
  WHERE id = v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

-- ============================================================================
-- 4. Effective revenue view (ticket-level refunds for event orders)
-- ============================================================================
CREATE OR REPLACE VIEW public.order_effective_revenue AS
WITH refunded_ticket_amounts AS (
  SELECT
    t.order_id,
    COALESCE(SUM(oi.unit_price), 0)::numeric AS refunded_ticket_total
  FROM public.tickets t
  JOIN public.order_items oi ON oi.id = t.order_item_id
  WHERE t.refunded_at IS NOT NULL
  GROUP BY t.order_id
),
refunded_ticket_addon_amounts AS (
  SELECT
    t.order_id,
    COALESCE(SUM(oai.subtotal), 0)::numeric AS refunded_addon_total
  FROM public.tickets t
  JOIN public.order_addon_items oai ON oai.ticket_id = t.id
  WHERE t.refunded_at IS NOT NULL
  GROUP BY t.order_id
),
active_ticket_counts AS (
  SELECT
    order_id,
    COUNT(*)::bigint AS active_tickets_count
  FROM public.tickets
  WHERE refunded_at IS NULL
  GROUP BY order_id
),
order_level_addon_totals AS (
  SELECT
    order_id,
    COALESCE(SUM(subtotal), 0)::numeric AS order_level_addon_total
  FROM public.order_addon_items
  WHERE ticket_id IS NULL
  GROUP BY order_id
)
SELECT
  o.id AS order_id,
  CASE
    WHEN COALESCE(o.order_type, 'event') = 'product' OR o.event_id IS NULL THEN
      CASE
        WHEN o.payment_status = 'refunded' OR o.status = 'refunded' THEN 0::numeric
        ELSE o.total_amount
      END
    ELSE GREATEST(
      0::numeric,
      o.total_amount
        - COALESCE(rta.refunded_ticket_total, 0)
        - COALESCE(rtaa.refunded_addon_total, 0)
        - CASE
            WHEN COALESCE(atc.active_tickets_count, 0) = 0
            THEN COALESCE(ola.order_level_addon_total, 0)
            ELSE 0::numeric
          END
    )
  END AS effective_amount,
  CASE
    WHEN COALESCE(o.order_type, 'event') = 'product' OR o.event_id IS NULL THEN NULL::bigint
    ELSE COALESCE(atc.active_tickets_count, 0)
  END AS active_tickets_count
FROM public.orders o
LEFT JOIN refunded_ticket_amounts rta ON rta.order_id = o.id
LEFT JOIN refunded_ticket_addon_amounts rtaa ON rtaa.order_id = o.id
LEFT JOIN active_ticket_counts atc ON atc.order_id = o.id
LEFT JOIN order_level_addon_totals ola ON ola.order_id = o.id;

ALTER VIEW public.order_effective_revenue SET (security_invoker = true);

GRANT SELECT ON public.order_effective_revenue TO authenticated;
GRANT SELECT ON public.order_effective_revenue TO anon;

COMMENT ON VIEW public.order_effective_revenue IS
  'Refund-adjusted order revenue and active ticket counts. Event orders deduct refunded ticket prices and linked add-ons; product orders use total_amount unless order-level refunded.';

-- ============================================================================
-- 5. Dashboard stats RPC
-- ============================================================================
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
    SELECT 1 FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = v_user_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH host_orders AS (
    SELECT o.*, oer.effective_amount, oer.active_tickets_count
    FROM public.orders o
    LEFT JOIN public.order_effective_revenue oer ON oer.order_id = o.id
    WHERE o.created_at >= p_start
      AND o.created_at <= p_end
      AND (
        (o.order_type = 'product' AND o.host_org_id = p_org_id)
        OR o.event_id IN (SELECT e.id FROM public.events e WHERE e.org_id = p_org_id)
      )
  ),
  host_stats AS (
    SELECT
      COALESCE(SUM(
        CASE
          WHEN o.payment_status = 'paid' OR o.fulfillment_status = 'confirmed'
          THEN COALESCE(o.effective_amount, o.total_amount)
          ELSE 0::numeric
        END
      ), 0)::numeric AS revenue_total,
      COUNT(*) FILTER (
        WHERE o.payment_status IN ('submitted', 'paid')
          AND (
            COALESCE(o.order_type, 'event') = 'product'
            OR o.event_id IS NULL
            OR COALESCE(o.active_tickets_count, 0) > 0
          )
      ) AS orders_count_submitted_paid,
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
    FROM public.order_addon_items oai
    INNER JOIN host_orders o ON o.id = oai.order_id
    INNER JOIN public.events e ON e.id = o.event_id
    WHERE e.org_id = p_org_id
      AND oai.shipped_at IS NULL
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

-- ============================================================================
-- 6. host_order_cards: exclude refunded tickets from tickets_count
-- ============================================================================
CREATE OR REPLACE VIEW public.host_order_cards AS
SELECT
  o.id AS order_id,
  o.order_no,
  o.fulfillment_status,
  o.confirmed_at,
  o.updated_at,
  o.payment_method,
  o.receipt_url,
  o.metadata,
  o.buyer_first_name,
  o.buyer_last_name,
  o.buyer_phone,
  o.total_amount,
  o.currency,
  o.event_id,
  e.title AS event_title,
  e.start_at AS event_start_at,
  e.location_text AS event_location_text,
  COALESCE(
    e.metadata->>'cover_image_url',
    e.instagram_preview_image_url
  ) AS event_cover_image_url,
  e.org_id,
  COUNT(t.id) FILTER (WHERE t.refunded_at IS NULL) AS tickets_count
FROM public.orders o
INNER JOIN public.events e ON e.id = o.event_id
LEFT JOIN public.tickets t ON t.order_id = o.id
WHERE (
  o.fulfillment_status = 'confirmed'
  OR (o.fulfillment_status = 'pending_confirmation' AND o.payment_status = 'submitted')
)
GROUP BY
  o.id,
  o.order_no,
  o.fulfillment_status,
  o.confirmed_at,
  o.updated_at,
  o.payment_method,
  o.receipt_url,
  o.metadata,
  o.buyer_first_name,
  o.buyer_last_name,
  o.buyer_phone,
  o.total_amount,
  o.currency,
  o.event_id,
  e.title,
  e.start_at,
  e.location_text,
  e.metadata,
  e.instagram_preview_image_url,
  e.org_id

UNION ALL

SELECT
  o.id AS order_id,
  o.order_no,
  o.fulfillment_status,
  o.confirmed_at,
  o.updated_at,
  o.payment_method,
  o.receipt_url,
  o.metadata,
  o.buyer_first_name,
  o.buyer_last_name,
  o.buyer_phone,
  o.total_amount,
  o.currency,
  NULL::UUID AS event_id,
  COALESCE(
    (SELECT oi.metadata->>'product_name'
     FROM public.order_items oi
     WHERE oi.order_id = o.id
       AND (oi.metadata->>'is_product_order') = 'true'
     ORDER BY oi.created_at
     LIMIT 1),
    'Product Order'
  ) AS event_title,
  NULL::TIMESTAMPTZ AS event_start_at,
  NULL::TEXT AS event_location_text,
  (SELECT p.image_url
   FROM public.order_items oi
   JOIN public.products p ON p.id = (oi.metadata->>'product_id')::UUID
   WHERE oi.order_id = o.id
     AND (oi.metadata->>'is_product_order') = 'true'
     AND oi.metadata->>'product_id' IS NOT NULL
   ORDER BY oi.created_at
   LIMIT 1) AS event_cover_image_url,
  o.host_org_id AS org_id,
  COALESCE(
    (SELECT SUM(oi.quantity)::BIGINT
     FROM public.order_items oi
     WHERE oi.order_id = o.id
       AND (oi.metadata->>'is_product_order') = 'true'),
    0::BIGINT
  ) AS tickets_count
FROM public.orders o
WHERE o.order_type = 'product'
  AND o.host_org_id IS NOT NULL
  AND (
    o.fulfillment_status = 'confirmed'
    OR (o.fulfillment_status = 'pending_confirmation' AND o.payment_status = 'submitted')
  );

ALTER VIEW public.host_order_cards SET (security_invoker = true);

-- ============================================================================
-- 7. get_order_with_event_and_tickets: include refunded_at on tickets
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_order_with_event_and_tickets(p_order_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order JSONB;
  v_event JSONB;
  v_order_items JSONB;
  v_order_addon_items JSONB;
  v_tickets JSONB;
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', o.id,
    'event_id', o.event_id,
    'buyer_user_id', o.buyer_user_id,
    'buyer_first_name', o.buyer_first_name,
    'buyer_last_name', o.buyer_last_name,
    'buyer_email', o.buyer_email,
    'buyer_phone', o.buyer_phone,
    'total_amount', o.total_amount,
    'currency', o.currency,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status,
    'order_no', o.order_no,
    'metadata', COALESCE(o.metadata, '{}'::jsonb),
    'receipt_url', o.receipt_url,
    'payment_reference_link', o.payment_reference_link,
    'submitted_at', o.submitted_at,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  ) INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF (v_order->>'event_id') IS NULL OR (v_order->>'event_id') = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'start_at', e.start_at,
    'end_at', e.end_at,
    'day_2_start_at', e.day_2_start_at,
    'day_2_end_at', e.day_2_end_at,
    'day_3_start_at', e.day_3_start_at,
    'day_3_end_at', e.day_3_end_at,
    'day_4_start_at', e.day_4_start_at,
    'day_4_end_at', e.day_4_end_at,
    'location_text', e.location_text,
    'enable_stripe', e.enable_stripe,
    'enable_payme', e.enable_payme,
    'enable_fps', e.enable_fps,
    'payme_link', e.payme_link,
    'fps_link', e.fps_link,
    'stripe_fee_bearer', COALESCE(e.stripe_fee_bearer, 'host'),
    'org_id', e.org_id
  ) INTO v_event
  FROM public.events e
  WHERE e.id = (v_order->>'event_id')::UUID
  AND (
    e.status = 'published'
    OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = e.org_id AND om.user_id = auth.uid())
    OR (SELECT created_at FROM public.orders WHERE id = p_order_id) > NOW() - INTERVAL '1 hour'
    OR public.collab_can_access_order(p_order_id, 'viewer', true)
  );

  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'ticket_type_id', oi.ticket_type_id,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'metadata', COALESCE(oi.metadata, '{}'::jsonb),
      'ticket_type_access_variant_id', oi.ticket_type_access_variant_id,
      'access_variant', CASE WHEN ttv.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ttv.id,
        'visibility_mode', ttv.visibility_mode,
        'access_code', ttv.access_code,
        'price_override', ttv.price_override,
        'discount_percent', ttv.discount_percent
      ) END,
      'ticket_type', CASE WHEN tt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', tt.id,
        'name', tt.name,
        'valid_for_days', tt.valid_for_days
      ) END
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb) INTO v_order_items
  FROM public.order_items oi
  LEFT JOIN public.ticket_types tt ON tt.id = oi.ticket_type_id
  LEFT JOIN public.ticket_type_access_variants ttv ON ttv.id = oi.ticket_type_access_variant_id
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oai.id,
      'product_id', oai.product_id,
      'product_variant_id', oai.product_variant_id,
      'quantity', oai.quantity,
      'unit_price', oai.unit_price,
      'subtotal', oai.subtotal,
      'label', oai.label,
      'variant_label', oai.variant_label,
      'ticket_id', oai.ticket_id,
      'shipped_at', oai.shipped_at,
      'carrier_tracking_number', oai.carrier_tracking_number
    )
    ORDER BY oai.created_at
  ), '[]'::jsonb) INTO v_order_addon_items
  FROM public.order_addon_items oai
  WHERE oai.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'ticket_type_id', t.ticket_type_id,
      'time_slot', t.time_slot,
      'qr_code', t.qr_code,
      'status', t.status,
      'refunded_at', t.refunded_at,
      'first_name', t.first_name,
      'last_name', t.last_name,
      'email', t.email,
      'phone', t.phone,
      'ticket_type', CASE WHEN tt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', tt.id,
        'name', tt.name,
        'valid_for_days', tt.valid_for_days
      ) END
    )
    ORDER BY t.created_at
  ), '[]'::jsonb) INTO v_tickets
  FROM public.tickets t
  LEFT JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
  WHERE t.order_id = p_order_id;

  v_result := jsonb_build_object(
    'order', v_order,
    'event', v_event,
    'order_items', v_order_items,
    'order_addon_items', v_order_addon_items,
    'tickets', v_tickets
  );

  RETURN v_result;
END;
$$;
