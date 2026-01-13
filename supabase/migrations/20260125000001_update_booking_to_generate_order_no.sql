-- Migration: Update create_event_booking to generate order_no and set fulfillment_status
-- Also handles free ticket short-circuit (immediate confirmation)

-- ============================================================================
-- UPDATE create_event_booking RPC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_event_booking(
  p_event_id UUID,
  p_total_amount DECIMAL(10,2),
  p_order_lines JSONB, -- Array of {ticket_type_id, quantity, unit_price, subtotal}
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
  -- STEP 4: CALCULATE TOTAL TICKETS
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
  -- STEP 5: DETERMINE PAYMENT AND FULFILLMENT STATUS
  -- ============================================================================
  -- Free tickets (amount = 0): Immediately confirmed
  -- Paid tickets: Start as unpaid, pending confirmation
  IF p_total_amount <= 0 THEN
    v_payment_status := 'paid';
    v_fulfillment_status := 'confirmed';
  ELSE
    v_payment_status := 'unpaid';
    v_fulfillment_status := 'pending_confirmation';
  END IF;

  -- ============================================================================
  -- STEP 6: GENERATE ORDER NUMBER
  -- ============================================================================
  v_order_no := generate_unique_code('ORD');

  -- ============================================================================
  -- STEP 7: CREATE ORDER (ALWAYS)
  -- ============================================================================
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
    fulfillment_status,
    order_no
  )
  VALUES (
    p_event_id,
    p_buyer_user_id,
    v_order_first_name,  -- Use determined order contact info
    v_order_last_name,
    v_order_email,
    v_order_phone,
    p_total_amount,
    p_currency,
    'pending',
    v_payment_status,
    v_fulfillment_status,
    v_order_no
  )
  RETURNING id INTO v_order_id;

  -- ============================================================================
  -- STEP 8: CREATE ORDER ITEMS AND TICKETS (ALWAYS)
  -- ============================================================================
  v_attendee_index := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    -- Create order item
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
      (v_line->>'unit_price')::DECIMAL,
      (v_line->>'subtotal')::DECIMAL
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

-- Grant execute permission (already granted, but ensure it's there)
GRANT EXECUTE ON FUNCTION create_event_booking TO authenticated;
GRANT EXECUTE ON FUNCTION create_event_booking TO anon;

COMMENT ON FUNCTION create_event_booking IS 
'Unified booking creation function. ALWAYS creates:
1. Exactly ONE order row (with order_no and fulfillment_status)
2. N ticket rows (1 per seat)

For free tickets (amount = 0): Sets payment_status = paid, fulfillment_status = confirmed
For paid tickets: Sets payment_status = unpaid, fulfillment_status = pending_confirmation

For Per-Ticket mode: Uses Attendee 1 info as order contact.
For Primary Booker mode: Uses provided buyer contact info.
Supports incognito/guest bookings when email is provided.';

