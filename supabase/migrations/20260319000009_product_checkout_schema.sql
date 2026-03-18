-- Product checkout: org payment settings, order_items for products, host_org_id
-- Enables Shopify-style product payment flow on brand public pages

-- ============================================================================
-- 1. ORG-LEVEL PAYMENT SETTINGS (for product sales)
-- ============================================================================
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS enable_stripe BOOLEAN DEFAULT false;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS enable_payme BOOLEAN DEFAULT false;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS enable_fps BOOLEAN DEFAULT false;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS payme_link TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS fps_link TEXT;

COMMENT ON COLUMN org_profiles.enable_stripe IS 'Enable Stripe card payment for product sales';
COMMENT ON COLUMN org_profiles.enable_payme IS 'Enable PayMe for product sales';
COMMENT ON COLUMN org_profiles.enable_fps IS 'Enable FPS for product sales';
COMMENT ON COLUMN org_profiles.payme_link IS 'PayMe payment link for product sales';
COMMENT ON COLUMN org_profiles.fps_link IS 'FPS payment link for product sales';

-- ============================================================================
-- 2. ORDERS: host_org_id for product orders (seller org)
-- ============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS host_org_id UUID REFERENCES orgs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_host_org_id ON orders(host_org_id) WHERE host_org_id IS NOT NULL;
COMMENT ON COLUMN orders.host_org_id IS 'Seller org for product orders; used for payment config and host order views';

-- ============================================================================
-- 3. ORDER_ITEMS: metadata for product info, nullable ticket_type_id
-- ============================================================================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
COMMENT ON COLUMN order_items.metadata IS 'Product order: product_id, variant_id, product_name, variant_label, is_product_order';

-- Make ticket_type_id nullable for product orders (product orders use metadata, not ticket_types)
ALTER TABLE order_items ALTER COLUMN ticket_type_id DROP NOT NULL;

-- ============================================================================
-- 4. RLS: Allow host org members to view product orders
-- ============================================================================
CREATE POLICY "Org members can view product orders for their org"
  ON orders FOR SELECT
  USING (
    host_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = orders.host_org_id
      AND om.user_id = auth.uid()
    )
  );

-- Allow org members to update product orders (for fulfillment, payment confirmation)
CREATE POLICY "Org members can update product orders for their org"
  ON orders FOR UPDATE
  USING (
    host_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = orders.host_org_id
      AND om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. ORDER_ITEMS RLS: Add host_org_id path for product orders
-- ============================================================================
DROP POLICY IF EXISTS "Users can view order items for their orders or events in their orgs" ON order_items;
CREATE POLICY "Users can view order items for their orders or events in their orgs"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND (
        (o.buyer_user_id IS NOT NULL AND o.buyer_user_id = auth.uid())
        OR
        (
          o.buyer_user_id IS NULL
          AND o.buyer_email IS NOT NULL
          AND (auth.jwt() ->> 'email') IS NOT NULL
          AND o.buyer_email = (auth.jwt() ->> 'email')
        )
        OR
        (o.created_at > NOW() - INTERVAL '1 hour')
        OR
        EXISTS (
          SELECT 1 FROM events e
          JOIN org_members om ON om.org_id = e.org_id
          WHERE e.id = o.event_id
          AND om.user_id = auth.uid()
        )
        OR
        (o.host_org_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM org_members om
          WHERE om.org_id = o.host_org_id
          AND om.user_id = auth.uid()
        ))
      )
    )
  );
