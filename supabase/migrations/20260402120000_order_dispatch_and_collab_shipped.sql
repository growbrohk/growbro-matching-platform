-- Product order dispatch: shipped_at, carrier tracking; collab can_mark_shipped on tracking_links.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carrier_tracking_number TEXT;

COMMENT ON COLUMN public.orders.shipped_at IS 'Host/collab: marked sent after payment confirmed; product orders.';
COMMENT ON COLUMN public.orders.carrier_tracking_number IS 'Carrier / consignment reference after payment confirmed; product orders.';

ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS collab_can_mark_shipped BOOLEAN;

UPDATE public.tracking_links
SET collab_can_mark_shipped = false
WHERE type = 'collab' AND collab_can_mark_shipped IS NULL;

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
    )
    OR (
      type = 'collab'
      AND collab_sales_scope IS NOT NULL
      AND collab_sales_scope IN ('attributed', 'all_for_resource')
      AND collab_partner_role IS NOT NULL
      AND collab_partner_role IN ('viewer', 'editor')
      AND collab_can_view_order_details IS NOT NULL
      AND collab_can_mark_shipped IS NOT NULL
    )
  );

COMMENT ON COLUMN public.tracking_links.collab_can_mark_shipped IS
  'collab only; editor partners may update dispatch (shipped + tracking) when true, only after payment confirmed on the order.';

CREATE OR REPLACE FUNCTION public.collab_can_mark_order_shipped(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    INNER JOIN public.tracking_links tl
      ON tl.type = 'collab'
      AND tl.status = 'active'
      AND tl.affiliate_org_id IS NOT NULL
      AND tl.collab_partner_role = 'editor'
      AND tl.collab_can_mark_shipped = true
    INNER JOIN public.org_members om
      ON om.org_id = tl.affiliate_org_id
      AND om.user_id = auth.uid()
    WHERE o.id = p_order_id
      AND o.order_type = 'product'
      AND (
        (
          tl.collab_sales_scope = 'attributed'
          AND o.tracking_link_id IS NOT NULL
          AND o.tracking_link_id = tl.id
        )
        OR (
          tl.collab_sales_scope = 'all_for_resource'
          AND tl.product_id IS NOT NULL
          AND o.host_org_id IS NOT NULL
          AND o.host_org_id = tl.host_org_id
          AND EXISTS (
            SELECT 1
            FROM public.order_items oi
            WHERE oi.order_id = o.id
              AND (oi.metadata->>'product_id') IS NOT NULL
              AND (oi.metadata->>'product_id') = tl.product_id::text
          )
        )
        OR (
          tl.collab_sales_scope = 'all_for_resource'
          AND tl.event_id IS NOT NULL
          AND o.event_id IS NOT NULL
          AND o.event_id = tl.event_id
        )
      )
  );
$$;

COMMENT ON FUNCTION public.collab_can_mark_order_shipped(uuid) IS
  'Whether current user may update product order dispatch via set_order_shipped / set_order_carrier_tracking (collab editor + link flag).';

GRANT EXECUTE ON FUNCTION public.collab_can_mark_order_shipped(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_order_shipped(
  p_order_id uuid,
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
    COALESCE(e.org_id, o.host_org_id),
    (COALESCE(o.payment_status, '') = 'paid' OR COALESCE(o.fulfillment_status, '') = 'confirmed'),
    o.order_type
  INTO v_org_id, v_payment_ok, v_order_type
  FROM public.orders o
  LEFT JOIN public.events e ON e.id = o.event_id
  WHERE o.id = p_order_id;

  IF v_org_id IS NULL AND v_order_type IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_type IS DISTINCT FROM 'product' THEN
    RAISE EXCEPTION 'Dispatch updates apply to product orders only';
  END IF;

  IF NOT v_payment_ok THEN
    RAISE EXCEPTION 'Payment must be confirmed before updating dispatch';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = v_org_id
      AND om.user_id = auth.uid()
  ) INTO v_host_member;

  IF NOT v_host_member AND NOT public.collab_can_mark_order_shipped(p_order_id) THEN
    RAISE EXCEPTION 'User is not allowed to update dispatch for this order';
  END IF;

  UPDATE public.orders
  SET
    shipped_at = CASE WHEN p_shipped THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.set_order_shipped(uuid, boolean) IS
  'Sets product order shipped_at after payment confirmed; host org or collab with collab_can_mark_shipped.';

GRANT EXECUTE ON FUNCTION public.set_order_shipped(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_order_carrier_tracking(
  p_order_id uuid,
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
    COALESCE(e.org_id, o.host_org_id),
    (COALESCE(o.payment_status, '') = 'paid' OR COALESCE(o.fulfillment_status, '') = 'confirmed'),
    o.order_type
  INTO v_org_id, v_payment_ok, v_order_type
  FROM public.orders o
  LEFT JOIN public.events e ON e.id = o.event_id
  WHERE o.id = p_order_id;

  IF v_org_id IS NULL AND v_order_type IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_type IS DISTINCT FROM 'product' THEN
    RAISE EXCEPTION 'Dispatch updates apply to product orders only';
  END IF;

  IF NOT v_payment_ok THEN
    RAISE EXCEPTION 'Payment must be confirmed before updating dispatch';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = v_org_id
      AND om.user_id = auth.uid()
  ) INTO v_host_member;

  IF NOT v_host_member AND NOT public.collab_can_mark_order_shipped(p_order_id) THEN
    RAISE EXCEPTION 'User is not allowed to update dispatch for this order';
  END IF;

  v_normalized := NULLIF(TRIM(COALESCE(p_carrier_tracking_number, '')), '');

  UPDATE public.orders
  SET
    carrier_tracking_number = v_normalized,
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.set_order_carrier_tracking(uuid, text) IS
  'Sets product order carrier_tracking_number after payment confirmed; host org or collab with collab_can_mark_shipped.';

GRANT EXECUTE ON FUNCTION public.set_order_carrier_tracking(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION get_order_with_org_and_products(p_order_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order JSONB;
  v_org JSONB;
  v_order_items JSONB;
  v_result JSONB;
  v_org_id UUID;
  v_ok BOOLEAN;
BEGIN
  SELECT o.host_org_id INTO v_org_id
  FROM orders o
  WHERE o.id = p_order_id AND o.order_type = 'product';

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT
      EXISTS (
        SELECT 1 FROM org_members om
        WHERE om.org_id = v_org_id AND om.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = p_order_id
        AND o.buyer_user_id IS NOT NULL
        AND o.buyer_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = p_order_id
        AND o.buyer_user_id IS NULL
        AND o.buyer_email IS NOT NULL
        AND (auth.jwt() ->> 'email') IS NOT NULL
        AND o.buyer_email = (auth.jwt() ->> 'email')
      )
      OR EXISTS (SELECT 1 FROM orders o WHERE o.id = p_order_id AND o.created_at > NOW() - INTERVAL '1 hour')
      OR public.collab_can_access_order(p_order_id, 'viewer', true)
    INTO v_ok;

    IF NOT v_ok THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'id', o.id,
    'order_type', o.order_type,
    'host_org_id', o.host_org_id,
    'buyer_user_id', o.buyer_user_id,
    'buyer_first_name', o.buyer_first_name,
    'buyer_last_name', o.buyer_last_name,
    'buyer_email', o.buyer_email,
    'buyer_phone', o.buyer_phone,
    'total_amount', o.total_amount,
    'currency', o.currency,
    'order_no', o.order_no,
    'status', o.status,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'fulfillment_status', o.fulfillment_status,
    'receipt_url', o.receipt_url,
    'submitted_at', o.submitted_at,
    'paid_at', o.paid_at,
    'created_at', o.created_at,
    'shipped_at', o.shipped_at,
    'carrier_tracking_number', o.carrier_tracking_number,
    'metadata', COALESCE(o.metadata, '{}'::jsonb)
  ) INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    'enable_stripe', COALESCE(op.enable_stripe, false),
    'enable_payme', COALESCE(op.enable_payme, false),
    'enable_fps', COALESCE(op.enable_fps, false),
    'payme_link', op.payme_link,
    'fps_link', op.fps_link
  ) INTO v_org
  FROM orgs o
  LEFT JOIN org_profiles op ON op.org_id = o.id
  WHERE o.id = v_org_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'metadata', COALESCE(oi.metadata, '{}'::jsonb),
      'product_name', COALESCE(oi.metadata->>'product_name', 'Item'),
      'variant_label', oi.metadata->>'variant_label',
      'product_access_variant', CASE
        WHEN pav.id IS NOT NULL THEN jsonb_build_object(
          'id', pav.id,
          'visibility_mode', pav.visibility_mode,
          'access_code', pav.access_code,
          'price_override', pav.price_override,
          'discount_percent', pav.discount_percent
        )
        ELSE NULL
      END
    )
  ), '[]'::jsonb) INTO v_order_items
  FROM order_items oi
  LEFT JOIN product_access_variants pav ON pav.id = oi.product_access_variant_id
  WHERE oi.order_id = p_order_id;

  v_result := jsonb_build_object(
    'order', v_order,
    'org', v_org,
    'order_items', v_order_items
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_order_with_org_and_products IS 'Returns product order with org, order_items, dispatch fields, and optional product_access_variant per line.';

GRANT EXECUTE ON FUNCTION get_order_with_org_and_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_order_with_org_and_products TO anon;
