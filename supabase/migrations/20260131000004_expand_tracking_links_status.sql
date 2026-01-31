-- Migration: Expand tracking_links.status to support payout lifecycle
-- Adds 'payment_pending' and 'paid' statuses for affiliate links
-- Existing statuses: 'pending', 'active', 'inactive'
-- New statuses: 'payment_pending', 'paid'

-- ============================================================================
-- 1. DROP OLD CONSTRAINT AND ADD NEW ONE
-- ============================================================================

-- Drop the old constraint
ALTER TABLE public.tracking_links
DROP CONSTRAINT IF EXISTS tracking_links_status_check;

-- Add new constraint with expanded status values
ALTER TABLE public.tracking_links
ADD CONSTRAINT tracking_links_status_check 
CHECK (status IN ('pending', 'active', 'inactive', 'payment_pending', 'paid'));

-- ============================================================================
-- 2. UPDATE update_tracking_link_safe FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_tracking_link_safe(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_tracking_link_safe(
  p_tracking_link_id UUID,
  p_label TEXT DEFAULT NULL,
  p_destination_url TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_host_org_id UUID;
  v_updated_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Validate status if provided (now includes payment_pending and paid)
  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'active', 'inactive', 'payment_pending', 'paid') THEN
    RAISE EXCEPTION 'Invalid status. Must be pending, active, inactive, payment_pending, or paid';
  END IF;

  -- Verify user has permission (must be member of host_org_id)
  SELECT host_org_id INTO v_host_org_id
  FROM tracking_links
  WHERE id = p_tracking_link_id;

  IF v_host_org_id IS NULL THEN
    RAISE EXCEPTION 'Tracking link not found';
  END IF;

  -- Check if user is member of host org
  IF NOT EXISTS (
    SELECT 1 FROM org_members om
    WHERE om.org_id = v_host_org_id
    AND om.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User does not have permission to update this tracking link';
  END IF;

  -- Update only whitelisted fields
  UPDATE tracking_links
  SET
    label = COALESCE(p_label, label),
    destination_url = COALESCE(p_destination_url, destination_url),
    status = COALESCE(p_status, status)
  WHERE id = p_tracking_link_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Failed to update tracking link';
  END IF;

  RETURN v_updated_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tracking_link_safe(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_tracking_link_safe IS 'Safely updates tracking_links with only whitelisted fields (label, destination_url, status). Supports statuses: pending, active, inactive, payment_pending, paid.';

-- ============================================================================
-- 3. UPDATE check_expired_affiliate_links FUNCTION
-- ============================================================================
-- Note: This function should check for revenue and set payment_pending if revenue > 0
-- For now, we'll keep it simple and set to inactive. The payment_pending transition
-- will be handled by application logic or a separate function later.

CREATE OR REPLACE FUNCTION public.check_expired_affiliate_links()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set status to inactive for affiliate links where end_date has passed
  -- Note: Application logic should check revenue and set payment_pending if revenue > 0
  UPDATE tracking_links
  SET status = 'inactive'
  WHERE type = 'affiliate'
    AND status = 'active'
    AND end_date IS NOT NULL
    AND end_date < now();
END;
$$;

COMMENT ON FUNCTION public.check_expired_affiliate_links IS 'Sets status to inactive for affiliate links where end_date has passed. Application logic should check revenue and set payment_pending if revenue > 0.';

-- ============================================================================
-- 4. CREATE HELPER FUNCTION FOR STATUS TRANSITIONS (optional, for future use)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_tracking_link_status(
  p_tracking_link_id UUID,
  p_new_status TEXT
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_host_org_id UUID;
  v_affiliate_org_id UUID;
  v_updated_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Validate status
  IF p_new_status NOT IN ('pending', 'active', 'inactive', 'payment_pending', 'paid') THEN
    RAISE EXCEPTION 'Invalid status. Must be pending, active, inactive, payment_pending, or paid';
  END IF;

  -- Get org IDs
  SELECT host_org_id, affiliate_org_id 
  INTO v_host_org_id, v_affiliate_org_id
  FROM tracking_links
  WHERE id = p_tracking_link_id;

  IF v_host_org_id IS NULL THEN
    RAISE EXCEPTION 'Tracking link not found';
  END IF;

  -- Check if user is member of host org OR affiliate org
  IF NOT EXISTS (
    SELECT 1 FROM org_members om
    WHERE om.user_id = v_user_id
    AND (om.org_id = v_host_org_id OR om.org_id = v_affiliate_org_id)
  ) THEN
    RAISE EXCEPTION 'User does not have permission to update this tracking link';
  END IF;

  -- Update status
  UPDATE tracking_links
  SET status = p_new_status
  WHERE id = p_tracking_link_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Failed to update tracking link status';
  END IF;

  RETURN v_updated_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tracking_link_status(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_tracking_link_status IS 'Updates tracking_link status. User must be member of host_org_id or affiliate_org_id. Supports all status values: pending, active, inactive, payment_pending, paid.';

-- ============================================================================
-- 5. ADD PARTIAL INDEXES FOR NEW STATUSES (optional, for performance)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tracking_links_status_payment_pending 
ON tracking_links(status) 
WHERE status = 'payment_pending';

CREATE INDEX IF NOT EXISTS idx_tracking_links_status_paid 
ON tracking_links(status) 
WHERE status = 'paid';
