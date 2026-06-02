-- Event add-on per-line dispatch: shipped_at + carrier tracking on order_addon_items.

ALTER TABLE public.order_addon_items
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carrier_tracking_number TEXT;

COMMENT ON COLUMN public.order_addon_items.shipped_at IS
  'Host/collab: marked sent after payment confirmed; per add-on line on event orders.';
COMMENT ON COLUMN public.order_addon_items.carrier_tracking_number IS
  'Carrier / consignment reference after payment confirmed; per add-on line on event orders.';

CREATE OR REPLACE FUNCTION public.collab_can_mark_addon_item_shipped(p_addon_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_addon_items oai
    INNER JOIN public.orders o ON o.id = oai.order_id
    INNER JOIN public.tracking_links tl
      ON tl.type = 'collab'
      AND tl.status = 'active'
      AND tl.affiliate_org_id IS NOT NULL
      AND tl.product_id IS NOT NULL
      AND tl.product_id = oai.product_id
      AND tl.collab_partner_role = 'editor'
      AND tl.collab_can_mark_shipped = true
    INNER JOIN public.org_members om
      ON om.org_id = tl.affiliate_org_id
      AND om.user_id = auth.uid()
    WHERE oai.id = p_addon_item_id
      AND o.order_type = 'event'
      AND (
        (
          tl.collab_sales_scope = 'attributed'
          AND o.tracking_link_id IS NOT NULL
          AND o.tracking_link_id = tl.id
        )
        OR (
          tl.collab_sales_scope = 'all_for_resource'
          AND o.host_org_id IS NOT NULL
          AND o.host_org_id = tl.host_org_id
        )
      )
  );
$$;

COMMENT ON FUNCTION public.collab_can_mark_addon_item_shipped(uuid) IS
  'Whether current user may update event add-on line dispatch via set_addon_item_* RPCs.';

GRANT EXECUTE ON FUNCTION public.collab_can_mark_addon_item_shipped(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_addon_item_shipped(
  p_addon_item_id uuid,
  p_shipped boolean
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id uuid;
  v_host_member boolean;
  v_payment_ok boolean;
  v_order_type text;
BEGIN
  SELECT
    e.org_id,
    (COALESCE(o.payment_status, '') = 'paid' OR COALESCE(o.fulfillment_status, '') = 'confirmed'),
    o.order_type
  INTO v_org_id, v_payment_ok, v_order_type
  FROM public.order_addon_items oai
  INNER JOIN public.orders o ON o.id = oai.order_id
  LEFT JOIN public.events e ON e.id = o.event_id
  WHERE oai.id = p_addon_item_id;

  IF v_org_id IS NULL AND v_order_type IS NULL THEN
    RAISE EXCEPTION 'Add-on line not found';
  END IF;

  IF v_order_type IS DISTINCT FROM 'event' THEN
    RAISE EXCEPTION 'Add-on dispatch updates apply to event orders only';
  END IF;

  IF NOT v_payment_ok THEN
    RAISE EXCEPTION 'Payment must be confirmed before updating dispatch';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = v_org_id
      AND om.user_id = auth.uid()
  ) INTO v_host_member;

  IF NOT v_host_member AND NOT public.collab_can_mark_addon_item_shipped(p_addon_item_id) THEN
    RAISE EXCEPTION 'User is not allowed to update dispatch for this add-on line';
  END IF;

  UPDATE public.order_addon_items
  SET
    shipped_at = CASE WHEN p_shipped THEN NOW() ELSE NULL END
  WHERE id = p_addon_item_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.set_addon_item_shipped(uuid, boolean) IS
  'Sets event add-on line shipped_at after payment confirmed; host org or collab with collab_can_mark_shipped.';

GRANT EXECUTE ON FUNCTION public.set_addon_item_shipped(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_addon_item_carrier_tracking(
  p_addon_item_id uuid,
  p_carrier_tracking_number text
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id uuid;
  v_host_member boolean;
  v_payment_ok boolean;
  v_order_type text;
  v_normalized text;
BEGIN
  SELECT
    e.org_id,
    (COALESCE(o.payment_status, '') = 'paid' OR COALESCE(o.fulfillment_status, '') = 'confirmed'),
    o.order_type
  INTO v_org_id, v_payment_ok, v_order_type
  FROM public.order_addon_items oai
  INNER JOIN public.orders o ON o.id = oai.order_id
  LEFT JOIN public.events e ON e.id = o.event_id
  WHERE oai.id = p_addon_item_id;

  IF v_org_id IS NULL AND v_order_type IS NULL THEN
    RAISE EXCEPTION 'Add-on line not found';
  END IF;

  IF v_order_type IS DISTINCT FROM 'event' THEN
    RAISE EXCEPTION 'Add-on dispatch updates apply to event orders only';
  END IF;

  IF NOT v_payment_ok THEN
    RAISE EXCEPTION 'Payment must be confirmed before updating dispatch';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = v_org_id
      AND om.user_id = auth.uid()
  ) INTO v_host_member;

  IF NOT v_host_member AND NOT public.collab_can_mark_addon_item_shipped(p_addon_item_id) THEN
    RAISE EXCEPTION 'User is not allowed to update dispatch for this add-on line';
  END IF;

  v_normalized := NULLIF(TRIM(COALESCE(p_carrier_tracking_number, '')), '');

  UPDATE public.order_addon_items
  SET carrier_tracking_number = v_normalized
  WHERE id = p_addon_item_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.set_addon_item_carrier_tracking(uuid, text) IS
  'Sets event add-on line carrier_tracking_number after payment confirmed; host org or collab with collab_can_mark_shipped.';

GRANT EXECUTE ON FUNCTION public.set_addon_item_carrier_tracking(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION get_order_with_event_and_tickets(p_order_id UUID)
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
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
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
  FROM orders o
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
    'location_text', e.location_text,
    'enable_stripe', e.enable_stripe,
    'enable_payme', e.enable_payme,
    'enable_fps', e.enable_fps,
    'payme_link', e.payme_link,
    'fps_link', e.fps_link,
    'org_id', e.org_id
  ) INTO v_event
  FROM events e
  WHERE e.id = (v_order->>'event_id')::UUID
  AND (
    e.status = 'published'
    OR EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = e.org_id AND om.user_id = auth.uid())
    OR (SELECT created_at FROM orders WHERE id = p_order_id) > NOW() - INTERVAL '1 hour'
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
  FROM order_items oi
  LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
  LEFT JOIN ticket_type_access_variants ttv ON ttv.id = oi.ticket_type_access_variant_id
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
  FROM order_addon_items oai
  WHERE oai.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'ticket_type_id', t.ticket_type_id,
      'qr_code', t.qr_code,
      'status', t.status,
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
  FROM tickets t
  LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
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

COMMENT ON FUNCTION get_order_with_event_and_tickets IS
  'Returns event order with tickets, add-on lines (incl. dispatch fields), and collab-aware event access.';
