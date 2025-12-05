-- ============================================
-- Fix Missing Foreign Key Constraints
-- ============================================
-- This migration fixes missing foreign key constraints
-- that were not included in the original venue_collab_options migration
-- ============================================

-- Add foreign key constraint for venue_user_id in venue_collab_options
-- (Only if the constraint doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'venue_collab_options_venue_user_id_fkey'
  ) THEN
    ALTER TABLE public.venue_collab_options
    ADD CONSTRAINT venue_collab_options_venue_user_id_fkey
    FOREIGN KEY (venue_user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key constraint for collab_request_id in collab_request_venue_options
-- (Only if the constraint doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'collab_request_venue_options_collab_request_id_fkey'
  ) THEN
    ALTER TABLE public.collab_request_venue_options
    ADD CONSTRAINT collab_request_venue_options_collab_request_id_fkey
    FOREIGN KEY (collab_request_id) 
    REFERENCES public.collab_requests(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key constraint for venue_collab_option_id in collab_request_venue_options
-- (Only if the constraint doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'collab_request_venue_options_venue_collab_option_id_fkey'
  ) THEN
    ALTER TABLE public.collab_request_venue_options
    ADD CONSTRAINT collab_request_venue_options_venue_collab_option_id_fkey
    FOREIGN KEY (venue_collab_option_id) 
    REFERENCES public.venue_collab_options(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

