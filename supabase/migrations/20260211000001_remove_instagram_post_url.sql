-- Migration: Remove instagram_post_url column from events table

ALTER TABLE public.events DROP COLUMN IF EXISTS instagram_post_url;
