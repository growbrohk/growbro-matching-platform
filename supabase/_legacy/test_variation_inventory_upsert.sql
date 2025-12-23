-- ============================================
-- Test Variation Inventory Upsert
-- ============================================
-- Run this to test if upsert works correctly
-- Replace the UUIDs with actual IDs from your database
-- ============================================

-- First, get some actual IDs to test with
SELECT 
  pv.id as variation_id,
  il.id as location_id,
  p.name as product_name
FROM product_variations pv
JOIN products p ON p.id = pv.product_id
JOIN inventory_locations il ON il.type = 'warehouse'
LIMIT 1;

-- Then test the upsert (replace UUIDs with actual values from above)
-- Example:
/*
INSERT INTO product_variation_inventory (
  variation_id,
  inventory_location_id,
  stock_quantity,
  reserved_quantity
)
VALUES (
  'YOUR_VARIATION_ID_HERE',
  'YOUR_LOCATION_ID_HERE',
  10,
  0
)
ON CONFLICT (variation_id, inventory_location_id)
DO UPDATE SET
  stock_quantity = EXCLUDED.stock_quantity,
  reserved_quantity = EXCLUDED.reserved_quantity,
  updated_at = NOW()
RETURNING *;
*/

-- Check if the constraint exists
SELECT 
  conname,
  contype,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'product_variation_inventory'::regclass
  AND contype = 'u';

