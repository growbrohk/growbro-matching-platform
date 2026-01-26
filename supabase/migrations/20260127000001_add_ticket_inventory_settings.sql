-- Migration: Add show_remaining_count and threshold_to_show to ticket_types table
-- This allows hosts to control when remaining ticket counts are displayed to customers

-- Add show_remaining_count column (default: true)
ALTER TABLE ticket_types
ADD COLUMN IF NOT EXISTS show_remaining_count BOOLEAN NOT NULL DEFAULT true;

-- Add threshold_to_show column (nullable integer)
-- When set, remaining count is only shown when remaining tickets <= threshold_to_show
ALTER TABLE ticket_types
ADD COLUMN IF NOT EXISTS threshold_to_show INTEGER CHECK (threshold_to_show IS NULL OR threshold_to_show >= 0);

-- Add comment for documentation
COMMENT ON COLUMN ticket_types.show_remaining_count IS 'If true, show remaining ticket count to customers. If false, hide the count.';
COMMENT ON COLUMN ticket_types.threshold_to_show IS 'Optional threshold: only show remaining count when remaining tickets <= this value. NULL means always show (if show_remaining_count is true).';
