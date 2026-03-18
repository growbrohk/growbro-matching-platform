-- Deduct inventory for product order_items when payment_status becomes 'paid'
-- Uses org default warehouse (same logic as addon deduction)

CREATE OR REPLACE FUNCTION deduct_product_order_inventory_on_payment()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_no TEXT;
  v_host_org_id UUID;
  v_warehouse_id UUID;
  v_item RECORD;
  v_inventory_item_id UUID;
  v_delta INT;
BEGIN
  v_order_id := NEW.id;

  -- Only for product orders
  IF NEW.order_type != 'product' OR NEW.host_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if already deducted (reuse addon_inventory_deducted for product orders too)
  IF NEW.addon_inventory_deducted = true THEN
    RETURN NEW;
  END IF;

  -- Skip if not paid
  IF NEW.payment_status != 'paid' THEN
    RETURN NEW;
  END IF;

  v_host_org_id := NEW.host_org_id;
  v_order_no := COALESCE(NEW.order_no, v_order_id::TEXT);

  -- Get default warehouse
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE org_id = v_host_org_id
  ORDER BY (CASE WHEN name ILIKE '%main%' THEN 0 ELSE 1 END), created_at
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Process each order_item with product metadata
  FOR v_item IN
    SELECT oi.id, oi.quantity, oi.metadata
    FROM order_items oi
    WHERE oi.order_id = v_order_id
      AND oi.metadata->>'is_product_order' = 'true'
      AND (oi.metadata->>'variant_id') IS NOT NULL
  LOOP
    v_delta := -v_item.quantity;

    -- Find inventory_item for (warehouse, variant)
    SELECT ii.id INTO v_inventory_item_id
    FROM inventory_items ii
    WHERE ii.warehouse_id = v_warehouse_id
      AND ii.variant_id = (v_item.metadata->>'variant_id')::UUID;

    IF v_inventory_item_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE inventory_items
    SET quantity = GREATEST(0, quantity + v_delta),
        updated_at = NOW()
    WHERE id = v_inventory_item_id;

    INSERT INTO inventory_movements (inventory_item_id, delta, reason, note, created_by)
    VALUES (v_inventory_item_id, v_delta, 'sale', 'Product order ' || v_order_no, NULL);
  END LOOP;

  UPDATE orders
  SET addon_inventory_deducted = true
  WHERE id = v_order_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION deduct_product_order_inventory_on_payment() IS 'Trigger: deducts inventory for product order_items when payment_status becomes paid.';

DROP TRIGGER IF EXISTS trg_deduct_product_order_inventory_on_payment ON orders;

CREATE TRIGGER trg_deduct_product_order_inventory_on_payment
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (
    OLD.payment_status IS DISTINCT FROM 'paid'
    AND NEW.payment_status = 'paid'
    AND NEW.order_type = 'product'
    AND NEW.host_org_id IS NOT NULL
  )
  EXECUTE FUNCTION deduct_product_order_inventory_on_payment();
