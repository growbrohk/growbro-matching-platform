-- Enquiries Phase 2: paginated host order list (replaces host_order_cards read for feed)
-- Keyset paging on (updated_at, id); aggregates only for the page of order ids.

CREATE INDEX IF NOT EXISTS idx_orders_host_org_updated_at
  ON public.orders (host_org_id, updated_at DESC)
  WHERE host_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_event_updated_at
  ON public.orders (event_id, updated_at DESC)
  WHERE event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_host_order_list(
  p_org_id uuid,
  p_limit int DEFAULT 30,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  order_no text,
  fulfillment_status text,
  confirmed_at timestamptz,
  updated_at timestamptz,
  payment_method text,
  receipt_url text,
  metadata jsonb,
  buyer_first_name text,
  buyer_last_name text,
  buyer_phone text,
  total_amount numeric,
  currency text,
  event_id uuid,
  event_title text,
  event_start_at timestamptz,
  event_location_text text,
  event_cover_image_url text,
  org_id uuid,
  tickets_count bigint
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit int;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN;
  END IF;

  v_limit := GREATEST(COALESCE(p_limit, 30), 1);

  RETURN QUERY
  WITH eligible AS (
    SELECT o.id, o.updated_at
    FROM public.orders o
    INNER JOIN public.events e ON e.id = o.event_id
    WHERE e.org_id = p_org_id
      AND (
        o.fulfillment_status = 'confirmed'
        OR (o.fulfillment_status = 'pending_confirmation' AND o.payment_status = 'submitted')
      )
    UNION ALL
    SELECT o.id, o.updated_at
    FROM public.orders o
    WHERE o.order_type = 'product'
      AND o.host_org_id = p_org_id
      AND (
        o.fulfillment_status = 'confirmed'
        OR (o.fulfillment_status = 'pending_confirmation' AND o.payment_status = 'submitted')
      )
  ),
  page AS (
    SELECT e.id, e.updated_at
    FROM eligible e
    WHERE p_cursor_updated_at IS NULL
       OR (e.updated_at, e.id) < (p_cursor_updated_at, p_cursor_order_id)
    ORDER BY e.updated_at DESC, e.id DESC
    LIMIT v_limit
  )
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
    CASE
      WHEN o.event_id IS NOT NULL THEN e.title
      ELSE COALESCE(prod_name.line_title, 'Product Order')
    END AS event_title,
    e.start_at AS event_start_at,
    e.location_text AS event_location_text,
    CASE
      WHEN o.event_id IS NOT NULL THEN COALESCE(
        e.metadata->>'cover_image_url',
        e.instagram_preview_image_url
      )
      ELSE prod_img.image_url
    END AS event_cover_image_url,
    COALESCE(e.org_id, o.host_org_id) AS org_id,
    CASE
      WHEN o.event_id IS NOT NULL THEN COALESCE(ticket_cnt.cnt, 0::bigint)
      ELSE COALESCE(prod_qty.qty, 0::bigint)
    END AS tickets_count
  FROM page pg
  INNER JOIN public.orders o ON o.id = pg.id
  LEFT JOIN public.events e ON e.id = o.event_id
  LEFT JOIN LATERAL (
    SELECT COUNT(t.id) FILTER (WHERE t.refunded_at IS NULL)::bigint AS cnt
    FROM public.tickets t
    WHERE t.order_id = o.id
  ) ticket_cnt ON o.event_id IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      oi.metadata->>'product_name',
      'Product Order'
    ) AS line_title
    FROM public.order_items oi
    WHERE oi.order_id = o.id
      AND (oi.metadata->>'is_product_order') = 'true'
    ORDER BY oi.created_at
    LIMIT 1
  ) prod_name ON o.order_type = 'product'
  LEFT JOIN LATERAL (
    SELECT p.image_url
    FROM public.order_items oi
    JOIN public.products p ON p.id = (oi.metadata->>'product_id')::uuid
    WHERE oi.order_id = o.id
      AND (oi.metadata->>'is_product_order') = 'true'
      AND oi.metadata->>'product_id' IS NOT NULL
    ORDER BY oi.created_at
    LIMIT 1
  ) prod_img ON o.order_type = 'product'
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(oi.quantity), 0)::bigint AS qty
    FROM public.order_items oi
    WHERE oi.order_id = o.id
      AND (oi.metadata->>'is_product_order') = 'true'
  ) prod_qty ON o.order_type = 'product'
  ORDER BY pg.updated_at DESC, pg.id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_host_order_list(uuid, int, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_host_order_list(uuid, int, timestamptz, uuid) IS
  'Paginated host order cards for Enquiries feed. Keyset cursor on (updated_at, order_id).';
