-- Per-option value display order for storefront (e.g. XS, S, M, L, XL).

ALTER TABLE org_variant_config
  ADD COLUMN IF NOT EXISTS value_orders JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN org_variant_config.value_orders IS 'Map of option name -> ordered value strings for public variant dropdowns';
