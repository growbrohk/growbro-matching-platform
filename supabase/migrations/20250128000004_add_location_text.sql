-- Migration: Add location_text column to events table

ALTER TABLE events ADD COLUMN location_text TEXT;

-- Add comment for documentation
COMMENT ON COLUMN events.location_text IS 'Free-text location/venue description (e.g., "Koko Coffee @ G10, The Mills")';

