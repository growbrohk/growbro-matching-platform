-- Migration: Filter host_order_cards view by order stage
--
-- Only include orders that should appear in enquiries & tickets:
-- - fulfillment_status = 'confirmed' (paid tickets after confirmation, free tickets)
-- - OR (fulfillment_status = 'pending_confirmation' AND payment_status = 'submitted') (receipt uploaded, awaiting host)
--
-- Exclude: orders created without payment receipt (unpaid, pending_confirmation), cancelled orders

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
  e.org_id;

COMMENT ON VIEW public.host_order_cards IS 'View for hosts to see order cards with event and ticket information. Only includes orders that are confirmed OR pending confirmation with receipt uploaded (excludes unpaid orders without receipt, cancelled orders).';
