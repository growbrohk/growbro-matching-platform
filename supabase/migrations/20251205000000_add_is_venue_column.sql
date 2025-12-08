-- ============================================
-- Add is_venue column to profiles table
-- ============================================
-- This migration adds an is_venue boolean column to support dual roles.
-- All users are brands by default. If they have a physical shop, they're also a venue.
-- ============================================

-- Add is_venue column (default false, all users are brands by default)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_venue BOOLEAN DEFAULT false NOT NULL;

-- Update existing profiles: if role is 'venue', set is_venue to true
-- (for backward compatibility with existing data)
UPDATE public.profiles 
SET is_venue = true 
WHERE role = 'venue';

-- Set default role to 'brand' for new profiles (if not already set)
-- Note: This is handled in application code, but we ensure the constraint allows it
ALTER TABLE public.profiles 
ALTER COLUMN role SET DEFAULT 'brand';

-- Add comment to explain the dual role system
COMMENT ON COLUMN public.profiles.is_venue IS 'If true, user is also a venue (in addition to being a brand). All users are brands by default.';

