-- ============================================
-- Verify Variable Products Setup
-- ============================================
-- Run this script to check if everything is set up correctly
-- ============================================

-- Check for UNIQUE constraints (CRITICAL for upsert operations)
SELECT 
  'UNIQUE Constraints Check' as check_type,
  conname as constraint_name,
  conrelid::regclass as table_name
FROM pg_constraint
WHERE conname IN (
  'product_variables_product_id_name_key',
  'product_variable_values_variable_id_value_key',
  'product_variation_inventory_variation_id_inventory_location_id_key'
)
ORDER BY conname;

-- Check for indexes
SELECT 
  'Indexes Check' as check_type,
  indexname as index_name,
  tablename as table_name
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('product_variables', 'product_variable_values', 'product_variations', 'product_variation_inventory')
ORDER BY tablename, indexname;

-- Check for triggers
SELECT 
  'Triggers Check' as check_type,
  tgname as trigger_name,
  tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname IN (
  'product_variables_updated_at',
  'product_variations_updated_at',
  'product_variation_inventory_updated_at',
  'update_variation_stock_on_inventory_change'
)
ORDER BY tgname;

-- Check for functions
SELECT 
  'Functions Check' as check_type,
  proname as function_name
FROM pg_proc
WHERE proname IN (
  'update_updated_at_column',
  'calculate_variation_stock',
  'update_variation_stock'
)
ORDER BY proname;

-- Check for RLS policies
SELECT 
  'RLS Policies Check' as check_type,
  schemaname,
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('product_variables', 'product_variable_values', 'product_variations', 'product_variation_inventory')
ORDER BY tablename, policyname;

-- ============================================
-- SUMMARY
-- ============================================
-- If you see:
-- ✅ 3 UNIQUE constraints
-- ✅ Multiple indexes (at least 7-8)
-- ✅ 4 triggers
-- ✅ 3 functions
-- ✅ 4 RLS policies (one per table)
-- 
-- Then everything is set up correctly!
-- ============================================

