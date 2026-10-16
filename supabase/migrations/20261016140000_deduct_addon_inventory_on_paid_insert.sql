-- Deduct event add-on inventory for every paid order, including orders inserted
-- already paid (free / zero total).
--
-- The previous trigger only ran on UPDATE when payment_status changed to
-- 'paid'. create_event_booking inserts a zero-total order as paid, then
-- inserts order_addon_items, so that update never happens and stock stays put.
-- Stripe and host confirmation still go unpaid -> paid and keep using the
-- update trigger.
--
-- This migration does not change historical stock. The review and apply
-- statements are at the bottom and are comments on purpose: deducting old
-- orders can double-count stock a host already corrected by hand.

CREATE OR REPLACE FUNCTION public.deduct_event_addon_inventory(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_payment_status text;
  v_already_deducted boolean;
  v_order_no text;
  v_event_org_id uuid;
  v_warehouse_id uuid;
  v_addon_count int;
  v_variant_id uuid;
  v_inventory_item_id uuid;
  v_delta int;
  v_addon record;
BEGIN
  SELECT o.event_id, o.payment_status, o.addon_inventory_deducted, o.order_no
  INTO v_event_id, v_payment_status, v_already_deducted, v_order_no
  FROM orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_already_deducted IS TRUE OR v_payment_status IS DISTINCT FROM 'paid' OR v_event_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_addon_count
  FROM order_addon_items
  WHERE order_id = p_order_id;

  IF v_addon_count = 0 THEN
    RETURN;
  END IF;

  SELECT e.org_id INTO v_event_org_id
  FROM events e
  WHERE e.id = v_event_id;

  IF v_event_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Same default warehouse as checkout stock checks and the old trigger.
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE org_id = v_event_org_id
  ORDER BY (CASE WHEN name ILIKE '%main%' THEN 0 ELSE 1 END), created_at
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RETURN;
  END IF;

  v_order_no := COALESCE(v_order_no, p_order_id::text);

  FOR v_addon IN
    SELECT oai.id, oai.product_id, oai.product_variant_id, oai.quantity
    FROM order_addon_items oai
    WHERE oai.order_id = p_order_id
  LOOP
    IF v_addon.product_variant_id IS NOT NULL THEN
      v_variant_id := v_addon.product_variant_id;
    ELSE
      -- Same variant booking validation would have charged: first active, non-archived.
      SELECT pv.id INTO v_variant_id
      FROM product_variants pv
      WHERE pv.product_id = v_addon.product_id
        AND pv.archived_at IS NULL
        AND COALESCE(pv.active, true) = true
      ORDER BY pv.created_at
      LIMIT 1;
    END IF;

    IF v_variant_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT ii.id INTO v_inventory_item_id
    FROM inventory_items ii
    WHERE ii.warehouse_id = v_warehouse_id
      AND ii.variant_id = v_variant_id;

    IF v_inventory_item_id IS NULL THEN
      CONTINUE;
    END IF;

    v_delta := -v_addon.quantity;

    UPDATE inventory_items
    SET quantity = GREATEST(0, quantity + v_delta),
        updated_at = NOW()
    WHERE id = v_inventory_item_id;

    INSERT INTO inventory_movements (inventory_item_id, delta, reason, note, created_by)
    VALUES (v_inventory_item_id, v_delta, 'event_addon_sale', 'Order ' || v_order_no, NULL);
  END LOOP;

  UPDATE orders
  SET addon_inventory_deducted = true
  WHERE id = p_order_id
    AND addon_inventory_deducted = false;
END;
$$;

COMMENT ON FUNCTION public.deduct_event_addon_inventory(uuid) IS
  'Deducts inventory for order_addon_items of a paid event order. Idempotent via orders.addon_inventory_deducted. Not an RPC.';

REVOKE ALL ON FUNCTION public.deduct_event_addon_inventory(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_event_addon_inventory(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_event_addon_inventory(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.deduct_event_addon_inventory(uuid) FROM service_role;

CREATE OR REPLACE FUNCTION public.deduct_addon_inventory_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.deduct_event_addon_inventory(NEW.id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.deduct_addon_inventory_on_payment() IS
  'Trigger: deducts add-on inventory when an event order is inserted already paid, or when payment_status becomes paid.';

DROP TRIGGER IF EXISTS trg_deduct_addon_inventory_on_payment ON public.orders;

CREATE TRIGGER trg_deduct_addon_inventory_on_payment
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.payment_status IS DISTINCT FROM 'paid'
    AND NEW.payment_status = 'paid'
  )
  EXECUTE FUNCTION public.deduct_addon_inventory_on_payment();

-- Fires at commit, after create_event_booking has inserted order_addon_items.
-- WHEN is checked at insert time, so unpaid orders are not queued.
DROP TRIGGER IF EXISTS trg_deduct_addon_inventory_on_paid_insert ON public.orders;

CREATE CONSTRAINT TRIGGER trg_deduct_addon_inventory_on_paid_insert
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid' AND NEW.event_id IS NOT NULL)
  EXECUTE FUNCTION public.deduct_addon_inventory_on_payment();

-- ---------------------------------------------------------------------------
-- Review, then apply by hand in the SQL editor. Do not uncomment inside this
-- migration: pushing it must not change stock for orders that were already paid.
--
-- 1) List paid event orders whose add-ons were never deducted.
--    Refunded and cancelled orders are excluded.
--
-- WITH lines AS (
--   SELECT
--     o.id AS order_id,
--     o.order_no,
--     o.total_amount,
--     o.payment_status,
--     o.fulfillment_status,
--     o.status,
--     o.created_at,
--     oai.quantity,
--     COALESCE(oai.product_variant_id, fv.id) AS variant_id
--   FROM orders o
--   JOIN order_addon_items oai ON oai.order_id = o.id
--   LEFT JOIN LATERAL (
--     SELECT pv.id
--     FROM product_variants pv
--     WHERE pv.product_id = oai.product_id
--       AND pv.archived_at IS NULL
--       AND COALESCE(pv.active, true) = true
--     ORDER BY pv.created_at
--     LIMIT 1
--   ) fv ON oai.product_variant_id IS NULL
--   WHERE o.payment_status = 'paid'
--     AND o.event_id IS NOT NULL
--     AND o.addon_inventory_deducted = false
--     AND o.status NOT IN ('refunded', 'cancelled')
--     AND o.fulfillment_status IS DISTINCT FROM 'cancelled'
-- )
-- SELECT
--   l.order_id,
--   l.order_no,
--   l.total_amount,
--   l.payment_status,
--   l.fulfillment_status,
--   l.status,
--   l.created_at,
--   l.variant_id,
--   pv.sku,
--   pv.name AS variant_name,
--   SUM(l.quantity) AS qty_to_deduct
-- FROM lines l
-- LEFT JOIN product_variants pv ON pv.id = l.variant_id
-- GROUP BY
--   l.order_id, l.order_no, l.total_amount, l.payment_status,
--   l.fulfillment_status, l.status, l.created_at,
--   l.variant_id, pv.sku, pv.name
-- ORDER BY l.created_at, pv.sku;
--
-- 2a) After review, deduct those orders:
--
-- SELECT public.deduct_event_addon_inventory(o.id)
-- FROM orders o
-- WHERE o.payment_status = 'paid'
--   AND o.event_id IS NOT NULL
--   AND o.addon_inventory_deducted = false
--   AND o.status NOT IN ('refunded', 'cancelled')
--   AND o.fulfillment_status IS DISTINCT FROM 'cancelled'
--   AND EXISTS (
--     SELECT 1 FROM order_addon_items a WHERE a.order_id = o.id
--   );
--
-- 2b) If stock for an order was already corrected by hand, mark it instead
--     of deducting. Replace the id list.
--
-- UPDATE orders
-- SET addon_inventory_deducted = true
-- WHERE id IN ('00000000-0000-0000-0000-000000000000')
--   AND addon_inventory_deducted = false;
-- ---------------------------------------------------------------------------
