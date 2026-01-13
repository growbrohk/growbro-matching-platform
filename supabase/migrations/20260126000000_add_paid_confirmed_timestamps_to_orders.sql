-- Migration: Add paid_at and confirmed_at timestamps to orders table
-- These timestamps track when orders were paid and confirmed

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Add indexes for these timestamp columns for querying
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_confirmed_at ON orders(confirmed_at) WHERE confirmed_at IS NOT NULL;

COMMENT ON COLUMN orders.paid_at IS 'Timestamp when the order was marked as paid';
COMMENT ON COLUMN orders.confirmed_at IS 'Timestamp when the order fulfillment was confirmed';

