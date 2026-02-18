-- Migration: Add image_url column to products table
-- This enables storing product photo URLs

ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN products.image_url IS 'URL to the product photo image (stored in product-images bucket)';
