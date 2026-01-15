-- Migration: Remove all receipt/payment token generation and validation
-- 
-- Goal:
-- - Remove edit_token column from orders table
-- - Remove token generation trigger and function
-- - Remove token validation from receipt submission functions
-- - Make receipt upload completely unauthenticated (host confirmation is the only security boundary)
--
-- ============================================================================
-- PART A: DROP TRIGGER AND FUNCTION FOR TOKEN GENERATION
-- ============================================================================

-- Drop trigger first
DROP TRIGGER IF EXISTS trg_set_order_edit_token ON public.orders;

-- Drop function
DROP FUNCTION IF EXISTS public.set_order_edit_token();

-- ============================================================================
-- PART B: UPDATE FUNCTIONS TO REMOVE TOKEN VALIDATION
-- ============================================================================

-- Update submit_payment_receipt: Remove all token validation
-- Receipt upload is now completely unauthenticated
DROP FUNCTION IF EXISTS public.submit_payment_receipt(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_payment_receipt(
  p_order_id UUID,
  p_payment_method TEXT,
  p_receipt_url TEXT,
  p_payment_reference_link TEXT DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_total_amount DECIMAL(10,2);
  v_current_payment_status TEXT;
  v_current_fulfillment_status TEXT;
BEGIN
  -- STEP 1: Fetch order and validate it exists
  SELECT 
    id,
    total_amount,
    payment_status,
    fulfillment_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_total_amount := v_order.total_amount;
  v_current_payment_status := v_order.payment_status;
  v_current_fulfillment_status := v_order.fulfillment_status;

  -- STEP 2: Validate payment_method
  IF p_payment_method NOT IN ('payme', 'fps') THEN
    RAISE EXCEPTION 'Invalid payment_method: %. Must be ''payme'' or ''fps''', p_payment_method;
  END IF;

  -- STEP 3: Validate receipt_url is not empty
  IF p_receipt_url IS NULL OR TRIM(p_receipt_url) = '' THEN
    RAISE EXCEPTION 'receipt_url cannot be empty';
  END IF;

  -- STEP 4: Validate total_amount > 0 (free orders should never submit receipts)
  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Cannot submit receipt for free orders (total_amount = %)', v_total_amount;
  END IF;

  -- STEP 5: Validate payment_status transition
  -- Only allow transition to submitted if:
  -- - current payment_status in ('unpaid','failed') OR (submitted -> allow updating receipt_url, but keep payment_status='submitted')
  -- - fulfillment_status != 'cancelled'
  IF v_current_payment_status NOT IN ('unpaid', 'failed', 'submitted') THEN
    RAISE EXCEPTION 'Cannot submit receipt. Current payment_status is %, expected unpaid, failed, or submitted', v_current_payment_status;
  END IF;

  IF v_current_fulfillment_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot submit receipt for cancelled orders';
  END IF;

  -- STEP 6: Update order
  -- Set: payment_method, receipt_url, payment_reference_link, submitted_at, payment_status='submitted'
  -- DO NOT set: paid_at, status='paid', fulfillment_status='confirmed'
  -- No token validation - receipt upload is unauthenticated
  UPDATE orders
  SET 
    payment_method = p_payment_method,
    receipt_url = p_receipt_url,
    payment_reference_link = p_payment_reference_link,
    submitted_at = NOW(),
    payment_status = 'submitted',
    updated_at = NOW()
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  RAISE NOTICE 'Payment receipt submitted for order %: payment_method=%, payment_status=submitted', p_order_id, p_payment_method;
END;
$$;

-- Grant execute permission to anon and authenticated (no auth gates)
GRANT EXECUTE ON FUNCTION public.submit_payment_receipt(UUID, TEXT, TEXT, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.submit_payment_receipt IS 
  'Submits a payment receipt for PayMe/FPS orders. No authentication required - receipt upload is unauthenticated. Sets payment_status=''submitted'' but does NOT mark as paid. Only host confirmation can mark as paid.';

-- Update update_order_contact_info: Remove all token validation
DROP FUNCTION IF EXISTS public.update_order_contact_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_order_contact_info(
  p_order_id UUID,
  p_buyer_first_name TEXT DEFAULT NULL,
  p_buyer_last_name TEXT DEFAULT NULL,
  p_buyer_email TEXT DEFAULT NULL,
  p_buyer_phone TEXT DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- STEP 1: Fetch order and validate it exists
  SELECT 
    id
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- STEP 2: Update order contact info
  -- No token validation - contact info update is unauthenticated
  -- Normalize email if provided (lowercase, trim)
  UPDATE orders
  SET 
    buyer_first_name = NULLIF(TRIM(p_buyer_first_name), ''),
    buyer_last_name = NULLIF(TRIM(p_buyer_last_name), ''),
    buyer_email = CASE 
      WHEN p_buyer_email IS NOT NULL AND TRIM(p_buyer_email) != '' 
      THEN LOWER(TRIM(p_buyer_email))
      ELSE NULL
    END,
    buyer_phone = NULLIF(TRIM(p_buyer_phone), ''),
    updated_at = NOW()
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  RAISE NOTICE 'Contact info updated for order %', p_order_id;
END;
$$;

-- Grant execute permission to anon and authenticated (no auth gates)
GRANT EXECUTE ON FUNCTION public.update_order_contact_info(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.update_order_contact_info IS 
  'Updates order contact info (buyer_first_name, buyer_last_name, buyer_email, buyer_phone). No authentication required - works for incognito/anon users.';

-- Update create_event_booking: Remove edit_token from return value
-- Drop old function signature
DROP FUNCTION IF EXISTS create_event_booking(uuid, jsonb, uuid, text, text, text, text, text, jsonb) CASCADE;

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
RETURNS UUID  -- Changed back to UUID (no longer returning edit_token)
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
  -- STEP 2: VALIDATE EVENT EXISTS AND IS ACTIVE
  -- ============================================================================
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND is_active = true) THEN
    RAISE EXCEPTION 'Event not found or not active';
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
  RETURNING id INTO v_order_id;  -- No longer fetching edit_token

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
  -- STEP 8: RETURN ORDER ID ONLY (no edit_token)
  -- ============================================================================
  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION create_event_booking IS 
  'Creates an event booking with order, order items, and tickets. Returns UUID (order_id). All amounts are computed server-side from ticket_types.price.';

-- ============================================================================
-- PART C: DROP INDEX AND COLUMN
-- ============================================================================

-- Drop index on edit_token
DROP INDEX IF EXISTS idx_orders_edit_token;

-- Drop edit_token column from orders table
ALTER TABLE public.orders
DROP COLUMN IF EXISTS edit_token;

