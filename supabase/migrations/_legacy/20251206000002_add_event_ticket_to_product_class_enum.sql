-- ============================================
-- Add 'event_ticket' to product_class enum
-- ============================================
-- This migration adds 'event_ticket' as a valid value for the product_class enum

-- Add 'event_ticket' to the product_class enum
-- Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE
-- So we need to check first and handle errors gracefully
DO $$ 
BEGIN
  -- Check if 'event_ticket' already exists in the enum
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'product_class' 
    AND e.enumlabel = 'event_ticket'
  ) THEN
    -- Add the new enum value
    ALTER TYPE public.product_class ADD VALUE 'event_ticket';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- If it already exists, just continue
    NULL;
END $$;

-- Verify the enum now includes event_ticket
-- You can check with: SELECT unnest(enum_range(NULL::product_class));

