-- ============================================
-- Add is_venue column to profiles table
-- ============================================
-- This migration adds an is_venue boolean column to support dual roles.
-- All users are brands by default. If they have a physical shop, they're also a venue.
-- ============================================

-- Check if column exists before adding (safe for existing databases)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'is_venue'
  ) THEN
    -- Add is_venue column (default false, all users are brands by default)
    ALTER TABLE public.profiles 
    ADD COLUMN is_venue BOOLEAN DEFAULT false NOT NULL;
  END IF;
END $$;

-- Update existing profiles: if role is 'venue', set is_venue to true
-- (for backward compatibility with existing data)
UPDATE public.profiles 
SET is_venue = true 
WHERE role = 'venue' AND (is_venue IS NULL OR is_venue = false);

-- Set default role to 'brand' for new profiles (if not already set)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'role'
    AND column_default IS NULL
  ) THEN
    ALTER TABLE public.profiles 
    ALTER COLUMN role SET DEFAULT 'brand';
  END IF;
END $$;

-- Add comment to explain the dual role system
COMMENT ON COLUMN public.profiles.is_venue IS 'If true, user is also a venue (in addition to being a brand). All users are brands by default.';

