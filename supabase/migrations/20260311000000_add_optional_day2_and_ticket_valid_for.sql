-- =====================================================
-- Add optional Day 2 to events and valid_for_days to ticket_types
-- =====================================================
-- Supports multi-day events: Day 1 (start_at/end_at) + optional Day 2
-- Ticket types can be "Day 1 only", "Day 2 only", or "Both days"

-- 1) Add day_2_start_at and day_2_end_at to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS day_2_start_at timestamptz;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS day_2_end_at timestamptz;

-- 2) Add CHECK: when both day_2 are set, end > start; when one is set, both must be set
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_day_2_times_check;

ALTER TABLE events
  ADD CONSTRAINT events_day_2_times_check CHECK (
    (day_2_start_at IS NULL AND day_2_end_at IS NULL)
    OR
    (day_2_start_at IS NOT NULL AND day_2_end_at IS NOT NULL AND day_2_end_at > day_2_start_at)
  );

COMMENT ON COLUMN events.day_2_start_at IS 'Optional Day 2 start time. When set, day_2_end_at must also be set.';
COMMENT ON COLUMN events.day_2_end_at IS 'Optional Day 2 end time. When set, day_2_start_at must also be set.';

-- 3) Add valid_for_days to ticket_types
ALTER TABLE ticket_types
  ADD COLUMN IF NOT EXISTS valid_for_days text NOT NULL DEFAULT 'day_1';

-- 4) Add CHECK constraint for valid_for_days
ALTER TABLE ticket_types
  DROP CONSTRAINT IF EXISTS ticket_types_valid_for_days_check;

ALTER TABLE ticket_types
  ADD CONSTRAINT ticket_types_valid_for_days_check
  CHECK (valid_for_days IN ('day_1', 'day_2', 'both'));

COMMENT ON COLUMN ticket_types.valid_for_days IS 'Which day(s) this ticket type grants access: day_1, day_2, or both. Only relevant when event has 2 days.';
