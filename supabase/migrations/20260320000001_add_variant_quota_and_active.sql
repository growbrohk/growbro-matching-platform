-- =====================================================
-- Add quota and is_active to ticket_type_access_variants
-- Add ticket_type_access_variant_id to order_items for tracking sales per variant
-- =====================================================

-- 1) Add quota and is_active to ticket_type_access_variants
ALTER TABLE ticket_type_access_variants
  ADD COLUMN IF NOT EXISTS quota INTEGER CHECK (quota IS NULL OR quota > 0),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN ticket_type_access_variants.quota IS 'Max tickets sellable through this variant. If null, uses ticket type base quota.';
COMMENT ON COLUMN ticket_type_access_variants.is_active IS 'When false, variant is hidden from public event form.';

-- 2) Add ticket_type_access_variant_id to order_items (track which variant each sale used)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS ticket_type_access_variant_id UUID REFERENCES ticket_type_access_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_ticket_type_access_variant_id
  ON order_items(ticket_type_access_variant_id)
  WHERE ticket_type_access_variant_id IS NOT NULL;

COMMENT ON COLUMN order_items.ticket_type_access_variant_id IS 'Variant used for this purchase. Used for per-variant quota tracking.';

-- 3) RPC: Get remaining count per variant (for variants with quota)
CREATE OR REPLACE FUNCTION get_variant_remaining_counts(p_event_id UUID)
RETURNS TABLE (
  variant_id UUID,
  sold_count BIGINT,
  quota INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id AS variant_id,
    COALESCE((
      SELECT COUNT(*)::BIGINT
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id AND oi.ticket_type_access_variant_id = v.id
      WHERE t.ticket_type_id = v.ticket_type_id
      AND t.status IN ('valid', 'scanned')
        AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = t.order_id
        AND o.event_id = p_event_id
        AND o.payment_status IN ('paid', 'submitted')
        AND (o.fulfillment_status IS NULL OR o.fulfillment_status != 'cancelled')
      )
    ), 0) AS sold_count,
    v.quota
  FROM ticket_type_access_variants v
  JOIN ticket_types tt ON tt.id = v.ticket_type_id
  WHERE tt.event_id = p_event_id
  AND v.quota IS NOT NULL
  AND v.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION get_variant_remaining_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_variant_remaining_counts(UUID) TO anon;

COMMENT ON FUNCTION get_variant_remaining_counts(UUID) IS 'Returns sold_count and quota for each variant with quota. remaining = quota - sold_count.';
