-- Migration: Add stripe_checkout_session_id to orders for refunds and support
-- Store Stripe Checkout Session ID when creating a session for future refunds

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_checkout_session_id
ON orders(stripe_checkout_session_id)
WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON COLUMN orders.stripe_checkout_session_id IS 'Stripe Checkout Session ID for refunds and support';
