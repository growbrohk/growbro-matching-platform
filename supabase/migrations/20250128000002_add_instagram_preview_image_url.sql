-- Migration: Add instagram_preview_image_url column to events table

ALTER TABLE events ADD COLUMN instagram_preview_image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN events.instagram_preview_image_url IS 'URL to a preview image for Instagram post (4:5 portrait thumbnail for mobile header)';

