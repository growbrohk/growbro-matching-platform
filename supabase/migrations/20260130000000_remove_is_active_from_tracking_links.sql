-- Migration: Remove is_active column from tracking_links table
-- Use status ('pending' | 'active' | 'inactive') as the ONLY source of truth
-- This migration removes the redundant is_active boolean column

-- ============================================================================
-- 1. UPDATE RLS POLICIES TO USE status INSTEAD OF is_active
-- ============================================================================

-- Drop existing policies that use is_active
DROP POLICY IF EXISTS "public can resolve active tracking links" ON public.tracking_links;
DROP POLICY IF EXISTS "authed can resolve active tracking links" ON public.tracking_links;

-- Recreate policies using status instead
CREATE POLICY "public can resolve active tracking links"
ON public.tracking_links
FOR SELECT
TO anon
USING (status = 'active');

CREATE POLICY "authed can resolve active tracking links"
ON public.tracking_links
FOR SELECT
TO authenticated
USING (status = 'active');

-- ============================================================================
-- 2. UPDATE create_event_booking FUNCTION
-- ============================================================================

-- Drop and recreate function to use status instead of is_active
DROP FUNCTION IF EXISTS create_event_booking(uuid, jsonb, uuid, text, text, text, text, text, jsonb, uuid) CASCADE;

CREATE OR REPLACE FUNCTION create_event_booking(
  p_event_id UUID,
  p_order_lines JSONB,
  p_buyer_user_id UUID DEFAULT NULL,
  p_buyer_first_name TEXT DEFAULT NULL,
  p_buyer_last_name TEXT DEFAULT NULL,
  p_buyer_email TEXT DEFAULT NULL,
  p_buyer_phone TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'HKD',
  p_attendees JSONB DEFAULT NULL,
  p_tracking_link_id UUID DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_item_id UUID;
  v_ticket_id UUID;
  v_line JSONB;
  v_attendee JSONB;
  v_qr_code TEXT;
  v_order_no TEXT;
  v_ticket_count INTEGER;
  v_attendee_index INTEGER;
  v_total_tickets INTEGER;
  v_order_first_name TEXT;
  v_order_last_name TEXT;
  v_order_email TEXT;
  v_order_phone TEXT;
  v_first_attendee JSONB;
  v_order_status TEXT;
  v_payment_status TEXT;
  v_payment_method TEXT;
  v_fulfillment_status TEXT;
  v_total_amount DECIMAL(10,2);
  v_unit_price DECIMAL(10,2);
  v_subtotal DECIMAL(10,2);
BEGIN
  -- Determine order contact info
  IF p_buyer_email IS NOT NULL AND p_buyer_email != '' THEN
    v_order_first_name := p_buyer_first_name;
    v_order_last_name := p_buyer_last_name;
    v_order_email := p_buyer_email;
    v_order_phone := p_buyer_phone;
  ELSIF p_attendees IS NOT NULL AND jsonb_array_length(p_attendees) > 0 THEN
    v_first_attendee := p_attendees->0;
    v_order_first_name := COALESCE(v_first_attendee->>'first_name', '');
    v_order_last_name := COALESCE(v_first_attendee->>'last_name', '');
    v_order_email := COALESCE(v_first_attendee->>'email', '');
    v_order_phone := COALESCE(v_first_attendee->>'phone', '');
  ELSE
    v_order_first_name := NULL;
    v_order_last_name := NULL;
    v_order_email := NULL;
    v_order_phone := NULL;
  END IF;

  -- Validate event exists and is published
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND status = 'published') THEN
    RAISE EXCEPTION 'Event not found or not published';
  END IF;

  -- Validate tracking link (if provided) - use status instead of is_active
  IF p_tracking_link_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM tracking_links WHERE id = p_tracking_link_id AND status = 'active') THEN
      RAISE WARNING 'Invalid or inactive tracking_link_id: %, ignoring', p_tracking_link_id;
    END IF;
  END IF;

  -- Compute total amount
  SELECT COALESCE(SUM((tt.price * ((ol->>'quantity')::INTEGER))), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_order_lines) ol
  JOIN ticket_types tt ON tt.id = ((ol->>'ticket_type_id')::UUID)
  WHERE tt.event_id = p_event_id AND tt.is_active = true;

  -- Determine order status
  IF v_total_amount <= 0 THEN
    v_order_status := 'paid';
    v_payment_status := 'paid';
    v_payment_method := 'free';
    v_fulfillment_status := 'confirmed';
  ELSE
    v_order_status := 'pending';
    v_payment_status := 'unpaid';
    v_payment_method := NULL;
    v_fulfillment_status := 'pending_confirmation';
  END IF;

  -- Generate order number
  v_order_no := generate_unique_code('ORD');

  -- Create order
  INSERT INTO orders (
    event_id,
    buyer_user_id,
    buyer_first_name,
    buyer_last_name,
    buyer_email,
    buyer_phone,
    total_amount,
    currency,
    status,
    payment_status,
    payment_method,
    fulfillment_status,
    order_no,
    tracking_link_id,
    paid_at,
    confirmed_at
  )
  VALUES (
    p_event_id,
    p_buyer_user_id,
    v_order_first_name,
    v_order_last_name,
    v_order_email,
    v_order_phone,
    v_total_amount,
    p_currency,
    v_order_status,
    v_payment_status,
    v_payment_method,
    v_fulfillment_status,
    v_order_no,
    p_tracking_link_id,
    CASE WHEN v_total_amount <= 0 THEN NOW() ELSE NULL END,
    CASE WHEN v_total_amount <= 0 THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  -- Create order items and tickets
  v_attendee_index := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    SELECT price INTO v_unit_price
    FROM ticket_types
    WHERE id = ((v_line->>'ticket_type_id')::UUID)
      AND event_id = p_event_id
      AND is_active = true;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found or inactive: %', (v_line->>'ticket_type_id');
    END IF;

    v_subtotal := v_unit_price * ((v_line->>'quantity')::INTEGER);

    INSERT INTO order_items (
      order_id,
      ticket_type_id,
      quantity,
      unit_price,
      subtotal
    )
    VALUES (
      v_order_id,
      (v_line->>'ticket_type_id')::UUID,
      (v_line->>'quantity')::INTEGER,
      v_unit_price,
      v_subtotal
    )
    RETURNING id INTO v_order_item_id;

    v_ticket_count := (v_line->>'quantity')::INTEGER;
    FOR i IN 1..v_ticket_count
    LOOP
      v_qr_code := generate_unique_code('TK');

      IF p_attendees IS NOT NULL AND jsonb_array_length(p_attendees) > v_attendee_index THEN
        v_attendee := p_attendees->v_attendee_index;
        INSERT INTO tickets (
          order_id,
          order_item_id,
          ticket_type_id,
          qr_code,
          status,
          first_name,
          last_name,
          email,
          phone
        )
        VALUES (
          v_order_id,
          v_order_item_id,
          (v_line->>'ticket_type_id')::UUID,
          v_qr_code,
          'valid',
          COALESCE(v_attendee->>'first_name', NULL),
          COALESCE(v_attendee->>'last_name', NULL),
          COALESCE(v_attendee->>'email', NULL),
          COALESCE(v_attendee->>'phone', NULL)
        );
        v_attendee_index := v_attendee_index + 1;
      ELSE
        INSERT INTO tickets (
          order_id,
          order_item_id,
          ticket_type_id,
          qr_code,
          status,
          first_name,
          last_name,
          email,
          phone
        )
        VALUES (
          v_order_id,
          v_order_item_id,
          (v_line->>'ticket_type_id')::UUID,
          v_qr_code,
          'valid',
          v_order_first_name,
          v_order_last_name,
          v_order_email,
          v_order_phone
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_event_booking TO authenticated;
GRANT EXECUTE ON FUNCTION create_event_booking TO anon;

ALTER FUNCTION create_event_booking(uuid,jsonb,uuid,text,text,text,text,text,jsonb,uuid) SET search_path = public;

COMMENT ON FUNCTION create_event_booking IS 'Creates an event booking (order) with server-computed amounts and optional tracking link attribution. Uses status instead of is_active for tracking links.';

-- ============================================================================
-- 3. UPDATE get_channel_rows FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_channel_rows();

CREATE FUNCTION public.get_channel_rows()
RETURNS TABLE (
  tracking_link_id UUID,
  label TEXT,
  slug TEXT,
  qr_enabled BOOLEAN,
  clicks BIGINT,
  orders BIGINT,
  revenue NUMERIC,
  destination_url TEXT,
  collab_partner_org_id UUID,
  collab_partner_name TEXT,
  status TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  RETURN QUERY
  WITH user_orgs AS (
    SELECT DISTINCT org_id
    FROM org_members
    WHERE user_id = v_user_id
  ),
  accessible_links AS (
    SELECT DISTINCT tl.*
    FROM tracking_links tl
    INNER JOIN user_orgs uo ON (
      tl.host_org_id = uo.org_id OR tl.affiliate_org_id = uo.org_id
    )
    WHERE tl.status = 'active'
  ),
  link_stats AS (
    SELECT
      al.id AS tracking_link_id,
      COALESCE(al.label, al.slug) AS label,
      al.slug,
      al.qr_enabled,
      COALESCE(COUNT(DISTINCT tc.id), 0)::BIGINT AS clicks,
      COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.payment_status = 'paid'), 0)::BIGINT AS orders,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::NUMERIC AS revenue,
      al.destination_url,
      al.host_org_id,
      al.affiliate_org_id,
      al.status
    FROM accessible_links al
    LEFT JOIN tracking_clicks tc ON tc.tracking_link_id = al.id
    LEFT JOIN orders o ON o.tracking_link_id = al.id AND o.payment_status = 'paid'
    GROUP BY al.id, al.label, al.slug, al.qr_enabled, al.destination_url, al.host_org_id, al.affiliate_org_id, al.status
  ),
  partner_info AS (
    SELECT
      ls.*,
      CASE
        WHEN EXISTS (SELECT 1 FROM user_orgs WHERE org_id = ls.host_org_id) 
          AND ls.affiliate_org_id IS NOT NULL
        THEN ls.affiliate_org_id
        WHEN EXISTS (SELECT 1 FROM user_orgs WHERE org_id = ls.affiliate_org_id)
          AND ls.host_org_id IS NOT NULL
        THEN ls.host_org_id
        ELSE NULL
      END AS collab_partner_org_id
    FROM link_stats ls
  )
  SELECT
    pi.tracking_link_id,
    pi.label,
    pi.slug,
    pi.qr_enabled,
    pi.clicks,
    pi.orders,
    pi.revenue,
    pi.destination_url,
    pi.collab_partner_org_id,
    o.name AS collab_partner_name,
    pi.status
  FROM partner_info pi
  LEFT JOIN orgs o ON o.id = pi.collab_partner_org_id
  ORDER BY pi.clicks DESC, pi.label ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_channel_rows() TO authenticated;

COMMENT ON FUNCTION public.get_channel_rows IS 'Returns active tracking channel rows with aggregated stats (clicks, orders, revenue) including slug and qr_enabled for authenticated users based on org membership. Uses status instead of is_active.';

-- ============================================================================
-- 4. DROP INDEX ON is_active
-- ============================================================================

DROP INDEX IF EXISTS idx_tracking_links_is_active;

-- ============================================================================
-- 5. DROP is_active COLUMN
-- ============================================================================

ALTER TABLE public.tracking_links DROP COLUMN IF EXISTS is_active;
