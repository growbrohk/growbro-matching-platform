-- Migration: Add attendee information support to orders and tickets
-- This enables per-ticket attendee collection and guest checkout

-- ============================================================================
-- 1. UPDATE ORDERS TABLE
-- ============================================================================

-- Add currency field to orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'HKD';

-- Make buyer_user_id nullable for guest checkout
ALTER TABLE orders
ALTER COLUMN buyer_user_id DROP NOT NULL;

-- Add contact info fields for primary booker (used when collect_attendee_info = 'primary')
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS buyer_first_name TEXT,
ADD COLUMN IF NOT EXISTS buyer_last_name TEXT,
ADD COLUMN IF NOT EXISTS buyer_email TEXT,
ADD COLUMN IF NOT EXISTS buyer_phone TEXT;

-- ============================================================================
-- 2. UPDATE TICKETS TABLE
-- ============================================================================

-- Add attendee information fields to tickets
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============================================================================
-- 3. UPDATE RLS POLICIES
-- ============================================================================

-- Update orders INSERT policy to allow guest checkout (buyer_user_id can be null)
DROP POLICY IF EXISTS "Users can create orders" ON orders;
CREATE POLICY "Users can create orders"
  ON orders FOR INSERT
  WITH CHECK (
    buyer_user_id IS NULL OR buyer_user_id = auth.uid()
  );

-- ============================================================================
-- 4. CREATE RPC FUNCTION FOR BOOKING CREATION
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
  v_ticket_count INTEGER;
  v_attendee_index INTEGER;
  v_total_tickets INTEGER;
BEGIN
  -- Validate: Either authenticated user or guest info provided
  IF p_buyer_user_id IS NULL AND (p_buyer_email IS NULL OR p_buyer_email = '') THEN
    RAISE EXCEPTION 'Either buyer_user_id or buyer_email must be provided';
  END IF;

  -- If buyer_user_id is provided, verify it matches authenticated user
  IF p_buyer_user_id IS NOT NULL AND auth.uid() != p_buyer_user_id THEN
    RAISE EXCEPTION 'buyer_user_id must match authenticated user';
  END IF;

  -- Validate event exists
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Calculate total tickets from order lines
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
    status
  )
  VALUES (
    p_event_id,
    p_buyer_user_id,
    p_buyer_first_name,
    p_buyer_last_name,
    p_buyer_email,
    p_buyer_phone,
    p_total_amount,
    p_currency,
    'pending' -- Will be updated to 'paid' after payment processing
  )
  RETURNING id INTO v_order_id;

  -- Create order items and tickets
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

    -- Create tickets for this order item
    FOR v_ticket_count IN 1..(v_line->>'quantity')::INTEGER
    LOOP
      -- Generate QR code
      v_qr_code := generate_unique_code('TK');

      -- Get attendee info if provided (per-ticket mode)
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
          COALESCE(v_attendee->>'first_name', '')::TEXT,
          COALESCE(v_attendee->>'last_name', '')::TEXT,
          COALESCE(v_attendee->>'email', '')::TEXT,
          COALESCE(v_attendee->>'phone', '')::TEXT
        );
        
        v_attendee_index := v_attendee_index + 1;
      ELSE
        -- Primary mode: use buyer info for all tickets
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
          p_buyer_first_name,
          p_buyer_last_name,
          p_buyer_email,
          p_buyer_phone
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

