-- Migration: Fix server-side amount calculation (P0 Security Fix)
-- Removes client-provided p_total_amount and computes all amounts server-side from ticket_types.price
-- This prevents clients from tampering with total_amount to bypass payment

-- ============================================================================
-- DROP OLD FUNCTION (with old signature that includes p_total_amount)
-- ============================================================================
-- Drop all overloads of create_event_booking to avoid ambiguity
-- CASCADE ensures all dependent objects are handled
-- We'll recreate with the new secure signature immediately after

DROP FUNCTION IF EXISTS create_event_booking CASCADE;

-- ============================================================================
-- CREATE NEW FUNCTION (without p_total_amount parameter)
-- ============================================================================

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
  -- Order contact info (determined based on mode)
  v_order_first_name TEXT;
  v_order_last_name TEXT;
  v_order_email TEXT;
  v_order_phone TEXT;
  -- First attendee info (for Per-Ticket mode)
  v_first_attendee JSONB;
  -- Payment and fulfillment status
  v_payment_status TEXT;
  v_fulfillment_status TEXT;
  v_payment_method TEXT;
  v_order_status TEXT;
  -- Server-side amount calculation
  v_unit_price DECIMAL(10,2);
  v_subtotal DECIMAL(10,2);
  v_total_amount DECIMAL(10,2) := 0;
BEGIN
  -- ============================================================================
  -- STEP 1: DETERMINE ORDER CONTACT INFO
  -- ============================================================================
  -- If Per-Ticket mode (p_attendees provided), use Attendee 1 info as order contact
  -- Otherwise, use primary booker info (p_buyer_*)
  
  IF p_attendees IS NOT NULL AND jsonb_array_length(p_attendees) > 0 THEN
    -- Per-Ticket mode: Use Attendee 1 (first attendee) as order contact
    v_first_attendee := p_attendees->0;
    v_order_first_name := COALESCE(v_first_attendee->>'first_name', p_buyer_first_name);
    v_order_last_name := COALESCE(v_first_attendee->>'last_name', p_buyer_last_name);
    v_order_email := COALESCE(v_first_attendee->>'email', p_buyer_email);
    v_order_phone := COALESCE(v_first_attendee->>'phone', p_buyer_phone);
  ELSE
    -- Primary Booker mode: Use provided buyer contact info
    v_order_first_name := p_buyer_first_name;
    v_order_last_name := p_buyer_last_name;
    v_order_email := p_buyer_email;
    v_order_phone := p_buyer_phone;
  END IF;

  -- ============================================================================
  -- STEP 2: VALIDATE ORDER CONTACT (for incognito/guest bookings)
  -- ============================================================================
  -- Order is valid if ANY of these is true:
  -- 1. buyer_user_id is provided (authenticated user)
  -- 2. buyer_email is provided (primary booker mode)
  -- 3. attendees[0].email is provided (Per-Ticket mode)
  
  IF p_buyer_user_id IS NULL THEN
    -- Guest booking: Must have email from either buyer_email OR first attendee
    IF (v_order_email IS NULL OR v_order_email = '') THEN
      RAISE EXCEPTION 'Either buyer_user_id, buyer_email, or attendee email must be provided';
    END IF;
  END IF;

  -- If buyer_user_id is provided, verify it matches authenticated user
  IF p_buyer_user_id IS NOT NULL AND auth.uid() != p_buyer_user_id THEN
    RAISE EXCEPTION 'buyer_user_id must match authenticated user';
  END IF;

  -- ============================================================================
  -- STEP 3: VALIDATE EVENT EXISTS
  -- ============================================================================
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- ============================================================================
  -- STEP 4: COMPUTE TOTAL AMOUNT SERVER-SIDE FROM ticket_types.price
  -- ============================================================================
  -- Loop through order lines and compute total_amount from DB ticket prices
  -- This is the SECURITY FIX: prices come from DB, not client
  
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    -- Validate required fields
    IF (v_line->>'ticket_type_id') IS NULL THEN
      RAISE EXCEPTION 'ticket_type_id is required in order_lines';
    END IF;
    
    IF (v_line->>'quantity') IS NULL OR (v_line->>'quantity')::INTEGER <= 0 THEN
      RAISE EXCEPTION 'quantity must be a positive integer in order_lines';
    END IF;
    
    -- Get unit_price from ticket_types table (server-side source of truth)
    -- SECURITY: Verify ticket_type belongs to the event (prevents mixing ticket types from different events)
    SELECT price INTO v_unit_price
    FROM ticket_types
    WHERE id = (v_line->>'ticket_type_id')::UUID
      AND event_id = p_event_id;
    
    -- Validate ticket type exists and belongs to the event
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found or does not belong to this event: %', (v_line->>'ticket_type_id');
    END IF;
    
    -- Compute subtotal server-side
    v_subtotal := v_unit_price * (v_line->>'quantity')::INTEGER;
    v_total_amount := v_total_amount + v_subtotal;
  END LOOP;

  -- ============================================================================
  -- STEP 5: CALCULATE TOTAL TICKETS
  -- ============================================================================
  v_total_tickets := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    v_total_tickets := v_total_tickets + (v_line->>'quantity')::INTEGER;
  END LOOP;

  -- Validate attendees array if provided
  IF p_attendees IS NOT NULL THEN
    IF jsonb_array_length(p_attendees) != v_total_tickets THEN
      RAISE EXCEPTION 'Number of attendees must match total ticket quantity';
    END IF;
  END IF;

  -- ============================================================================
  -- STEP 6: DETERMINE PAYMENT AND FULFILLMENT STATUS (based on SERVER-COMPUTED total_amount)
  -- ============================================================================
  -- Free tickets (amount = 0): Immediately confirmed with all timestamps
  -- Paid tickets: Start as unpaid, pending confirmation
  IF v_total_amount <= 0 THEN
    v_payment_status := 'paid';
    v_fulfillment_status := 'confirmed';
    v_payment_method := 'free';
    v_order_status := 'paid';
  ELSE
    v_payment_status := 'unpaid';
    v_fulfillment_status := 'pending_confirmation';
    v_payment_method := NULL;
    v_order_status := 'pending';
  END IF;

  -- ============================================================================
  -- STEP 7: GENERATE ORDER NUMBER
  -- ============================================================================
  v_order_no := generate_unique_code('ORD');

  -- ============================================================================
  -- STEP 8: CREATE ORDER (using SERVER-COMPUTED total_amount)
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
  RETURNING id INTO v_order_id;

  -- ============================================================================
  -- STEP 9: CREATE ORDER ITEMS AND TICKETS (using SERVER-COMPUTED prices)
  -- ============================================================================
  v_attendee_index := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    -- Re-fetch unit_price from DB (for clarity and consistency)
    -- SECURITY: Verify ticket_type belongs to the event (prevents mixing ticket types from different events)
    SELECT price INTO v_unit_price
    FROM ticket_types
    WHERE id = (v_line->>'ticket_type_id')::UUID
      AND event_id = p_event_id;
    
    -- Validate ticket type exists and belongs to the event
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found or does not belong to this event: %', (v_line->>'ticket_type_id');
    END IF;
    
    -- Compute subtotal server-side
    v_subtotal := v_unit_price * (v_line->>'quantity')::INTEGER;
    
    -- Create order item with SERVER-COMPUTED prices
    INSERT INTO order_items (
      order_id,
      ticket_type_id,
      quantity,
      unit_price,  -- ✅ Server-computed
      subtotal     -- ✅ Server-computed
    )
    VALUES (
      v_order_id,
      (v_line->>'ticket_type_id')::UUID,
      (v_line->>'quantity')::INTEGER,
      v_unit_price,  -- ✅ Server-computed
      v_subtotal     -- ✅ Server-computed
    )
    RETURNING id INTO v_order_item_id;

    -- Create tickets for this order item (ALWAYS create tickets)
    FOR v_ticket_count IN 1..(v_line->>'quantity')::INTEGER
    LOOP
      -- Generate QR code
      v_qr_code := generate_unique_code('TK');

      -- Get attendee info if provided (per-ticket mode)
      IF p_attendees IS NOT NULL AND jsonb_array_length(p_attendees) > v_attendee_index THEN
        v_attendee := p_attendees->v_attendee_index;
        
        -- Per-Ticket mode: Use individual attendee info
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

  RETURN v_order_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_event_booking TO authenticated;
GRANT EXECUTE ON FUNCTION create_event_booking TO anon;

COMMENT ON FUNCTION create_event_booking IS 
'Secure booking creation function with server-side amount calculation.

SECURITY FIX (P0): All amounts are computed server-side from ticket_types.price.
- p_total_amount parameter REMOVED (was vulnerable to tampering)
- p_order_lines now accepts ONLY {ticket_type_id, quantity} (NO unit_price, NO subtotal)
- total_amount computed from ticket_types.price × quantity
- unit_price and subtotal in order_items computed server-side

ALWAYS creates:
1. Exactly ONE order row (with order_no and fulfillment_status)
2. N ticket rows (1 per seat)

For free tickets (server-computed total_amount = 0): 
- Sets payment_status = paid, fulfillment_status = confirmed
- Sets payment_method = free, status = paid
- Sets paid_at and confirmed_at timestamps immediately

For paid tickets: 
- Sets payment_status = unpaid, fulfillment_status = pending_confirmation
- Timestamps are NULL until payment/confirmation

For Per-Ticket mode: Uses Attendee 1 info as order contact.
For Primary Booker mode: Uses provided buyer contact info.
Supports incognito/guest bookings when email is provided.';

