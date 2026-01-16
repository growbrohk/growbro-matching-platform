-- Migration: Add order_type support (event vs product) to orders table
-- This enables orders to be associated with either events or products

-- Add order_type column with default 'event' for existing rows
ALTER TABLE orders
ADD COLUMN order_type TEXT NOT NULL DEFAULT 'event';

-- Add CHECK constraint to enforce allowed values
ALTER TABLE orders
ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('event', 'product'));

-- Make event_id nullable (required for product orders)
ALTER TABLE orders
ALTER COLUMN event_id DROP NOT NULL;

-- Add CHECK constraint to enforce:
-- - order_type = 'event' → event_id IS NOT NULL
-- - order_type = 'product' → event_id IS NULL
ALTER TABLE orders
ADD CONSTRAINT orders_order_type_event_id_check CHECK (
  (order_type = 'event' AND event_id IS NOT NULL) OR
  (order_type = 'product' AND event_id IS NULL)
);
