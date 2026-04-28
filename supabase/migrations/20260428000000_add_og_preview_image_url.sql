-- Migration: Add og_preview_image_url for Facebook/WhatsApp Open Graph previews

ALTER TABLE events ADD COLUMN IF NOT EXISTS og_preview_image_url TEXT;

COMMENT ON COLUMN events.og_preview_image_url IS
  'Optional landscape image URL for Facebook/WhatsApp link previews (1.91:1 e.g. 1200×630); preferred over instagram_preview_image_url for OG tags';
