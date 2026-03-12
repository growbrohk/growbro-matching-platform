-- RPC: Get event add-ons for checkout page (public, for published events)
-- Returns products with variants and is_required flag

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

GRANT EXECUTE ON FUNCTION get_event_addons_for_checkout TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_addons_for_checkout TO anon;

COMMENT ON FUNCTION get_event_addons_for_checkout IS 'Returns add-on products for event checkout. Public for published events.';
