-- Migration: Extend host_order_cards to include product orders
-- Product orders (event_id NULL, host_org_id set) should appear in Enquiries and Pending Orders
-- like event orders when payment_status = 'submitted' (receipt uploaded)

CREATE OR REPLACE VIEW public.host_order_cards AS
-- Event orders (existing logic)
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
  COUNT(t.id) AS tickets_count
FROM orders o
INNER JOIN events e ON e.id = o.event_id
LEFT JOIN tickets t ON t.order_id = o.id
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

-- Product orders (host_org_id, no event)
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
     FROM order_items oi
     WHERE oi.order_id = o.id
       AND (oi.metadata->>'is_product_order') = 'true'
     ORDER BY oi.created_at
     LIMIT 1),
    'Product Order'
  ) AS event_title,
  NULL::TIMESTAMPTZ AS event_start_at,
  NULL::TEXT AS event_location_text,
  (SELECT p.image_url
   FROM order_items oi
   JOIN products p ON p.id = (oi.metadata->>'product_id')::UUID
   WHERE oi.order_id = o.id
     AND (oi.metadata->>'is_product_order') = 'true'
     AND oi.metadata->>'product_id' IS NOT NULL
   ORDER BY oi.created_at
   LIMIT 1) AS event_cover_image_url,
  o.host_org_id AS org_id,
  COALESCE(
    (SELECT SUM(oi.quantity)::BIGINT
     FROM order_items oi
     WHERE oi.order_id = o.id
       AND (oi.metadata->>'is_product_order') = 'true'),
    0::BIGINT
  ) AS tickets_count
FROM orders o
WHERE o.order_type = 'product'
  AND o.host_org_id IS NOT NULL
  AND (
    o.fulfillment_status = 'confirmed'
    OR (o.fulfillment_status = 'pending_confirmation' AND o.payment_status = 'submitted')
  );

COMMENT ON VIEW public.host_order_cards IS 'View for hosts to see order cards (event + product). Includes orders that are confirmed OR pending confirmation with receipt uploaded.';

-- ============================================================================
-- UPDATE update_order_fulfillment TO SUPPORT PRODUCT ORDERS
-- ============================================================================
-- Hosts must be able to confirm product orders (host_org_id) as well as event orders

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
  v_user_org_membership BOOLEAN;
BEGIN
  -- Get org_id: from event (event orders) or host_org_id (product orders)
  SELECT COALESCE(e.org_id, o.host_org_id) INTO v_org_id
  FROM orders o
  LEFT JOIN events e ON e.id = o.event_id
  WHERE o.id = p_order_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Order or event not found';
  END IF;

  -- Check if user is a member of the org
  SELECT EXISTS(
    SELECT 1 FROM org_members om
    WHERE om.org_id = v_org_id
    AND om.user_id = auth.uid()
  ) INTO v_user_org_membership;

  IF NOT v_user_org_membership THEN
    RAISE EXCEPTION 'User is not a member of the organization that owns this order';
  END IF;

  -- Validate fulfillment_status
  IF p_fulfillment_status NOT IN ('pending_confirmation', 'confirmed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid fulfillment_status: %', p_fulfillment_status;
  END IF;

  IF p_fulfillment_status = 'confirmed' THEN
    UPDATE orders
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
    UPDATE orders
    SET 
      fulfillment_status = p_fulfillment_status,
      updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.update_order_fulfillment IS 
  'Safely updates order fulfillment_status and confirmed_at. Supports event orders (via events.org_id) and product orders (via host_org_id).';
