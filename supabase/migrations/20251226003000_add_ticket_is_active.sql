-- =====================================================
-- Add is_active column to ticket_types
-- =====================================================
-- Adds manual on/off toggle for ticket types, independent of time-based availability

-- Add is_active column with default true
ALTER TABLE ticket_types 
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Create index for faster filtering of active tickets
CREATE INDEX IF NOT EXISTS idx_ticket_types_is_active 
  ON ticket_types(is_active) 
  WHERE is_active = false;

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON COLUMN ticket_types.is_active IS 'Manual admin-controlled toggle. When false, ticket is not available for purchase regardless of schedule. Defaults to true.';

