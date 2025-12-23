-- ============================================
-- Fix: Remove duplicate is_venue column if it exists
-- ============================================
-- This migration fixes the case where is_venue column might have been added twice
-- ============================================

-- Check if there are duplicate columns (this shouldn't happen, but just in case)
-- If the column already exists, we'll just ensure it has the right default
DO $$
BEGIN
  -- Ensure is_venue column exists with correct default
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'is_venue'
  ) THEN
    -- Column exists, just ensure it has the right default and NOT NULL constraint
    ALTER TABLE public.profiles 
    ALTER COLUMN is_venue SET DEFAULT false;
    
    -- Set NOT NULL if not already set
    ALTER TABLE public.profiles 
    ALTER COLUMN is_venue SET NOT NULL;
    
    -- Update any NULL values to false
    UPDATE public.profiles 
    SET is_venue = false 
    WHERE is_venue IS NULL;
  ELSE
    -- Column doesn't exist, add it
    ALTER TABLE public.profiles 
    ADD COLUMN is_venue BOOLEAN DEFAULT false NOT NULL;
  END IF;
END $$;

-- Update existing profiles: if role is 'venue', set is_venue to true
UPDATE public.profiles 
SET is_venue = true 
WHERE role = 'venue' AND is_venue = false;

