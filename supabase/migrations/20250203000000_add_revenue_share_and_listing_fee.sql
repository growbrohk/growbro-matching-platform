-- =====================================================
-- Add Revenue Share and Listing Fee to Poster Spaces
-- =====================================================
-- Adds default_host_split_percent and listing_fee_cents columns
-- to poster_spaces table for collab search results display

-- Add columns
ALTER TABLE poster_spaces
  ADD COLUMN IF NOT EXISTS default_host_split_percent numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS listing_fee_cents integer NOT NULL DEFAULT 0;

-- Backfill existing rows (set defaults where null)
UPDATE poster_spaces
SET 
  default_host_split_percent = 10
WHERE default_host_split_percent IS NULL;

UPDATE poster_spaces
SET 
  listing_fee_cents = 0
WHERE listing_fee_cents IS NULL;

-- Add comments
COMMENT ON COLUMN poster_spaces.default_host_split_percent IS 'Default revenue share percentage for the host (0-100)';
COMMENT ON COLUMN poster_spaces.listing_fee_cents IS 'Listing fee in HKD cents';

