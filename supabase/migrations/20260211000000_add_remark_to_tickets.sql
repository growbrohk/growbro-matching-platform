-- Migration: Add remark column to tickets table
-- This enables per-ticket remarks/notes for event organizers

-- ============================================================================
-- 1. ADD REMARK COLUMN TO TICKETS TABLE
-- ============================================================================

ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS remark text NULL;

-- ============================================================================
-- 2. COMMENTS
-- ============================================================================

COMMENT ON COLUMN tickets.remark IS 'Optional remark/note for this ticket, editable by event organizers';

-- ============================================================================
-- NOTES
-- ============================================================================
-- RLS Policy: The existing UPDATE policy "Users can update tickets for events in their orgs (for scanning)"
-- already allows updates to tickets for users in the event's org. Since PostgreSQL RLS policies
-- don't restrict specific columns, this policy will automatically allow updates to the remark column.
-- No additional RLS policy changes are needed.
