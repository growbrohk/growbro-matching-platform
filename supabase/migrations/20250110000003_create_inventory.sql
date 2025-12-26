-- Migration 3: Warehouses, Inventory Items, and Inventory Movements

-- Warehouses table
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory items table (tracks stock per variant per warehouse)
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, variant_id)
);

-- Inventory movements table (audit trail for stock changes)
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL, -- positive for increases, negative for decreases
  reason TEXT NOT NULL, -- 'adjustment', 'sale', 'purchase', 'transfer', etc.
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_warehouses_org_id ON warehouses(org_id);
CREATE INDEX idx_inventory_items_org_id ON inventory_items(org_id);
CREATE INDEX idx_inventory_items_warehouse_id ON inventory_items(warehouse_id);
CREATE INDEX idx_inventory_items_variant_id ON inventory_items(variant_id);
CREATE INDEX idx_inventory_movements_inventory_item_id ON inventory_movements(inventory_item_id);
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements(created_at);

-- RLS for warehouses
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view warehouses in their orgs"
  ON warehouses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = warehouses.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create warehouses in their orgs"
  ON warehouses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = warehouses.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update warehouses in their orgs"
  ON warehouses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = warehouses.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- RLS for inventory_items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory items in their orgs"
  ON inventory_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = inventory_items.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create inventory items in their orgs"
  ON inventory_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = inventory_items.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update inventory items in their orgs"
  ON inventory_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = inventory_items.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- RLS for inventory_movements
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory movements in their orgs"
  ON inventory_movements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN org_members om ON om.org_id = ii.org_id
      WHERE ii.id = inventory_movements.inventory_item_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create inventory movements in their orgs"
  ON inventory_movements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN org_members om ON om.org_id = ii.org_id
      WHERE ii.id = inventory_movements.inventory_item_id
      AND om.user_id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_warehouses_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



