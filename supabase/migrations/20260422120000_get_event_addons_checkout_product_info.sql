-- get_event_addons_for_checkout: add description, gallery_urls, product_details, size_and_fit (narrow public fields only)

CREATE OR REPLACE FUNCTION get_event_addons_for_checkout(p_event_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_org_id UUID;
  v_warehouse_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND status = 'published') THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT e.org_id INTO v_org_id FROM events e WHERE e.id = p_event_id;

  SELECT w.id INTO v_warehouse_id
  FROM warehouses w
  WHERE w.org_id = v_org_id
  ORDER BY (CASE WHEN w.name ILIKE '%main%' THEN 0 ELSE 1 END), w.created_at
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'product_id', p.id,
      'product_title', p.title,
      'product_image_url', p.image_url,
      'base_price', p.base_price,
      'is_required', eap.is_required,
      'sort_order', eap.sort_order,
      'fixed_quantity', eap.fixed_quantity,
      'show_remaining_stock', eap.show_remaining_stock,
      'product_description', p.description,
      'gallery_urls', COALESCE(p.metadata->'gallery_urls', '[]'::jsonb),
      'product_details', p.metadata->>'product_details',
      'size_and_fit', p.metadata->>'size_and_fit',
      'variants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', pv.id,
            'name', pv.name,
            'price', COALESCE(pv.price, p.base_price, 0),
            'stock_remaining',
              CASE
                WHEN eap.show_remaining_stock THEN COALESCE((
                  SELECT ii.quantity
                  FROM inventory_items ii
                  WHERE ii.variant_id = pv.id
                    AND v_warehouse_id IS NOT NULL
                    AND ii.warehouse_id = v_warehouse_id
                ), 0)
                ELSE NULL
              END
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

COMMENT ON FUNCTION get_event_addons_for_checkout IS 'Returns add-on products for event checkout: image, optional per-variant stock, product_description, gallery_urls, product_details, size_and_fit. Public for published events.';
