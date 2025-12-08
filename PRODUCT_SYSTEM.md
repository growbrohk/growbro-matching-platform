# Unified Product System Documentation

## Overview

The unified product system allows both brands and venues to create and manage products. All users are brands by default, and venue users can also create venue-specific products.

## Database Schema

### New Fields Added to `products` Table

- `owner_type` (product_owner_type enum): 'brand' | 'venue'
- `owner_user_id` (uuid): References profiles.id
- `product_class` (product_class enum): 'physical' | 'ticket' | 'booking' | 'service' | 'space'

### Migration Applied

The database migration has been applied. All existing products have been backfilled with:
- `owner_type = 'brand'`
- `owner_user_id = brand_user_id`
- `product_class = 'physical'`

## User Roles & Permissions

### All Users (Brands)
- Can create brand products
- Can manage brand products at `/dashboard/products/brand`
- Access to brand product features

### Venue Users (is_venue = true)
- Can create brand products (same as all users)
- Can create venue products
- Can manage venue products at `/dashboard/products/venue`
- Access to both brand and venue features

### Product Ownership Rules
- `owner_user_id` must match current user's profile ID
- Venue products can only be created by users with `is_venue = true`
- Non-venue users attempting to create venue products will be rejected

## Product Classes

1. **physical**: Tangible product with inventory (default for existing products)
2. **ticket**: Event ticket or admission
3. **booking**: Reservable time slot or service
4. **service**: Design, workshop, or other service
5. **space**: Venue space rental

## API Functions

Located in `src/lib/api/products.ts`:

### `createProduct(data, profile)`
- Creates a new product
- Validates ownership and permissions
- Auto-generates slug from name
- Returns: `{ data: Product | null, error: Error | null }`

### `updateProduct(data, profile)`
- Updates existing product
- Verifies ownership before update
- Returns: `{ data: Product | null, error: Error | null }`

### `deleteProduct(productId, profile)`
- Deletes product
- Verifies ownership before delete
- Returns: `{ error: Error | null }`

### `getMyProducts(profile, ownerType)`
- Fetches products by owner type
- Validates venue access for venue products
- Returns: `{ data: Product[] | null, error: Error | null }`

### `getProductById(productId, profile)`
- Gets single product with ownership check
- Returns: `{ data: Product | null, error: Error | null }`

### `generateSlug(name)`
- Utility to generate URL-friendly slug from product name

## Routes

### Product Listing Pages
- `/dashboard/products/brand` - Brand products (all users)
- `/dashboard/products/venue` - Venue products (venue users only)

### Product Form Pages
- `/dashboard/products/new` - Create new product
  - Query param: `?owner_type=brand` or `?owner_type=venue`
- `/dashboard/products/:id/edit` - Edit existing product

## Form Fields

### Required Fields
- **name**: Product name
- **product_class**: Product class (dropdown)

### Auto-Determined
- **owner_type**: 'brand' by default, 'venue' if user selects and is venue
- **owner_user_id**: Current user's profile ID
- **slug**: Auto-generated from name (editable)

### Optional Fields
- short_description
- full_description
- category
- thumbnail_url
- price_in_cents (default: 0)
- currency (default: 'hkd')
- is_purchasable (default: false)
- is_public (default: false)
- is_active (default: true)
- suitable_collab_types
- margin_notes
- inventory_notes

## Validation Rules

1. **Name**: Required, non-empty
2. **Product Class**: Required, must be valid enum value
3. **Price**: Must be ≥ 0 (in cents)
4. **Slug**: Must be unique (auto-handled with timestamp suffix if conflict)
5. **Owner Type**: 
   - Non-venue users: forced to 'brand'
   - Venue users: can choose 'brand' or 'venue'
6. **Venue Products**: Only venue users can create

## Navigation Updates

The Layout component now includes:
- "Brand Products" link (all users)
- "Venue Products" link (only if `is_venue = true`)

## Backward Compatibility

- Existing products continue to work
- `brand_user_id` field is kept for backward compatibility
- All queries use new `owner_user_id` and `owner_type` fields
- Old Products page (`/products`) still works but uses legacy fields

## Testing Checklist

- [ ] Brand user can create brand product
- [ ] Brand user cannot create venue product
- [ ] Venue user can create brand product
- [ ] Venue user can create venue product
- [ ] Products list correctly by owner type
- [ ] Edit form loads existing product data
- [ ] Delete works with ownership verification
- [ ] Slug uniqueness is enforced
- [ ] All validation rules work correctly

