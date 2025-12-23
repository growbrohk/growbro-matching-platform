-- ============================================
-- Safe migration: Add is_venue column only if it doesn't exist
-- ============================================
-- Run this if you're getting "column specified more than once" error
-- ============================================

-- First, check if the column already exists and handle accordingly
DO $$
BEGIN
  -- Check if is_venue column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'is_venue'
  ) THEN
    -- Column doesn't exist, add it
    ALTER TABLE public.profiles 
    ADD COLUMN is_venue BOOLEAN DEFAULT false NOT NULL;
    
    RAISE NOTICE 'Added is_venue column to profiles table';
  ELSE
    RAISE NOTICE 'is_venue column already exists, skipping';
  END IF;
END $$;

-- Update existing profiles: if role is 'venue', set is_venue to true
UPDATE public.profiles 
SET is_venue = true 
WHERE role = 'venue' AND (is_venue IS NULL OR is_venue = false);

-- Ensure default is set for role column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'role'
    AND (column_default IS NULL OR column_default != '''brand''::user_role')
  ) THEN
    ALTER TABLE public.profiles 
    ALTER COLUMN role SET DEFAULT 'brand';
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN public.profiles.is_venue IS 'If true, user is also a venue (in addition to being a brand). All users are brands by default.';

