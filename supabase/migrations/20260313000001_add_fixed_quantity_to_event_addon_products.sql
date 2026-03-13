-- Add fixed_quantity to event_addon_products
-- When set, guest cannot edit quantity on checkout page (host-defined fixed quantity per addon)

ALTER TABLE event_addon_products
ADD COLUMN fixed_quantity INTEGER NULL
CHECK (fixed_quantity IS NULL OR fixed_quantity > 0);

COMMENT ON COLUMN event_addon_products.fixed_quantity IS 'When set, quantity is fixed at checkout (guest cannot change). NULL = guest can edit quantity.';

-- Update get_event_addons_for_checkout to include fixed_quantity
CREATE OR REPLACE FUNCTION get_event_addons_for_checkout(p_event_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND status = 'published') THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'product_title', p.title,
      'base_price', p.base_price,
      'is_required', eap.is_required,
      'sort_order', eap.sort_order,
      'fixed_quantity', eap.fixed_quantity,
      'variants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', pv.id,
            'name', pv.name,
            'price', COALESCE(pv.price, p.base_price, 0)
          )
          ORDER BY pv.created_at
        ), '[]'::jsonb)
        FROM product_variants pv
        WHERE pv.product_id = p.id
        AND (pv.archived_at IS NULL)
        AND COALESCE(pv.active, true) = true
      )
    )
    ORDER BY eap.sort_order, p.title
  ), '[]'::jsonb) INTO v_result
  FROM event_addon_products eap
  JOIN products p ON p.id = eap.product_id
  WHERE eap.event_id = p_event_id;

  RETURN v_result;
END;
$$;
