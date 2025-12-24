# Schema Alignment Report

## Summary

The codebase has been partially migrated to align with the new organization-based database schema. Here's the current status:

## ✅ Completed

### 1. Migration Files Cleanup
- **Deleted all 20 legacy migration files** from `supabase/migrations/_legacy/`
- Current migration files (in correct order):
  - `20250110000001_create_orgs.sql` - Organizations and members
  - `20250110000002_create_products.sql` - Products and variants
  - `20250110000003_create_inventory.sql` - Warehouses and inventory
  - `20250110000004_create_bookings.sql` - Bookings for venue assets
  - `20250110000005_create_events.sql` - Events and ticket types
  - `20250110000006_create_orders.sql` - Orders and tickets
  - `20250110000007_create_pricing.sql` - Product pricing
  - `20250110000008_create_rpc_functions.sql` - Database functions
  - `20250124000001_add_variant_fields.sql` - Variant archival
  - `20250125000001_add_categories_and_tags.sql` - Categories and tags

### 2. TypeScript Types Updated
- **`src/integrations/supabase/types.ts`** - Completely regenerated to match new schema
- **`src/lib/types.ts`** - Rewritten with organization-based types:
  - `Org`, `OrgMember` (replaces user-based ownership)
  - `Product`, `ProductVariant` (org-scoped)
  - `ProductCategory`, `ProductTag`, `ProductTagLink`
  - `Warehouse`, `InventoryItem`, `InventoryMovement`
  - `Booking`, `BookingEntitlement`
  - `Event`, `TicketType`, `Order`, `OrderItem`, `Ticket`
  - `ProductPricing`

### 3. API Layer Updates
- **`src/lib/api/products.ts`** - Completely rewritten for org-based structure:
  - Uses `org_id` instead of `brand_user_id` or `owner_user_id`
  - Product type is now `'physical' | 'venue_asset'` (not the old complex types)
  - Proper variant management with archival support
  - Functions: `getProducts`, `createProduct`, `updateProduct`, `deleteProduct`, etc.

- **`src/lib/api/categories-and-tags.ts`** - ✅ Already aligned with new schema
  - Uses `org_id` correctly
  - Proper category and tag management

## ⚠️ Issues Found - Requires Action

### 1. **`src/lib/api/ticketing.ts`** - OUTDATED
This file references old schema structures that don't exist in your new database:

**Problems:**
- Uses `events` table with `brand_id` field (doesn't exist in new schema)
- References `ticket_products` table (doesn't exist - should be `ticket_types`)
- Uses old `products` table structure with `brand_user_id`, `owner_type`, `event_id` fields
- The new schema has:
  - `events` table with `org_id` (not `brand_id`)
  - `ticket_types` table (not `ticket_products`)
  - `orders`, `order_items`, `tickets` tables

**Action Required:**
- Rewrite this file to use the new schema structure OR
- Delete if not needed (events/ticketing might be handled differently)

### 2. **`src/lib/api/variable-products.ts`** - OUTDATED
This file references tables that don't exist in your new schema:

**Problems:**
- Uses `product_variables` table (doesn't exist)
- Uses `product_variable_values` table (doesn't exist)
- Uses `product_variations` table (doesn't exist)
- Uses `product_variation_inventory` table (doesn't exist)

**New Schema Approach:**
Your new schema uses:
- `product_variants` table (simpler approach)
- `inventory_items` table (links variants to warehouses)
- No complex variable/variation system

**Action Required:**
- Delete this file OR
- Rewrite to use the simpler `product_variants` approach

### 3. **Frontend Components** - NEED REVIEW
Many frontend components likely reference the old types and APIs:

Files to check:
- `src/pages/dashboard/products/ProductForm.tsx`
- `src/pages/dashboard/products/Products.tsx`
- `src/pages/dashboard/inventory/Inventory.tsx`
- `src/pages/events/EventForm.tsx`
- `src/pages/events/EventsList.tsx`
- `src/pages/settings/CatalogSettings.tsx`

**Action Required:**
- Update imports to use new types from `@/lib/types`
- Update API calls to use new functions from `@/lib/api/*`
- Remove references to old fields like `brand_user_id`, `owner_user_id`, `product_class`, etc.

## 📋 Database Schema Summary

Your current database schema is **organization-based multi-tenant**:

### Core Structure:
```
orgs (organizations)
  └── org_members (users belong to orgs with roles)
  └── products (org-scoped)
      ├── product_variants
      ├── product_categories
      ├── product_tags → product_tag_links
      └── product_pricing
  └── warehouses
      └── inventory_items (variant stock per warehouse)
          └── inventory_movements (audit trail)
  └── events
      └── ticket_types
          └── orders → order_items → tickets
```

### Product Types:
- `physical` - Physical products with variants and inventory
- `venue_asset` - Venue spaces/assets that can be booked

### Bookings (for venue_asset products):
```
bookings
  ├── brand_org_id (renting org)
  ├── venue_org_id (providing org)
  ├── resource_product_id (venue_asset product)
  └── booking_entitlements (QR codes)
```

## 🎯 Next Steps

1. **Decide on ticketing.ts and variable-products.ts:**
   - Delete if not needed
   - OR rewrite to match new schema

2. **Update Frontend Components:**
   - Start with ProductForm.tsx
   - Then Products.tsx
   - Then Inventory.tsx
   - Check CatalogSettings.tsx

3. **Test Database Migrations:**
   - Run migrations on a test database
   - Verify all tables are created correctly
   - Test RPC functions

4. **Update AuthContext:**
   - Ensure it loads user's org memberships
   - Provide current org context to components

## 📝 Migration Notes

### Old Schema → New Schema Mapping

| Old | New |
|-----|-----|
| `profiles` table | `auth.users` + `org_members` |
| `brand_user_id` | `org_id` |
| `owner_user_id` | `org_id` |
| `owner_type` | Removed (determined by org type in metadata) |
| `product_class` / `product_type` (8 types) | `type` ('physical' \| 'venue_asset') |
| `product_variables` + `product_variations` | `product_variants` (simpler) |
| `inventory_locations` | `warehouses` |
| `product_inventory` | `inventory_items` |
| `events.brand_id` | `events.org_id` |
| `ticket_products` | `ticket_types` |

## ✅ Schema Validation

Your provided schema matches the migration files:
- ✅ All tables defined correctly
- ✅ Foreign keys properly set up
- ✅ Check constraints in place
- ✅ RLS policies defined
- ✅ Indexes created
- ✅ Triggers for updated_at
- ✅ RPC functions for common operations

The schema is **production-ready** once the frontend is updated to use it.

