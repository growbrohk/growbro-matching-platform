-- =====================================================
-- Add short_code to poster_spaces
-- =====================================================
-- Adds a unique short code (7 chars) for public URLs
-- Backfills existing rows with deterministic codes
-- Enforces NOT NULL constraint

-- Step 1: Add column (nullable initially)
ALTER TABLE poster_spaces
ADD COLUMN IF NOT EXISTS short_code text;

-- Step 2: Create unique index (allows nulls initially)
CREATE UNIQUE INDEX IF NOT EXISTS idx_poster_spaces_short_code 
ON poster_spaces(short_code) 
WHERE short_code IS NOT NULL;

-- Step 3: Backfill existing rows with deterministic codes
-- Use MD5 hash of UUID, convert hex to Base62-like by mapping hex digits to Base62 chars
-- Simple approach: use first 7 hex chars, map a-f to A-F, then pad with numbers if needed
-- This creates deterministic codes that are Base62-compatible
UPDATE poster_spaces
SET short_code = UPPER(
  SUBSTRING(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      MD5(id::text),
      'a', 'A'), 'b', 'B'), 'c', 'C'), 'd', 'D'), 'e', 'E'), 'f', 'F'),
    1,
    7
  )
)
WHERE short_code IS NULL;

-- Step 4: Handle collisions by extending to 8 chars for duplicates
-- Find rows with duplicate short_codes and extend them
WITH duplicates AS (
  SELECT id, short_code,
    ROW_NUMBER() OVER (PARTITION BY short_code ORDER BY created_at) as rn
  FROM poster_spaces
  WHERE short_code IS NOT NULL
),
to_fix AS (
  SELECT id, short_code
  FROM duplicates
  WHERE rn > 1
)
UPDATE poster_spaces ps
SET short_code = UPPER(
  SUBSTRING(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      MD5(ps.id::text),
      'a', 'A'), 'b', 'B'), 'c', 'C'), 'd', 'D'), 'e', 'E'), 'f', 'F'),
    1,
    8
  )
)
FROM to_fix tf
WHERE ps.id = tf.id;

-- Step 5: Enforce NOT NULL constraint
ALTER TABLE poster_spaces
ALTER COLUMN short_code SET NOT NULL;

-- Step 6: Add index for faster lookups by short_code
CREATE INDEX IF NOT EXISTS idx_poster_spaces_short_code_lookup 
ON poster_spaces(short_code);

-- Step 7: Update RLS policy to allow public access by short_code
-- The existing "Public can view published poster spaces" policy already covers this
-- since it checks status = 'published', which works for any SELECT query

COMMENT ON COLUMN poster_spaces.short_code IS 'Unique 7-8 character code for public URLs. Format: /space/:shortCode-:orgSlug';

