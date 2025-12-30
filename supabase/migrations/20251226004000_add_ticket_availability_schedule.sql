-- =====================================================
-- Add availability schedule controls to ticket_types
-- =====================================================
-- Adds availability_mode, available_start_at, and available_end_at columns
-- to support time-based availability rules (Layer 2 of availability control)

-- 1) Add availability_mode column with default 'always'
ALTER TABLE ticket_types 
  ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'always';

-- 2) Add CHECK constraint to restrict availability_mode values
ALTER TABLE ticket_types
  DROP CONSTRAINT IF EXISTS ticket_types_availability_mode_check;

ALTER TABLE ticket_types
  ADD CONSTRAINT ticket_types_availability_mode_check 
  CHECK (availability_mode IN ('always', 'scheduled'));

-- 3) Add available_start_at column (nullable, for scheduled tickets)
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS available_start_at timestamptz;

-- 4) Add available_end_at column (nullable, for scheduled tickets)
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS available_end_at timestamptz;

-- 5) Create indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_ticket_types_availability_mode 
  ON ticket_types(availability_mode) 
  WHERE availability_mode = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_ticket_types_available_start_at 
  ON ticket_types(available_start_at) 
  WHERE available_start_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_types_available_end_at 
  ON ticket_types(available_end_at) 
  WHERE available_end_at IS NOT NULL;

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON COLUMN ticket_types.availability_mode IS 'Controls time-based availability: always (default) or scheduled (requires start/end times)';
COMMENT ON COLUMN ticket_types.available_start_at IS 'When scheduled tickets become available for purchase. Only used when availability_mode is "scheduled".';
COMMENT ON COLUMN ticket_types.available_end_at IS 'When scheduled tickets stop being available for purchase. Only used when availability_mode is "scheduled". Hard cutoff always applies at event.end_at.';

