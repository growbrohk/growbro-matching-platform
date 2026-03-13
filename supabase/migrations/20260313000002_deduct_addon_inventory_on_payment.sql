-- Deduct add-on inventory when order payment is confirmed (payment_status = 'paid')
-- Treats add-ons exactly like physical catalog items for stock purposes.
-- Add-ons remain hidden from catalog (existing type='addon' behavior).

-- 1. Add idempotency flag to orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS addon_inventory_deducted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.addon_inventory_deducted IS 'True when inventory for order_addon_items has been deducted (at payment confirmation). Prevents double deduction.';

-- 2. Create trigger function
CREATE OR REPLACE FUNCTION deduct_addon_inventory_on_payment()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_no TEXT;
  v_event_org_id UUID;
  v_warehouse_id UUID;
  v_addon_count INT;
  v_variant_id UUID;
  v_inventory_item_id UUID;
  v_delta INT;
  v_addon RECORD;
BEGIN
  v_order_id := NEW.id;

  -- Skip if already deducted
  IF NEW.addon_inventory_deducted = true THEN
    RETURN NEW;
  END IF;

  -- Skip if no event (product-only orders have no addons)
  IF NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if order has addon items
  SELECT COUNT(*) INTO v_addon_count
  FROM order_addon_items
  WHERE order_id = v_order_id;

  IF v_addon_count = 0 THEN
    RETURN NEW;
  END IF;

  -- Get org_id from event
  SELECT e.org_id INTO v_event_org_id
  FROM events e
  WHERE e.id = NEW.event_id;

  IF v_event_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get default warehouse: prefer name ILIKE '%main%', else first by created_at
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE org_id = v_event_org_id
  ORDER BY (CASE WHEN name ILIKE '%main%' THEN 0 ELSE 1 END), created_at
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_order_no := COALESCE(NEW.order_no, v_order_id::TEXT);

  -- Process each order_addon_item
  FOR v_addon IN
    SELECT oai.id, oai.product_id, oai.product_variant_id, oai.quantity
    FROM order_addon_items oai
    WHERE oai.order_id = v_order_id
  LOOP
    -- Resolve variant_id: product_variant_id if set, else first variant of product
    IF v_addon.product_variant_id IS NOT NULL THEN
      v_variant_id := v_addon.product_variant_id;
    ELSE
      SELECT pv.id INTO v_variant_id
      FROM product_variants pv
      WHERE pv.product_id = v_addon.product_id
      ORDER BY pv.created_at
      LIMIT 1;
    END IF;

    IF v_variant_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Find inventory_item for (warehouse_id, variant_id)
    SELECT ii.id INTO v_inventory_item_id
    FROM inventory_items ii
    WHERE ii.warehouse_id = v_warehouse_id
      AND ii.variant_id = v_variant_id;

    IF v_inventory_item_id IS NULL THEN
      -- Addon without inventory (e.g. digital) - skip
      CONTINUE;
    END IF;

    v_delta := -v_addon.quantity;

    -- Update inventory_items (same as adjust_stock: GREATEST(0, quantity + delta))
    UPDATE inventory_items
    SET quantity = GREATEST(0, quantity + v_delta),
        updated_at = NOW()
    WHERE id = v_inventory_item_id;

    -- Insert movement record
    INSERT INTO inventory_movements (inventory_item_id, delta, reason, note, created_by)
    VALUES (v_inventory_item_id, v_delta, 'event_addon_sale', 'Order ' || v_order_no, NULL);
  END LOOP;

  -- Mark as deducted
  UPDATE orders
  SET addon_inventory_deducted = true
  WHERE id = v_order_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION deduct_addon_inventory_on_payment() IS 'Trigger: deducts inventory for order_addon_items when payment_status becomes paid. Uses org default warehouse. Skips addons without inventory.';

-- 3. Create trigger
DROP TRIGGER IF EXISTS trg_deduct_addon_inventory_on_payment ON orders;

CREATE TRIGGER trg_deduct_addon_inventory_on_payment
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (
    OLD.payment_status IS DISTINCT FROM 'paid'
    AND NEW.payment_status = 'paid'
  )
  EXECUTE FUNCTION deduct_addon_inventory_on_payment();
