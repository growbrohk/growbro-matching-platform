-- Migration 6: Orders, Order Items, and Tickets

-- Orders table (for ticket purchases)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order items table (ticket types purchased in an order)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tickets table (individual tickets generated from order items, with QR codes)
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  qr_code TEXT NOT NULL UNIQUE, -- unique QR code for scanning
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'scanned', 'cancelled')),
  scanned_at TIMESTAMPTZ,
  scanned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_orders_event_id ON orders(event_id);
CREATE INDEX idx_orders_buyer_user_id ON orders(buyer_user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_ticket_type_id ON order_items(ticket_type_id);
CREATE INDEX idx_tickets_order_id ON tickets(order_id);
CREATE INDEX idx_tickets_order_item_id ON tickets(order_item_id);
CREATE INDEX idx_tickets_ticket_type_id ON tickets(ticket_type_id);
CREATE INDEX idx_tickets_qr_code ON tickets(qr_code);
CREATE INDEX idx_tickets_status ON tickets(status);

-- RLS for orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders"
  ON orders FOR SELECT
  USING (buyer_user_id = auth.uid());

CREATE POLICY "Users can view orders for events in their orgs"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = orders.event_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create orders"
  ON orders FOR INSERT
  WITH CHECK (buyer_user_id = auth.uid());

CREATE POLICY "Users can update orders for events in their orgs"
  ON orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = orders.event_id
      AND om.user_id = auth.uid()
    )
  );

-- RLS for order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view order items for their orders or events in their orgs"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND (
        o.buyer_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM events e
          JOIN org_members om ON om.org_id = e.org_id
          WHERE e.id = o.event_id
          AND om.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create order items for their orders"
  ON order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND o.buyer_user_id = auth.uid()
    )
  );

-- RLS for tickets
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tickets"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = tickets.order_id
      AND o.buyer_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view tickets for events in their orgs"
  ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN events e ON e.id = o.event_id
      JOIN org_members om ON om.org_id = e.org_id
      WHERE o.id = tickets.order_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tickets (handled by RPC)"
  ON tickets FOR INSERT
  WITH CHECK (true); -- RPC will handle permissions

CREATE POLICY "Users can update tickets for events in their orgs (for scanning)"
  ON tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN events e ON e.id = o.event_id
      JOIN org_members om ON om.org_id = e.org_id
      WHERE o.id = tickets.order_id
      AND om.user_id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

