-- Add ticket_id to order_addon_items for per-ticket add-on attachment
-- When set, add-on is attached to this ticket (per-ticket mode). When null, add-on is order-level (primary mode).

ALTER TABLE order_addon_items
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_addon_items_ticket_id ON order_addon_items(ticket_id);

COMMENT ON COLUMN order_addon_items.ticket_id IS 'When set, add-on is attached to this ticket (per-ticket mode). When null, add-on is order-level (primary mode).';
