-- Migration: Create RPC function to get ticket types with remaining count
-- This function calculates remaining tickets by counting tickets with status 'valid' or 'scanned'

CREATE OR REPLACE FUNCTION get_ticket_types_with_remaining(p_event_id UUID)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  name TEXT,
  price DECIMAL(10,2),
  quota INTEGER,
  metadata JSONB,
  visibility_mode TEXT,
  access_code TEXT,
  allowed_affiliates TEXT[],
  is_active BOOLEAN,
  availability_mode TEXT,
  available_start_at TIMESTAMPTZ,
  available_end_at TIMESTAMPTZ,
  show_remaining_count BOOLEAN,
  threshold_to_show INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  remaining_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tt.id,
    tt.event_id,
    tt.name,
    tt.price,
    tt.quota,
    tt.metadata,
    tt.visibility_mode,
    tt.access_code,
    tt.allowed_affiliates,
    tt.is_active,
    tt.availability_mode,
    tt.available_start_at,
    tt.available_end_at,
    tt.show_remaining_count,
    tt.threshold_to_show,
    tt.created_at,
    tt.updated_at,
    -- Calculate remaining: quota - count of tickets with status 'valid' or 'scanned'
    GREATEST(0, tt.quota - COALESCE(
      (SELECT COUNT(*)::BIGINT
       FROM tickets t
       WHERE t.ticket_type_id = tt.id
       AND t.status IN ('valid', 'scanned')),
      0
    )) AS remaining_count
  FROM ticket_types tt
  WHERE tt.event_id = p_event_id
  ORDER BY tt.created_at ASC;
END;
$$;

-- Grant execute permission to authenticated users and anon (for public event pages)
GRANT EXECUTE ON FUNCTION get_ticket_types_with_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ticket_types_with_remaining(UUID) TO anon;

COMMENT ON FUNCTION get_ticket_types_with_remaining(UUID) IS 'Returns ticket types for an event with calculated remaining_count (quota - sold tickets with status valid/scanned)';
