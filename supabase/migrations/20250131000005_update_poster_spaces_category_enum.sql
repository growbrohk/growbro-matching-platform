-- =====================================================
-- Update Poster Spaces Category Enum
-- =====================================================
-- Adds new category values while maintaining backward compatibility
-- Maps old 'poster' to 'poster_space' for consistency

-- Step 1: Drop the old CHECK constraint
ALTER TABLE poster_spaces DROP CONSTRAINT IF EXISTS poster_spaces_category_check;

-- Step 2: Migrate old 'poster' values to 'poster_space' for consistency
UPDATE poster_spaces 
SET category = 'poster_space' 
WHERE category = 'poster';

-- Step 3: Add new CHECK constraint with all valid values
ALTER TABLE poster_spaces 
ADD CONSTRAINT poster_spaces_category_check 
CHECK (category IN (
  'poster_space',
  'consignment_shelf',
  'cup_sleeve_promotion',
  'event_hosting',
  -- Legacy values for backward compatibility
  'shelf',
  'booth',
  'counter',
  'other'
));

-- Step 4: Update default value to use new enum
ALTER TABLE poster_spaces 
ALTER COLUMN category SET DEFAULT 'poster_space';

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON COLUMN poster_spaces.category IS 'Space category type. New values: poster_space, consignment_shelf, cup_sleeve_promotion, event_hosting. Legacy values (shelf, booth, counter, other) are maintained for backward compatibility.';

