-- Migration: Update event-previews bucket file size limit from 500KB to 10MB
-- Client compresses images to ~70KB before upload; 10MB allows larger source images

UPDATE storage.buckets
SET file_size_limit = 10485760  -- 10MB (10 * 1024 * 1024)
WHERE id = 'event-previews';
