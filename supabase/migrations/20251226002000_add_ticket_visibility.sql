-- =====================================================
-- Add ticket visibility controls to ticket_types
-- =====================================================
-- Adds visibility_mode, access_code, and allowed_affiliates columns
-- to support code-gated and affiliate-gated ticket types

-- 1) Add visibility_mode column with default 'public'
ALTER TABLE ticket_types 
  ADD COLUMN IF NOT EXISTS visibility_mode text NOT NULL DEFAULT 'public';

-- 2) Add CHECK constraint to restrict visibility_mode values
ALTER TABLE ticket_types
  DROP CONSTRAINT IF EXISTS ticket_types_visibility_mode_check;

ALTER TABLE ticket_types
  ADD CONSTRAINT ticket_types_visibility_mode_check 
  CHECK (visibility_mode IN ('public', 'code', 'affiliate', 'hidden'));

-- 3) Add access_code column (nullable, for code-gated tickets)
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS access_code text;

-- 4) Add allowed_affiliates column (nullable array, for affiliate-gated tickets)
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS allowed_affiliates text[];

-- 5) Create index on visibility_mode for faster filtering
CREATE INDEX IF NOT EXISTS idx_ticket_types_visibility_mode 
  ON ticket_types(visibility_mode) 
  WHERE visibility_mode != 'public';

-- 6) Create index on access_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_ticket_types_access_code 
  ON ticket_types(access_code) 
  WHERE access_code IS NOT NULL;

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON COLUMN ticket_types.visibility_mode IS 'Controls who can see this ticket: public (default), code (requires ?code=XXX), affiliate (requires ?ref=XXX), or hidden';
COMMENT ON COLUMN ticket_types.access_code IS 'Access code required to view this ticket when visibility_mode is "code"';
COMMENT ON COLUMN ticket_types.allowed_affiliates IS 'Array of affiliate slugs allowed to view this ticket when visibility_mode is "affiliate". If null/empty, any affiliate ref unlocks it';

