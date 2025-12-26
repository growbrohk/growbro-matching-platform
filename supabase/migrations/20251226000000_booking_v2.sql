-- =====================================================
-- Booking V2 System Migration
-- =====================================================
-- This migration creates a complete booking system separate from legacy bookings

-- =====================================================
-- ENUMS
-- =====================================================

DO $$ BEGIN
  CREATE TYPE booking_resource_type AS ENUM ('space', 'workshop', 'event');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_rule_type AS ENUM ('weekly', 'one_off');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_slot_status AS ENUM ('open', 'closed', 'sold_out');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_reservation_status AS ENUM (
    'pending_payment',
    'confirmed',
    'checked_in',
    'cancelled',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_payment_mode AS ENUM ('manual', 'stripe');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_payment_status AS ENUM (
    'unpaid',
    'proof_submitted',
    'paid',
    'failed',
    'refunded'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_field_type AS ENUM (
    'short_text',
    'long_text',
    'number',
    'phone',
    'email',
    'dropdown',
    'multiple_choice',
    'checkbox',
    'date',
    'time'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- TABLES
-- =====================================================

-- 1) Booking Settings (per org)
CREATE TABLE IF NOT EXISTS booking_settings (
  org_id uuid PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Asia/Hong_Kong',
  allow_manual_payment boolean NOT NULL DEFAULT true,
  allow_stripe boolean NOT NULL DEFAULT false,
  manual_payment_instructions text,
  manual_payment_qr_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Booking Resources (spaces/workshops/events)
CREATE TABLE IF NOT EXISTS booking_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type booking_resource_type NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  location_text text,
  timezone text NOT NULL DEFAULT 'Asia/Hong_Kong',
  active boolean NOT NULL DEFAULT true,
  cover_image_url text,
  base_price_amount int,
  currency text NOT NULL DEFAULT 'HKD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_booking_resources_org_active 
  ON booking_resources(org_id, active);

-- 3) Availability Rules
CREATE TABLE IF NOT EXISTS booking_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES booking_resources(id) ON DELETE CASCADE,
  rule_type booking_rule_type NOT NULL,
  weekday int CHECK (weekday >= 0 AND weekday <= 6),
  start_time_local time NOT NULL,
  end_time_local time NOT NULL,
  start_date date,
  end_date date,
  slot_duration_min int NOT NULL DEFAULT 60,
  buffer_before_min int NOT NULL DEFAULT 0,
  buffer_after_min int NOT NULL DEFAULT 0,
  capacity_per_slot int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_availability_rules_resource 
  ON booking_availability_rules(resource_id, active);

-- 4) Booking Slots (generated or manual)
CREATE TABLE IF NOT EXISTS booking_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES booking_resources(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  capacity int NOT NULL DEFAULT 1,
  status booking_slot_status NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_slots_resource_start 
  ON booking_slots(resource_id, start_at);

CREATE INDEX IF NOT EXISTS idx_booking_slots_start_status 
  ON booking_slots(start_at, status);

-- 5) Form Fields (dynamic booking form)
CREATE TABLE IF NOT EXISTS booking_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES booking_resources(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  field_type booking_field_type NOT NULL,
  required boolean NOT NULL DEFAULT false,
  placeholder text,
  help_text text,
  options jsonb,
  validation jsonb,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(resource_id, key)
);

CREATE INDEX IF NOT EXISTS idx_booking_form_fields_resource 
  ON booking_form_fields(resource_id, active, sort_order);

-- 6) Reservations
CREATE TABLE IF NOT EXISTS booking_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES booking_resources(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES booking_slots(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  customer_email text,
  party_size int NOT NULL DEFAULT 1,
  answers jsonb,
  status booking_reservation_status NOT NULL DEFAULT 'pending_payment',
  payment_mode booking_payment_mode NOT NULL DEFAULT 'manual',
  price_amount int,
  currency text NOT NULL DEFAULT 'HKD',
  referral_code text,
  qr_token text UNIQUE NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_reservations_slot_status 
  ON booking_reservations(slot_id, status);

CREATE INDEX IF NOT EXISTS idx_booking_reservations_qr_token 
  ON booking_reservations(qr_token);

CREATE INDEX IF NOT EXISTS idx_booking_reservations_resource 
  ON booking_reservations(resource_id, status);

CREATE INDEX IF NOT EXISTS idx_booking_reservations_expires 
  ON booking_reservations(expires_at) WHERE status = 'pending_payment';

-- 7) Payment Intents
CREATE TABLE IF NOT EXISTS booking_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES booking_reservations(id) ON DELETE CASCADE,
  provider booking_payment_mode NOT NULL,
  status booking_payment_status NOT NULL DEFAULT 'unpaid',
  amount int NOT NULL,
  currency text NOT NULL DEFAULT 'HKD',
  proof_image_url text,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_payment_intents_reservation 
  ON booking_payment_intents(reservation_id);

-- 8) Check-ins (optional)
CREATE TABLE IF NOT EXISTS booking_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES booking_reservations(id) ON DELETE CASCADE,
  scanned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL,
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_checkins_reservation 
  ON booking_checkins(reservation_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to generate secure random token
CREATE OR REPLACE FUNCTION generate_booking_qr_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS update_booking_settings_updated_at ON booking_settings;
  CREATE TRIGGER update_booking_settings_updated_at
    BEFORE UPDATE ON booking_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_booking_resources_updated_at ON booking_resources;
  CREATE TRIGGER update_booking_resources_updated_at
    BEFORE UPDATE ON booking_resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_booking_availability_rules_updated_at ON booking_availability_rules;
  CREATE TRIGGER update_booking_availability_rules_updated_at
    BEFORE UPDATE ON booking_availability_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_booking_slots_updated_at ON booking_slots;
  CREATE TRIGGER update_booking_slots_updated_at
    BEFORE UPDATE ON booking_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_booking_form_fields_updated_at ON booking_form_fields;
  CREATE TRIGGER update_booking_form_fields_updated_at
    BEFORE UPDATE ON booking_form_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_booking_reservations_updated_at ON booking_reservations;
  CREATE TRIGGER update_booking_reservations_updated_at
    BEFORE UPDATE ON booking_reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_booking_payment_intents_updated_at ON booking_payment_intents;
  CREATE TRIGGER update_booking_payment_intents_updated_at
    BEFORE UPDATE ON booking_payment_intents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END $$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_checkins ENABLE ROW LEVEL SECURITY;

-- Helper function to check org membership
CREATE OR REPLACE FUNCTION is_org_member(p_org_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- BOOKING SETTINGS POLICIES
-- =====================================================

-- Org members can manage their org settings
CREATE POLICY "Org members can view their booking settings"
  ON booking_settings FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Org members can insert their booking settings"
  ON booking_settings FOR INSERT
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Org members can update their booking settings"
  ON booking_settings FOR UPDATE
  USING (is_org_member(org_id));

-- Public can view limited fields (via RPC)
CREATE POLICY "Public can view booking settings limited fields"
  ON booking_settings FOR SELECT
  USING (true);

-- =====================================================
-- BOOKING RESOURCES POLICIES
-- =====================================================

-- Org members can manage their resources
CREATE POLICY "Org members can view their resources"
  ON booking_resources FOR SELECT
  USING (is_org_member(org_id));

CREATE POLICY "Org members can insert resources"
  ON booking_resources FOR INSERT
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Org members can update their resources"
  ON booking_resources FOR UPDATE
  USING (is_org_member(org_id));

CREATE POLICY "Org members can delete their resources"
  ON booking_resources FOR DELETE
  USING (is_org_member(org_id));

-- Public can view active resources
CREATE POLICY "Public can view active resources"
  ON booking_resources FOR SELECT
  USING (active = true);

-- =====================================================
-- AVAILABILITY RULES POLICIES
-- =====================================================

CREATE POLICY "Org members can manage availability rules"
  ON booking_availability_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM booking_resources
      WHERE id = booking_availability_rules.resource_id
      AND is_org_member(org_id)
    )
  );

-- =====================================================
-- BOOKING SLOTS POLICIES
-- =====================================================

CREATE POLICY "Org members can manage slots"
  ON booking_slots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM booking_resources
      WHERE id = booking_slots.resource_id
      AND is_org_member(org_id)
    )
  );

-- Public can view open slots for active resources
CREATE POLICY "Public can view open slots"
  ON booking_slots FOR SELECT
  USING (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM booking_resources
      WHERE id = booking_slots.resource_id
      AND active = true
    )
  );

-- =====================================================
-- FORM FIELDS POLICIES
-- =====================================================

CREATE POLICY "Org members can manage form fields"
  ON booking_form_fields FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM booking_resources
      WHERE id = booking_form_fields.resource_id
      AND is_org_member(org_id)
    )
  );

-- Public can view active form fields for active resources
CREATE POLICY "Public can view form fields"
  ON booking_form_fields FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM booking_resources
      WHERE id = booking_form_fields.resource_id
      AND active = true
    )
  );

-- =====================================================
-- RESERVATIONS POLICIES
-- =====================================================

-- Org members can view all reservations for their resources
CREATE POLICY "Org members can view reservations"
  ON booking_reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM booking_resources
      WHERE id = booking_reservations.resource_id
      AND is_org_member(org_id)
    )
  );

-- Org members can update reservations for their resources
CREATE POLICY "Org members can update reservations"
  ON booking_reservations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM booking_resources
      WHERE id = booking_reservations.resource_id
      AND is_org_member(org_id)
    )
  );

-- Users can view their own reservations
CREATE POLICY "Users can view own reservations"
  ON booking_reservations FOR SELECT
  USING (user_id = auth.uid());

-- Public reservations handled via RPC (no direct insert policy)

-- =====================================================
-- PAYMENT INTENTS POLICIES
-- =====================================================

CREATE POLICY "Org members can view payment intents"
  ON booking_payment_intents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM booking_reservations br
      JOIN booking_resources res ON res.id = br.resource_id
      WHERE br.id = booking_payment_intents.reservation_id
      AND is_org_member(res.org_id)
    )
  );

CREATE POLICY "Org members can update payment intents"
  ON booking_payment_intents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM booking_reservations br
      JOIN booking_resources res ON res.id = br.resource_id
      WHERE br.id = booking_payment_intents.reservation_id
      AND is_org_member(res.org_id)
    )
  );

-- =====================================================
-- CHECKINS POLICIES
-- =====================================================

CREATE POLICY "Org members can manage checkins"
  ON booking_checkins FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM booking_reservations br
      JOIN booking_resources res ON res.id = br.resource_id
      WHERE br.id = booking_checkins.reservation_id
      AND is_org_member(res.org_id)
    )
  );

-- =====================================================
-- RPC FUNCTIONS
-- =====================================================

-- A) Get public booking context
CREATE OR REPLACE FUNCTION public_booking_get_context(
  p_org_slug text,
  p_resource_slug text,
  p_start_date date DEFAULT CURRENT_DATE,
  p_days int DEFAULT 14
)
RETURNS jsonb AS $$
DECLARE
  v_org_id uuid;
  v_resource jsonb;
  v_settings jsonb;
  v_form_fields jsonb;
  v_slots jsonb;
  v_result jsonb;
BEGIN
  -- Get org_id from slug
  SELECT id INTO v_org_id
  FROM orgs
  WHERE slug = p_org_slug;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Get resource
  SELECT to_jsonb(r.*) INTO v_resource
  FROM booking_resources r
  WHERE r.org_id = v_org_id
    AND r.slug = p_resource_slug
    AND r.active = true;

  IF v_resource IS NULL THEN
    RAISE EXCEPTION 'Resource not found or inactive';
  END IF;

  -- Get settings (limited fields for public)
  SELECT jsonb_build_object(
    'allow_manual_payment', s.allow_manual_payment,
    'allow_stripe', s.allow_stripe,
    'manual_payment_instructions', s.manual_payment_instructions,
    'manual_payment_qr_url', s.manual_payment_qr_url,
    'timezone', s.timezone
  ) INTO v_settings
  FROM booking_settings s
  WHERE s.org_id = v_org_id;

  -- Get form fields
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'key', f.key,
      'label', f.label,
      'field_type', f.field_type,
      'required', f.required,
      'placeholder', f.placeholder,
      'help_text', f.help_text,
      'options', f.options,
      'validation', f.validation,
      'sort_order', f.sort_order
    ) ORDER BY f.sort_order
  ) INTO v_form_fields
  FROM booking_form_fields f
  WHERE f.resource_id = (v_resource->>'id')::uuid
    AND f.active = true;

  -- Get available slots
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'start_at', s.start_at,
      'end_at', s.end_at,
      'capacity', s.capacity,
      'available', s.capacity - COALESCE(
        (SELECT COUNT(*)
         FROM booking_reservations r
         WHERE r.slot_id = s.id
         AND r.status IN ('pending_payment', 'confirmed', 'checked_in')
        ), 0
      )
    )
  ) INTO v_slots
  FROM booking_slots s
  WHERE s.resource_id = (v_resource->>'id')::uuid
    AND s.status = 'open'
    AND s.start_at >= p_start_date::timestamptz
    AND s.start_at < (p_start_date + p_days)::timestamptz
  ORDER BY s.start_at;

  -- Build result
  v_result := jsonb_build_object(
    'resource', v_resource,
    'settings', COALESCE(v_settings, '{}'::jsonb),
    'form_fields', COALESCE(v_form_fields, '[]'::jsonb),
    'slots', COALESCE(v_slots, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B) Create reservation (public)
CREATE OR REPLACE FUNCTION public_booking_create_reservation(
  p_org_slug text,
  p_resource_slug text,
  p_slot_id uuid,
  p_party_size int,
  p_answers jsonb,
  p_customer_name text,
  p_customer_phone text DEFAULT NULL,
  p_customer_email text DEFAULT NULL,
  p_referral_code text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_org_id uuid;
  v_resource_id uuid;
  v_resource_price int;
  v_resource_currency text;
  v_slot record;
  v_current_capacity int;
  v_reservation_id uuid;
  v_qr_token text;
  v_payment_intent_id uuid;
BEGIN
  -- Get org
  SELECT id INTO v_org_id FROM orgs WHERE slug = p_org_slug;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Get resource
  SELECT id, base_price_amount, currency INTO v_resource_id, v_resource_price, v_resource_currency
  FROM booking_resources
  WHERE org_id = v_org_id
    AND slug = p_resource_slug
    AND active = true;

  IF v_resource_id IS NULL THEN
    RAISE EXCEPTION 'Resource not found';
  END IF;

  -- Get slot and lock for update
  SELECT * INTO v_slot
  FROM booking_slots
  WHERE id = p_slot_id
    AND resource_id = v_resource_id
    AND status = 'open'
  FOR UPDATE;

  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'Slot not available';
  END IF;

  -- Check capacity
  SELECT COUNT(*) INTO v_current_capacity
  FROM booking_reservations
  WHERE slot_id = p_slot_id
    AND status IN ('pending_payment', 'confirmed', 'checked_in');

  IF v_current_capacity >= v_slot.capacity THEN
    RAISE EXCEPTION 'Slot is full';
  END IF;

  -- Generate QR token
  v_qr_token := generate_booking_qr_token();

  -- Insert reservation
  INSERT INTO booking_reservations (
    resource_id,
    slot_id,
    customer_name,
    customer_phone,
    customer_email,
    party_size,
    answers,
    status,
    payment_mode,
    price_amount,
    currency,
    referral_code,
    qr_token,
    expires_at
  ) VALUES (
    v_resource_id,
    p_slot_id,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_party_size,
    p_answers,
    'pending_payment',
    'manual',
    v_resource_price,
    v_resource_currency,
    p_referral_code,
    v_qr_token,
    now() + interval '30 minutes'
  ) RETURNING id INTO v_reservation_id;

  -- Insert payment intent
  INSERT INTO booking_payment_intents (
    reservation_id,
    provider,
    status,
    amount,
    currency
  ) VALUES (
    v_reservation_id,
    'manual',
    'unpaid',
    COALESCE(v_resource_price, 0),
    v_resource_currency
  ) RETURNING id INTO v_payment_intent_id;

  -- Return summary
  RETURN jsonb_build_object(
    'reservation_id', v_reservation_id,
    'qr_token', v_qr_token,
    'status', 'pending_payment',
    'expires_at', now() + interval '30 minutes',
    'price_amount', v_resource_price,
    'currency', v_resource_currency
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C) Submit payment proof
CREATE OR REPLACE FUNCTION public_booking_submit_proof(
  p_qr_token text,
  p_proof_url text
)
RETURNS jsonb AS $$
DECLARE
  v_reservation_id uuid;
BEGIN
  -- Find reservation
  SELECT id INTO v_reservation_id
  FROM booking_reservations
  WHERE qr_token = p_qr_token
    AND status = 'pending_payment';

  IF v_reservation_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found or already processed';
  END IF;

  -- Update payment intent
  UPDATE booking_payment_intents
  SET status = 'proof_submitted',
      proof_image_url = p_proof_url,
      updated_at = now()
  WHERE reservation_id = v_reservation_id;

  RETURN jsonb_build_object('success', true, 'message', 'Proof submitted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D) Mark as paid (host only)
CREATE OR REPLACE FUNCTION host_booking_mark_paid(p_reservation_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Check permission
  SELECT res.org_id INTO v_org_id
  FROM booking_reservations r
  JOIN booking_resources res ON res.id = r.resource_id
  WHERE r.id = p_reservation_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF NOT is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Update payment intent
  UPDATE booking_payment_intents
  SET status = 'paid',
      paid_at = now()
  WHERE reservation_id = p_reservation_id;

  -- Update reservation status
  UPDATE booking_reservations
  SET status = 'confirmed'
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- E) Check-in by token (host only)
CREATE OR REPLACE FUNCTION host_booking_checkin_by_token(
  p_qr_token text,
  p_device_info text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_reservation record;
  v_org_id uuid;
  v_checkin_id uuid;
BEGIN
  -- Get reservation
  SELECT r.*, res.org_id INTO v_reservation
  FROM booking_reservations r
  JOIN booking_resources res ON res.id = r.resource_id
  WHERE r.qr_token = p_qr_token;

  IF v_reservation IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_token',
      'message', 'Reservation not found'
    );
  END IF;

  v_org_id := v_reservation.org_id;

  -- Check permission
  IF NOT is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Check status
  IF v_reservation.status = 'checked_in' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_checked_in',
      'message', 'Already checked in'
    );
  END IF;

  IF v_reservation.status != 'confirmed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_status',
      'message', 'Reservation must be confirmed first',
      'current_status', v_reservation.status
    );
  END IF;

  -- Update reservation
  UPDATE booking_reservations
  SET status = 'checked_in'
  WHERE id = v_reservation.id;

  -- Record check-in
  INSERT INTO booking_checkins (
    reservation_id,
    scanned_by_user_id,
    result,
    device_info
  ) VALUES (
    v_reservation.id,
    auth.uid(),
    'success',
    p_device_info
  ) RETURNING id INTO v_checkin_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation.id,
    'customer_name', v_reservation.customer_name,
    'party_size', v_reservation.party_size
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- F) Expire pending reservations (to be called via cron)
CREATE OR REPLACE FUNCTION booking_expire_pending()
RETURNS jsonb AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE booking_reservations
  SET status = 'expired'
  WHERE status = 'pending_payment'
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_count', v_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- G) Get reservation by QR token (public, for status page)
CREATE OR REPLACE FUNCTION public_booking_get_reservation(p_qr_token text)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'customer_name', r.customer_name,
    'party_size', r.party_size,
    'price_amount', r.price_amount,
    'currency', r.currency,
    'expires_at', r.expires_at,
    'created_at', r.created_at,
    'qr_token', r.qr_token,
    'slot', jsonb_build_object(
      'start_at', s.start_at,
      'end_at', s.end_at
    ),
    'resource', jsonb_build_object(
      'name', res.name,
      'location_text', res.location_text,
      'type', res.type
    ),
    'payment', (
      SELECT jsonb_build_object(
        'status', pi.status,
        'proof_submitted', pi.proof_image_url IS NOT NULL
      )
      FROM booking_payment_intents pi
      WHERE pi.reservation_id = r.id
      ORDER BY pi.created_at DESC
      LIMIT 1
    )
  ) INTO v_result
  FROM booking_reservations r
  JOIN booking_resources res ON res.id = r.resource_id
  LEFT JOIN booking_slots s ON s.id = r.slot_id
  WHERE r.qr_token = p_qr_token;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant execute on RPC functions to anon and authenticated
GRANT EXECUTE ON FUNCTION public_booking_get_context TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_booking_create_reservation TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_booking_submit_proof TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_booking_get_reservation TO anon, authenticated;
GRANT EXECUTE ON FUNCTION host_booking_mark_paid TO authenticated;
GRANT EXECUTE ON FUNCTION host_booking_checkin_by_token TO authenticated;
GRANT EXECUTE ON FUNCTION booking_expire_pending TO authenticated;

-- Migration complete

