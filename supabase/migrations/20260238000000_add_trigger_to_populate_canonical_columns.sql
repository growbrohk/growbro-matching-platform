-- ============================================================================
-- Migration: Add trigger to automatically populate canonical columns
-- Purpose: Ensure org_low_id/org_high_id are always set correctly,
--          even if inserts happen directly (bypassing RPC functions)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION ensure_canonical_connection_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If org_low_id or org_high_id are NULL, compute them from org_a_id/org_b_id
  IF NEW.org_low_id IS NULL OR NEW.org_high_id IS NULL THEN
    IF NEW.org_a_id IS NOT NULL AND NEW.org_b_id IS NOT NULL THEN
      NEW.org_low_id := LEAST(NEW.org_a_id, NEW.org_b_id);
      NEW.org_high_id := GREATEST(NEW.org_a_id, NEW.org_b_id);
    ELSE
      RAISE EXCEPTION 'Cannot compute canonical columns: org_a_id and org_b_id must be set';
    END IF;
  END IF;
  
  -- Ensure org_low_id < org_high_id (enforced by constraint, but validate here too)
  IF NEW.org_low_id >= NEW.org_high_id THEN
    RAISE EXCEPTION 'org_low_id must be less than org_high_id';
  END IF;
  
  -- Also ensure org_a_id/org_b_id match canonical columns for backward compatibility
  -- If org_a_id/org_b_id are NULL, set them from canonical columns
  IF NEW.org_a_id IS NULL OR NEW.org_b_id IS NULL THEN
    IF NEW.org_low_id IS NOT NULL AND NEW.org_high_id IS NOT NULL THEN
      NEW.org_a_id := NEW.org_low_id;
      NEW.org_b_id := NEW.org_high_id;
    ELSE
      RAISE EXCEPTION 'Cannot compute org_a_id/org_b_id: org_low_id and org_high_id must be set';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. CREATE TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS connections_ensure_canonical_columns ON connections;

CREATE TRIGGER connections_ensure_canonical_columns
  BEFORE INSERT OR UPDATE ON connections
  FOR EACH ROW
  EXECUTE FUNCTION ensure_canonical_connection_columns();

COMMENT ON FUNCTION ensure_canonical_connection_columns IS 
  'Trigger function to ensure org_low_id/org_high_id are always set correctly. '
  'Computes from org_a_id/org_b_id if needed, or vice versa for backward compatibility.';

COMMIT;
