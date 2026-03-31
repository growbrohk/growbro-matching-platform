-- Collab Product/Event pipeline type: same partner/commission/dates as affiliate, plus collab visibility flags.

-- ============================================================================
-- 1. TYPE CHECK: add collab
-- ============================================================================
ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_type_check;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_type_check
  CHECK (type IN ('tracking', 'affiliate', 'collab'));

-- ============================================================================
-- 2. Partner pipeline fields: affiliate + collab share commission + dates
-- ============================================================================
ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_affiliate_fields_check;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_partner_pipeline_fields_check
  CHECK (
    type NOT IN ('affiliate', 'collab') OR (
      affiliate_org_id IS NOT NULL
      AND commission_rate IS NOT NULL
      AND start_date IS NOT NULL
      AND end_date IS NOT NULL
    )
  );

-- ============================================================================
-- 3. Collab-only columns
-- ============================================================================
ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS collab_sales_scope TEXT,
  ADD COLUMN IF NOT EXISTS collab_partner_role TEXT,
  ADD COLUMN IF NOT EXISTS collab_can_view_order_details BOOLEAN;

ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_collab_fields_check;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_collab_fields_check
  CHECK (
    (type <> 'collab' AND collab_sales_scope IS NULL AND collab_partner_role IS NULL AND collab_can_view_order_details IS NULL)
    OR (
      type = 'collab'
      AND collab_sales_scope IS NOT NULL
      AND collab_sales_scope IN ('attributed', 'all_for_resource')
      AND collab_partner_role IS NOT NULL
      AND collab_partner_role IN ('viewer', 'editor')
      AND collab_can_view_order_details IS NOT NULL
    )
  );

ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_collab_all_for_resource_destination_check;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_collab_all_for_resource_destination_check
  CHECK (
    type <> 'collab'
    OR collab_sales_scope <> 'all_for_resource'
    OR product_id IS NOT NULL
    OR event_id IS NOT NULL
  );

COMMENT ON COLUMN public.tracking_links.collab_sales_scope IS 'collab only: attributed | all_for_resource';
COMMENT ON COLUMN public.tracking_links.collab_partner_role IS 'collab only: viewer | editor';
COMMENT ON COLUMN public.tracking_links.collab_can_view_order_details IS 'collab only: partner may open host order detail';

DROP INDEX IF EXISTS idx_tracking_links_affiliate_period;
CREATE INDEX IF NOT EXISTS idx_tracking_links_partner_period
  ON public.tracking_links (start_date, end_date)
  WHERE type IN ('affiliate', 'collab');

-- 4. Expiry
CREATE OR REPLACE FUNCTION public.check_expired_affiliate_links()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.tracking_links
  SET status = 'inactive'
  WHERE type IN ('affiliate', 'collab')
    AND status = 'active'
    AND end_date IS NOT NULL
    AND end_date < now();
END;
$$;

-- 5. Helper
CREATE OR REPLACE FUNCTION public.collab_can_access_order(
  p_order_id uuid,
  p_min_role text,
  p_require_details boolean
)
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
    INNER JOIN public.org_members om
      ON om.org_id = tl.affiliate_org_id
      AND om.user_id = auth.uid()
    WHERE o.id = p_order_id
      AND (
        p_require_details = false
        OR tl.collab_can_view_order_details = true
      )
      AND (
        p_min_role = 'viewer'
        OR (p_min_role = 'editor' AND tl.collab_partner_role = 'editor')
      )
      AND (
        (
          tl.collab_sales_scope = 'attributed'
          AND o.tracking_link_id IS NOT NULL
          AND o.tracking_link_id = tl.id
        )
        OR (
          tl.collab_sales_scope = 'all_for_resource'
          AND (
            (
              tl.event_id IS NOT NULL
              AND o.event_id IS NOT NULL
              AND o.event_id = tl.event_id
            )
            OR (
              tl.product_id IS NOT NULL
              AND o.host_org_id IS NOT NULL
              AND o.host_org_id = tl.host_org_id
              AND o.order_type = 'product'
              AND EXISTS (
                SELECT 1
                FROM public.order_items oi
                WHERE oi.order_id = o.id
                  AND (oi.metadata->>'product_id') IS NOT NULL
                  AND (oi.metadata->>'product_id') = tl.product_id::text
              )
            )
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.collab_can_access_order(uuid, text, boolean) TO authenticated;

CREATE POLICY "Collab partners can view eligible orders"
  ON public.orders
  FOR SELECT
  USING (public.collab_can_access_order(id, 'viewer', false));

DROP POLICY IF EXISTS "Users can view order items for their orders or events in their orgs" ON public.order_items;

CREATE POLICY "Users can view order items for their orders or events in their orgs"
  ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
      AND (
        (o.buyer_user_id IS NOT NULL AND o.buyer_user_id = auth.uid())
        OR
        (
          o.buyer_user_id IS NULL
          AND o.buyer_email IS NOT NULL
          AND (auth.jwt() ->> 'email') IS NOT NULL
          AND o.buyer_email = (auth.jwt() ->> 'email')
        )
        OR
        (o.created_at > NOW() - INTERVAL '1 hour')
        OR
        EXISTS (
          SELECT 1 FROM public.events e
          JOIN public.org_members om ON om.org_id = e.org_id
          WHERE e.id = o.event_id
          AND om.user_id = auth.uid()
        )
        OR
        (o.host_org_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.org_members om
          WHERE om.org_id = o.host_org_id
          AND om.user_id = auth.uid()
        ))
        OR public.collab_can_access_order(o.id, 'viewer', false)
      )
    )
  );

CREATE POLICY "Collab partners can view linked events"
  ON public.events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id IS NOT NULL
        AND tl.event_id = events.id
    )
  );

CREATE POLICY "Collab partners can view linked products"
  ON public.products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.product_id IS NOT NULL
        AND tl.product_id = products.id
    )
  );

CREATE OR REPLACE FUNCTION public.update_order_fulfillment(
  p_order_id UUID,
  p_fulfillment_status TEXT,
  p_confirmed_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id UUID;
  v_host_member BOOLEAN;
  v_collab_editor BOOLEAN;
BEGIN
  SELECT COALESCE(e.org_id, o.host_org_id) INTO v_org_id
  FROM public.orders o
  LEFT JOIN public.events e ON e.id = o.event_id
  WHERE o.id = p_order_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Order or event not found';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = v_org_id
    AND om.user_id = auth.uid()
  ) INTO v_host_member;

  SELECT public.collab_can_access_order(p_order_id, 'editor', false) INTO v_collab_editor;

  IF NOT v_host_member AND NOT v_collab_editor THEN
      RAISE EXCEPTION 'User is not allowed to update fulfillment for this order';
  END IF;

  IF p_fulfillment_status NOT IN ('pending_confirmation', 'confirmed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid fulfillment_status: %', p_fulfillment_status;
  END IF;

  IF p_fulfillment_status = 'confirmed' THEN
    UPDATE public.orders
    SET 
      fulfillment_status = p_fulfillment_status,
      confirmed_at = p_confirmed_at,
      payment_status = CASE 
        WHEN payment_status != 'paid' THEN 'paid'
        ELSE payment_status
      END,
      paid_at = CASE 
        WHEN paid_at IS NULL AND payment_status != 'paid' THEN p_confirmed_at
        ELSE paid_at
      END,
      updated_at = NOW()
    WHERE id = p_order_id;
  ELSE
    UPDATE public.orders
    SET 
      fulfillment_status = p_fulfillment_status,
      updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.update_order_fulfillment IS 
  'Updates order fulfillment. Host org members or collab partners with editor role may confirm.';

-- ============================================================================
-- 10. Tickets: collab partners can view tickets for orders they can access
-- ============================================================================
CREATE POLICY "Collab partners can view tickets for eligible orders"
  ON public.tickets
  FOR SELECT
  USING (public.collab_can_access_order(tickets.order_id, 'viewer', false));
