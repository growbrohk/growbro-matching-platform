-- Migration: Add collect_attendee_info column to events table
-- This enables per-ticket vs primary attendee collection mode

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS collect_attendee_info TEXT DEFAULT 'primary' 
CHECK (collect_attendee_info IN ('primary', 'per_ticket'));

-- Add comment for documentation
COMMENT ON COLUMN events.collect_attendee_info IS 'Attendee information collection mode: "primary" collects info for the booker only, "per_ticket" collects info for each individual ticket';

