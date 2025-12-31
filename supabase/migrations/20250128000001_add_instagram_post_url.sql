-- Migration: Add instagram_post_url column to events table

ALTER TABLE events ADD COLUMN instagram_post_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN events.instagram_post_url IS 'URL to a public Instagram post/reel for embedding in event preview';

