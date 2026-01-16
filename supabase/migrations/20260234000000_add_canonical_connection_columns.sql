-- ============================================================================
-- Migration: Add canonical connection columns (org_low_id, org_high_id)
-- Purpose: Refactor connections to canonical-pair design (Facebook-style)
--          to remove org_a/org_b ambiguity and prevent duplicates
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD COLUMNS (nullable first)
-- ============================================================================

ALTER TABLE connections
  ADD COLUMN org_low_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
  ADD COLUMN org_high_id UUID REFERENCES orgs(id) ON DELETE CASCADE;

-- ============================================================================
-- 2. BACKFILL EXISTING ROWS
-- ============================================================================

UPDATE connections
SET 
  org_low_id = LEAST(org_a_id, org_b_id),
  org_high_id = GREATEST(org_a_id, org_b_id);

-- ============================================================================
-- 3. ADD NOT NULL CONSTRAINTS
-- ============================================================================

ALTER TABLE connections
  ALTER COLUMN org_low_id SET NOT NULL,
  ALTER COLUMN org_high_id SET NOT NULL;

-- ============================================================================
-- 4. ADD UNIQUE CONSTRAINT ON (org_low_id, org_high_id)
-- ============================================================================

-- Drop the old unique constraint if it exists (we'll keep it for backward compatibility)
-- Actually, let's keep the old constraint and add a new one
-- The old constraint ensures no duplicates with org_a_id/org_b_id
-- The new constraint ensures no duplicates with org_low_id/org_high_id
CREATE UNIQUE INDEX IF NOT EXISTS connections_unique_canonical_pair 
  ON connections(org_low_id, org_high_id);

-- ============================================================================
-- 5. ADD INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for querying by org_low_id
CREATE INDEX IF NOT EXISTS idx_connections_org_low_id 
  ON connections(org_low_id);

-- Index for querying by org_high_id
CREATE INDEX IF NOT EXISTS idx_connections_org_high_id 
  ON connections(org_high_id);

-- Combined index for common query pattern: WHERE (org_low_id = X OR org_high_id = X)
-- PostgreSQL can use both indexes with bitmap index scan, but a composite index
-- on (org_low_id, org_high_id) helps with the unique constraint lookup
-- The unique constraint index already covers this, so we're good

-- Index for querying by org_low_id and status
CREATE INDEX IF NOT EXISTS idx_connections_org_low_status 
  ON connections(org_low_id, status);

-- Index for querying by org_high_id and status
CREATE INDEX IF NOT EXISTS idx_connections_org_high_status 
  ON connections(org_high_id, status);

-- ============================================================================
-- 6. ADD CHECK CONSTRAINT TO ENSURE org_low_id <> org_high_id
-- ============================================================================

ALTER TABLE connections
  ADD CONSTRAINT connections_canonical_different_orgs_check 
  CHECK (org_low_id <> org_high_id);

-- ============================================================================
-- 7. ADD CHECK CONSTRAINT TO ENSURE org_low_id < org_high_id
-- ============================================================================

ALTER TABLE connections
  ADD CONSTRAINT connections_canonical_order_check 
  CHECK (org_low_id < org_high_id);

-- ============================================================================
-- 8. ADD COMMENTS
-- ============================================================================

COMMENT ON COLUMN connections.org_low_id IS 'Canonical pair: smaller UUID (LEAST(org_a_id, org_b_id))';
COMMENT ON COLUMN connections.org_high_id IS 'Canonical pair: larger UUID (GREATEST(org_a_id, org_b_id))';

COMMIT;
