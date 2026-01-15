-- Migration: Fix create_event_booking to use status='published' instead of is_active
-- 
-- Bug:
-- - Function was checking events.is_active which doesn't exist
-- - Events table uses status column, where status='published' means active/bookable
--
-- Fix:
-- - Replace `is_active = true` check with `status = 'published'` for events table
-- - Update error message to reflect the change
-- - Keep ticket_types.is_active checks unchanged (that column exists)

CREATE OR REPLACE FUNCTION create_event_booking(
  p_event_id UUID,
  p_order_lines JSONB, -- Array of {ticket_type_id, quantity} ONLY (NO unit_price, NO subtotal)
  p_buyer_user_id UUID DEFAULT NULL,
  p_buyer_first_name TEXT DEFAULT NULL,
  p_buyer_last_name TEXT DEFAULT NULL,
  p_buyer_email TEXT DEFAULT NULL,
  p_buyer_phone TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'HKD',
  p_attendees JSONB DEFAULT NULL -- Array of {ticket_type_id, first_name, last_name, email, phone} for per-ticket mode
)
RETURNS JSONB
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
  -- Order contact info (determined based on mode)
  v_order_first_name TEXT;
  v_order_last_name TEXT;
  v_order_email TEXT;
  v_order_phone TEXT;
  -- First attendee info (for Per-Ticket mode)
  v_first_attendee JSONB;
  -- Order status and amounts
  v_order_status TEXT;
  v_payment_status TEXT;
  v_payment_method TEXT;
  v_fulfillment_status TEXT;
  v_total_amount DECIMAL(10,2);
  v_unit_price DECIMAL(10,2);
  v_subtotal DECIMAL(10,2);
  v_edit_token TEXT;
BEGIN
  -- ============================================================================
  -- STEP 1: DETERMINE ORDER CONTACT INFO
  -- ============================================================================
  -- Priority: p_buyer_* parameters > first attendee (for Per-Ticket mode)
  
  -- Check if we have explicit buyer contact info
  IF p_buyer_email IS NOT NULL AND p_buyer_email != '' THEN
    -- Use explicit buyer contact info (Primary Booker mode OR Per-Ticket with Order Contact section)
    v_order_first_name := p_buyer_first_name;
    v_order_last_name := p_buyer_last_name;
    v_order_email := p_buyer_email;
    v_order_phone := p_buyer_phone;
  ELSIF p_attendees IS NOT NULL AND jsonb_array_length(p_attendees) > 0 THEN
    -- Per-Ticket mode: fallback to first attendee if no explicit buyer contact
    v_first_attendee := p_attendees->0;
    v_order_first_name := COALESCE(v_first_attendee->>'first_name', '');
    v_order_last_name := COALESCE(v_first_attendee->>'last_name', '');
    v_order_email := COALESCE(v_first_attendee->>'email', '');
    v_order_phone := COALESCE(v_first_attendee->>'phone', '');
  ELSE
    -- No contact info provided
    v_order_first_name := NULL;
    v_order_last_name := NULL;
    v_order_email := NULL;
    v_order_phone := NULL;
  END IF;

  -- ============================================================================
  -- STEP 2: VALIDATE EVENT EXISTS AND IS PUBLISHED
  -- ============================================================================
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND status = 'published') THEN
    RAISE EXCEPTION 'Event not found or not published';
  END IF;

  -- ============================================================================
  -- STEP 3: COMPUTE TOTAL AMOUNT (SERVER-SIDE ONLY)
  -- ============================================================================
  -- Calculate total_amount from ticket_types.price × quantity
  -- Frontend MUST NOT send prices - server computes from DB
  SELECT COALESCE(SUM((tt.price * ((ol->>'quantity')::INTEGER))), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_order_lines) ol
  JOIN ticket_types tt ON tt.id = ((ol->>'ticket_type_id')::UUID)
  WHERE tt.event_id = p_event_id AND tt.is_active = true;

  -- ============================================================================
  -- STEP 4: DETERMINE ORDER STATUS
  -- ============================================================================
  IF v_total_amount <= 0 THEN
    -- Free order: immediately paid and confirmed
    v_order_status := 'paid';
    v_payment_status := 'paid';
    v_payment_method := 'free';
    v_fulfillment_status := 'confirmed';
  ELSE
    -- Paid order: pending payment
    v_order_status := 'pending';
    v_payment_status := 'unpaid';
    v_payment_method := NULL;
    v_fulfillment_status := 'pending_confirmation';
  END IF;

  -- ============================================================================
  -- STEP 5: GENERATE ORDER NUMBER
  -- ============================================================================
  -- Generate unique order number using generate_unique_code function
  -- This function should exist from previous migrations
  v_order_no := generate_unique_code('ORD');

  -- ============================================================================
  -- STEP 6: CREATE ORDER (using SERVER-COMPUTED total_amount)
  -- ============================================================================
  INSERT INTO orders (
    event_id,
    buyer_user_id,
    buyer_first_name,
    buyer_last_name,
    buyer_email,
    buyer_phone,
    total_amount,  -- ✅ Server-computed
    currency,
    status,
    payment_status,
    payment_method,
    fulfillment_status,
    order_no,
    -- For free orders: set timestamps immediately
    paid_at,
    confirmed_at
  )
  VALUES (
    p_event_id,
    p_buyer_user_id,
    v_order_first_name,  -- Use determined order contact info
    v_order_last_name,
    v_order_email,
    v_order_phone,
    v_total_amount,  -- ✅ Server-computed
    p_currency,
    v_order_status,
    v_payment_status,
    v_payment_method,
    v_fulfillment_status,
    v_order_no,
    -- Set timestamps for free orders, NULL for paid orders
    CASE WHEN v_total_amount <= 0 THEN NOW() ELSE NULL END,
    CASE WHEN v_total_amount <= 0 THEN NOW() ELSE NULL END
  )
  RETURNING id, edit_token INTO v_order_id, v_edit_token;  -- Fetch edit_token

  -- ============================================================================
  -- STEP 7: CREATE ORDER ITEMS AND TICKETS (using SERVER-COMPUTED prices)
  -- ============================================================================
  v_attendee_index := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    -- Re-fetch unit_price from DB (for clarity and consistency)
    SELECT price INTO v_unit_price
    FROM ticket_types
    WHERE id = ((v_line->>'ticket_type_id')::UUID)
      AND event_id = p_event_id
      AND is_active = true;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found or inactive: %', (v_line->>'ticket_type_id');
    END IF;

    v_subtotal := v_unit_price * ((v_line->>'quantity')::INTEGER);

    -- Create order item with SERVER-COMPUTED prices
    INSERT INTO order_items (
      order_id,
      ticket_type_id,
      quantity,
      unit_price,  -- ✅ Server-computed from ticket_types.price
      subtotal     -- ✅ Server-computed
    )
    VALUES (
      v_order_id,
      (v_line->>'ticket_type_id')::UUID,
      (v_line->>'quantity')::INTEGER,
      v_unit_price,
      v_subtotal
    )
    RETURNING id INTO v_order_item_id;

    -- Create tickets for this order item (ALWAYS create tickets)
    v_ticket_count := (v_line->>'quantity')::INTEGER;
    FOR i IN 1..v_ticket_count
    LOOP
      -- Generate QR code
      v_qr_code := generate_unique_code('TK');

      -- Determine attendee info for this ticket
      IF p_attendees IS NOT NULL AND jsonb_array_length(p_attendees) > v_attendee_index THEN
        -- Per-Ticket mode: Use individual attendee info
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
          COALESCE(v_attendee->>'first_name', '')::TEXT,
          COALESCE(v_attendee->>'last_name', '')::TEXT,
          COALESCE(v_attendee->>'email', '')::TEXT,
          COALESCE(v_attendee->>'phone', '')::TEXT
        );
        
        v_attendee_index := v_attendee_index + 1;
      ELSE
        -- Primary Booker mode: Use buyer info for all tickets
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
          v_order_first_name,  -- Use order contact info
          v_order_last_name,
          v_order_email,
          v_order_phone
        );
      END IF;
    END LOOP;
  END LOOP;

  -- ============================================================================
  -- STEP 8: RETURN ORDER ID AND EDIT TOKEN
  -- ============================================================================
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'edit_token', v_edit_token
  );
END;
$$;

-- Safety hardening: explicitly set search_path
ALTER FUNCTION create_event_booking(uuid,jsonb,uuid,text,text,text,text,text,jsonb) SET search_path = public;

COMMENT ON FUNCTION create_event_booking IS 
  'Creates an event booking with order, order items, and tickets. Returns JSONB with order_id and edit_token. All amounts are computed server-side from ticket_types.price.';

