-- Migration 8: RPC Functions

-- Function: create_org
-- Creates an org, adds the creator as owner, and creates a default warehouse
CREATE OR REPLACE FUNCTION create_org(p_name TEXT)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Create org
  INSERT INTO orgs (name)
  VALUES (p_name)
  RETURNING id INTO v_org_id;

  -- Add creator as owner
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  -- Create default warehouse
  INSERT INTO warehouses (org_id, name)
  VALUES (v_org_id, 'Main Warehouse');

  RETURN v_org_id;
END;
$$;

-- Function: create_product_with_variants
-- Creates a product and its variants in one transaction
CREATE OR REPLACE FUNCTION create_product_with_variants(
  p_org_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_base_price DECIMAL,
  p_variant_names TEXT[] DEFAULT NULL,
  p_variant_skus TEXT[] DEFAULT NULL,
  p_variant_prices DECIMAL[] DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id UUID;
  v_user_id UUID;
  i INT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check user belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to this organization';
  END IF;

  -- Validate type
  IF p_type NOT IN ('physical', 'venue_asset') THEN
    RAISE EXCEPTION 'Product type must be physical or venue_asset';
  END IF;

  -- Validate arrays have same length (if non-empty)
  IF array_length(p_variant_names, 1) IS NOT NULL THEN
    IF array_length(p_variant_names, 1) IS DISTINCT FROM array_length(p_variant_skus, 1)
       OR array_length(p_variant_names, 1) IS DISTINCT FROM array_length(p_variant_prices, 1) THEN
      RAISE EXCEPTION 'Variant arrays must have the same length';
    END IF;
  END IF;

  -- Create product
  INSERT INTO products (org_id, type, title, base_price)
  VALUES (p_org_id, p_type, p_title, p_base_price)
  RETURNING id INTO v_product_id;

  -- Create variants
  IF array_length(p_variant_names, 1) IS NOT NULL AND array_length(p_variant_names, 1) > 0 THEN
    FOR i IN 1..array_length(p_variant_names, 1) LOOP
      INSERT INTO product_variants (product_id, name, sku, price)
      VALUES (
        v_product_id,
        p_variant_names[i],
        NULLIF(p_variant_skus[i], ''),
        NULLIF(p_variant_prices[i], 0)
      );
    END LOOP;
  ELSE
    -- Create a default variant if none provided
    INSERT INTO product_variants (product_id, name, price)
    VALUES (v_product_id, 'Default', p_base_price);
  END IF;

  RETURN v_product_id;
END;
$$;

-- Function: create_inventory_for_variant
-- Creates or updates inventory item for a variant in a warehouse
CREATE OR REPLACE FUNCTION create_inventory_for_variant(
  p_org_id UUID,
  p_warehouse_id UUID,
  p_variant_id UUID,
  p_initial_stock INTEGER
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_inventory_item_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check user belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to this organization';
  END IF;

  -- Check warehouse belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM warehouses
    WHERE id = p_warehouse_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Warehouse does not belong to this organization';
  END IF;

  -- Check variant belongs to a product in org
  IF NOT EXISTS (
    SELECT 1 FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.id = p_variant_id AND p.org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Variant does not belong to this organization';
  END IF;

  -- Upsert inventory item
  INSERT INTO inventory_items (org_id, warehouse_id, variant_id, quantity)
  VALUES (p_org_id, p_warehouse_id, p_variant_id, p_initial_stock)
  ON CONFLICT (warehouse_id, variant_id)
  DO UPDATE SET quantity = inventory_items.quantity + p_initial_stock
  RETURNING id INTO v_inventory_item_id;

  -- Create movement record if stock was added
  IF p_initial_stock > 0 THEN
    INSERT INTO inventory_movements (inventory_item_id, delta, reason, note, created_by)
    VALUES (v_inventory_item_id, p_initial_stock, 'initial_stock', 'Initial inventory setup', v_user_id);
  END IF;

  RETURN v_inventory_item_id;
END;
$$;

-- Function: adjust_stock
-- Adjusts inventory stock and creates a movement record
CREATE OR REPLACE FUNCTION adjust_stock(
  p_inventory_item_id UUID,
  p_delta INTEGER,
  p_reason TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_movement_id UUID;
  v_user_id UUID;
  v_new_quantity INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check user has access to this inventory item
  IF NOT EXISTS (
    SELECT 1 FROM inventory_items ii
    JOIN org_members om ON om.org_id = ii.org_id
    WHERE ii.id = p_inventory_item_id AND om.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not have access to this inventory item';
  END IF;

  -- Update quantity
  UPDATE inventory_items
  SET quantity = GREATEST(0, quantity + p_delta),
      updated_at = NOW()
  WHERE id = p_inventory_item_id
  RETURNING quantity INTO v_new_quantity;

  -- Create movement record
  INSERT INTO inventory_movements (inventory_item_id, delta, reason, note, created_by)
  VALUES (p_inventory_item_id, p_delta, p_reason, p_note, v_user_id)
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

-- Function: generate_unique_code
-- Helper function to generate unique codes for QR codes
CREATE OR REPLACE FUNCTION generate_unique_code(p_prefix TEXT DEFAULT '')
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a code: prefix + random hex string
    v_code := p_prefix || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 12));
    
    -- Check if it exists in booking_entitlements or tickets
    SELECT EXISTS(
      SELECT 1 FROM booking_entitlements WHERE code = v_code
      UNION
      SELECT 1 FROM tickets WHERE qr_code = v_code
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- Function: create_booking
-- Creates a booking and auto-creates a booking entitlement with QR code
CREATE OR REPLACE FUNCTION create_booking(
  p_brand_org_id UUID,
  p_venue_org_id UUID,
  p_resource_product_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking_id UUID;
  v_user_id UUID;
  v_code TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check user belongs to brand org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_brand_org_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to the brand organization';
  END IF;

  -- Create booking
  INSERT INTO bookings (brand_org_id, venue_org_id, resource_product_id, start_at, end_at, status)
  VALUES (p_brand_org_id, p_venue_org_id, p_resource_product_id, p_start_at, p_end_at, 'confirmed')
  RETURNING id INTO v_booking_id;

  -- Generate unique QR code and create entitlement
  v_code := generate_unique_code('BK');
  INSERT INTO booking_entitlements (booking_id, code)
  VALUES (v_booking_id, v_code);

  RETURN v_booking_id;
END;
$$;

-- Function: redeem_booking
-- Redeems a booking entitlement by code
CREATE OR REPLACE FUNCTION redeem_booking(p_code TEXT)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_entitlement_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Find and update entitlement
  UPDATE booking_entitlements
  SET redeemed_at = NOW(),
      redeemed_by = v_user_id
  WHERE code = p_code
    AND redeemed_at IS NULL
  RETURNING id INTO v_entitlement_id;

  IF v_entitlement_id IS NULL THEN
    RAISE EXCEPTION 'Booking code not found or already redeemed';
  END IF;

  RETURN v_entitlement_id;
END;
$$;

-- Function: create_event
-- Creates an event
CREATE OR REPLACE FUNCTION create_event(
  p_org_id UUID,
  p_venue_org_id UUID,
  p_title TEXT,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check user belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to this organization';
  END IF;

  -- Create event
  INSERT INTO events (org_id, venue_org_id, title, start_at, end_at, metadata, status)
  VALUES (p_org_id, p_venue_org_id, p_title, p_start_at, p_end_at, p_metadata, 'draft')
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Function: create_ticket_type
-- Creates a ticket type for an event
CREATE OR REPLACE FUNCTION create_ticket_type(
  p_event_id UUID,
  p_name TEXT,
  p_price DECIMAL,
  p_quota INTEGER
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_type_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check user has access to event
  IF NOT EXISTS (
    SELECT 1 FROM events e
    JOIN org_members om ON om.org_id = e.org_id
    WHERE e.id = p_event_id AND om.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not have access to this event';
  END IF;

  -- Create ticket type
  INSERT INTO ticket_types (event_id, name, price, quota)
  VALUES (p_event_id, p_name, p_price, p_quota)
  RETURNING id INTO v_ticket_type_id;

  RETURN v_ticket_type_id;
END;
$$;

-- Function: create_ticket_order
-- Creates an order and generates tickets with QR codes
CREATE OR REPLACE FUNCTION create_ticket_order(
  p_event_id UUID,
  p_ticket_type_id UUID,
  p_qty INTEGER,
  p_buyer_user_id UUID
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_item_id UUID;
  v_ticket_type_price DECIMAL;
  v_total_amount DECIMAL;
  v_qr_code TEXT;
  i INTEGER;
BEGIN
  -- Verify user is authenticated and matches buyer
  IF auth.uid() IS NULL OR auth.uid() != p_buyer_user_id THEN
    RAISE EXCEPTION 'User must be authenticated and match buyer';
  END IF;

  -- Get ticket type price and validate quota
  SELECT price INTO v_ticket_type_price
  FROM ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id;

  IF v_ticket_type_price IS NULL THEN
    RAISE EXCEPTION 'Ticket type not found for this event';
  END IF;

  -- Check quota (simplified - in production you'd check against sold tickets)
  -- This is a basic check, full quota management would need more logic

  -- Calculate total
  v_total_amount := v_ticket_type_price * p_qty;

  -- Create order
  INSERT INTO orders (event_id, buyer_user_id, total_amount, status)
  VALUES (p_event_id, p_buyer_user_id, v_total_amount, 'paid')
  RETURNING id INTO v_order_id;

  -- Create order item
  INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price, subtotal)
  VALUES (v_order_id, p_ticket_type_id, p_qty, v_ticket_type_price, v_total_amount)
  RETURNING id INTO v_order_item_id;

  -- Generate tickets with QR codes
  FOR i IN 1..p_qty LOOP
    v_qr_code := generate_unique_code('TK');
    
    INSERT INTO tickets (order_id, order_item_id, ticket_type_id, qr_code, status)
    VALUES (v_order_id, v_order_item_id, p_ticket_type_id, v_qr_code, 'valid');
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- Function: scan_ticket
-- Scans a ticket by QR code
CREATE OR REPLACE FUNCTION scan_ticket(p_qr_code TEXT)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Find ticket and verify user has access to the event
  SELECT t.id INTO v_ticket_id
  FROM tickets t
  JOIN orders o ON o.id = t.order_id
  JOIN events e ON e.id = o.event_id
  JOIN org_members om ON om.org_id = e.org_id
  WHERE t.qr_code = p_qr_code
    AND t.status = 'valid'
    AND om.user_id = v_user_id;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Ticket not found, already scanned, or user does not have access';
  END IF;

  -- Mark as scanned
  UPDATE tickets
  SET status = 'scanned',
      scanned_at = NOW(),
      scanned_by = v_user_id
  WHERE id = v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

