-- Migration: Create safe update function for tracking_links
-- Only allows updating whitelisted fields: label, destination_url, is_active, qr_enabled
-- Explicitly prevents updating slug, host_org_id, affiliate_org_id

-- ============================================================================
-- 1. CREATE FUNCTION update_tracking_link_safe
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_tracking_link_safe(
  p_tracking_link_id UUID,
  p_label TEXT DEFAULT NULL,
  p_destination_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_qr_enabled BOOLEAN DEFAULT NULL
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
  -- Explicitly exclude slug, host_org_id, affiliate_org_id
  UPDATE tracking_links
  SET
    label = COALESCE(p_label, label),
    destination_url = COALESCE(p_destination_url, destination_url),
    is_active = COALESCE(p_is_active, is_active),
    qr_enabled = COALESCE(p_qr_enabled, qr_enabled)
  WHERE id = p_tracking_link_id
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Failed to update tracking link';
  END IF;

  RETURN v_updated_id;
END;
$$;

-- ============================================================================
-- 2. GRANT EXECUTE PERMISSION
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.update_tracking_link_safe(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.update_tracking_link_safe IS 'Safely updates tracking_links with only whitelisted fields (label, destination_url, is_active, qr_enabled). Prevents updating slug, host_org_id, or affiliate_org_id.';
