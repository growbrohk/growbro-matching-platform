# Product Categories & Tags Implementation

## Overview
Implemented a comprehensive product categories and tags system using backend database tables (Option B), replacing the previous metadata-based approach.

## Database Changes

### New Tables Created
**Migration:** `supabase/migrations/20250125000001_add_categories_and_tags.sql`

1. **`product_categories`**
   - `id` (UUID, primary key)
   - `org_id` (UUID, foreign key to orgs)
   - `name` (TEXT, unique per org)
   - `slug` (TEXT, unique per org)
   - `sort_order` (INTEGER, for custom ordering)
   - `created_at`, `updated_at` (TIMESTAMPTZ)
   - Unique constraints: `(org_id, slug)`, `(org_id, name)`

2. **`product_tags`**
   - `id` (UUID, primary key)
   - `org_id` (UUID, foreign key to orgs)
   - `name` (TEXT, unique per org)
   - `slug` (TEXT, unique per org)
   - `created_at`, `updated_at` (TIMESTAMPTZ)
   - Unique constraints: `(org_id, slug)`, `(org_id, name)`

3. **`product_tag_links`** (junction table)
   - `id` (UUID, primary key)
   - `product_id` (UUID, foreign key to products)
   - `tag_id` (UUID, foreign key to product_tags)
   - `created_at` (TIMESTAMPTZ)
   - Unique constraint: `(product_id, tag_id)`

### Schema Updates
- Added `category_id` column to `products` table (nullable, foreign key to `product_categories`)
- All tables have proper RLS policies matching existing products pattern
- Indexes added for performance on common queries

### Data Migration
The migration automatically:
- Imports existing categories from `orgs.metadata.catalog.categories`
- Imports existing tags from `orgs.metadata.catalog.tags`
- Maps `products.metadata.category` → `products.category_id`
- Maps `products.metadata.tags` → `product_tag_links` entries
- Preserves all existing data (backward compatible)

### Helper Functions
- `slugify(text)` - Converts names to URL-friendly slugs
- `get_category_product_count(category_id)` - Returns product count for a category
- `get_tag_product_count(tag_id)` - Returns product count for a tag

## Frontend Changes

### 1. TypeScript Types (`src/lib/types.ts`)
```typescript
interface ProductCategory {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ProductTag {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface ProductTagLink {
  id: string;
  product_id: string;
  tag_id: string;
  created_at: string;
}
```

Updated `Product` interface:
- Added `category_id?: string | null` (new)
- Kept `category?: string` (deprecated, for backward compatibility)

### 2. API Functions (`src/lib/api/categories-and-tags.ts`)

**Categories API:**
- `getCategories(orgId)` - Get all categories for an org
- `getCategoriesWithCounts(orgId)` - Get categories with product counts
- `getCategory(categoryId)` - Get single category
- `createCategory(orgId, name, slug?)` - Create new category
- `updateCategory(categoryId, updates)` - Update category
- `deleteCategory(categoryId)` - Delete category
- `reassignProductsCategory(fromCategoryId, toCategoryId)` - Reassign products
- `updateCategoriesSortOrder(updates[])` - Update sort order for multiple categories

**Tags API:**
- `getTags(orgId)` - Get all tags for an org
- `getTagsWithCounts(orgId)` - Get tags with product counts
- `getTag(tagId)` - Get single tag
- `createTag(orgId, name, slug?)` - Create new tag
- `updateTag(tagId, updates)` - Update tag
- `deleteTag(tagId)` - Delete tag (cascade deletes links)

**Product Tag Links API:**
- `getProductTags(productId)` - Get all tags for a product
- `getProductTagIds(productId)` - Get tag IDs for a product (lighter query)
- `addProductTag(productId, tagId)` - Add tag to product
- `removeProductTag(productId, tagId)` - Remove tag from product
- `syncProductTags(productId, tagIds[])` - Diff-based sync (efficient bulk update)
- `removeAllProductTags(productId)` - Remove all tags from product

**Utility:**
- `slugify(text)` - Convert string to URL-friendly slug

### 3. Catalog Settings Page (`src/pages/settings/CatalogSettings.tsx`)

**Route:** `/app/settings/catalog`

**Features:**
- **Two tabs:** Categories and Tags
- **Categories tab:**
  - List all categories with usage counts
  - Create new category
  - Rename category (updates all products)
  - Delete category with options:
    - Delete and remove from products
    - Merge into another category
  - Reorder categories (up/down buttons)
  - Sort order persisted to database
- **Tags tab:**
  - List all tags with usage counts
  - Create new tag
  - Rename tag (updates all product_tag_links)
  - Delete tag (removes from all products)
- **UI:**
  - Responsive (mobile, tablet, desktop)
  - Loading states
  - Empty states
  - Error handling
  - Confirmation dialogs for destructive actions

### 4. Product Form (`src/pages/dashboard/products/ProductForm.tsx`)

**Changes:**
- Replaced `metadata.category` with `category_id` (database FK)
- Replaced `metadata.tags` with `product_tag_links` (junction table)

**Category Selection:**
- Dropdown loads from `product_categories` table
- "+ Create" button opens proper Dialog (not SelectItem hack)
- Newly created category auto-selected
- "No category" option available

**Tags Selection:**
- Multi-select using tag IDs
- Display tag names from `product_tags` table
- Create new tag inline (auto-creates in database)
- Tags saved via `syncProductTags()` (diff-based, efficient)
- Datalist for autocomplete suggestions

**On Save:**
- Saves `product.category_id` to database
- Syncs `product_tag_links` (adds/removes as needed)
- No longer uses metadata for categories/tags

### 5. Inventory Page (`src/pages/dashboard/inventory/Inventory.tsx`)

**New Features:**
- **Category Filter Dropdown:**
  - "All categories"
  - "Uncategorized" (products without category)
  - Individual categories
- **Enhanced Search:**
  - Now searches category names in addition to product/variant/SKU
- **Category Grouping:**
  - Inventory rows grouped by: Category → Product → Variant
  - Category header rows (visual separation)
  - Products sorted alphabetically within categories
  - "Uncategorized" category appears last
  - Product title shown once per product group
  - Variants indented under products

**Data Loading:**
- Loads categories from `product_categories` table
- Enriches inventory rows with category data
- Products include `category_id` field

**UI:**
- Three filter dropdowns: Search, Category, Warehouse
- Responsive layout (stacks on mobile)
- Maintains existing bulk operations
- Selection works across grouped view

## Key Benefits

### 1. **Data Integrity**
- Categories and tags are proper database entities
- Foreign key constraints ensure data consistency
- Unique constraints prevent duplicates
- Cascade deletes handled properly

### 2. **Performance**
- Indexed queries for fast filtering
- Efficient joins for enriched data
- Diff-based tag syncing (only updates what changed)
- Product counts calculated at query time

### 3. **Queryability**
- Can filter products by category/tags in SQL
- Can aggregate/report on categories/tags
- Can find unused categories/tags
- Can track usage counts efficiently

### 4. **Maintainability**
- Centralized category/tag management
- Rename propagates to all products automatically
- Delete with reassignment options
- Clear data model (no nested JSON parsing)

### 5. **User Experience**
- Proper category/tag management UI
- Reorderable categories
- Usage counts visible
- Safe delete with merge option
- Inline tag creation
- Category-grouped inventory view

## Migration Support

The system is **fully backward compatible**:
- Existing `metadata.category` and `metadata.tags` automatically migrated
- Old products work with new system
- No data loss during migration
- Products can be updated gradually

## Testing Checklist

### Database
- [ ] Run migration successfully
- [ ] Verify existing categories/tags imported
- [ ] Verify product category_id mapped correctly
- [ ] Verify product_tag_links created
- [ ] Test RLS policies (can only access own org's data)

### Catalog Settings
- [ ] Create category
- [ ] Rename category
- [ ] Delete category (with products)
- [ ] Merge category
- [ ] Reorder categories
- [ ] Create tag
- [ ] Rename tag
- [ ] Delete tag (with products)

### Product Form
- [ ] Select existing category
- [ ] Create new category
- [ ] Clear category
- [ ] Add existing tag
- [ ] Create new tag
- [ ] Remove tag
- [ ] Save product with category and tags
- [ ] Edit product and change category/tags

### Inventory
- [ ] Filter by category
- [ ] Filter by "Uncategorized"
- [ ] Search includes category names
- [ ] View grouped by category
- [ ] Products grouped correctly
- [ ] Variants indented under products

### Edge Cases
- [ ] Product with no category (shows in "Uncategorized")
- [ ] Product with no tags
- [ ] Delete category used by products
- [ ] Rename category/tag with many products
- [ ] Create duplicate category/tag (should error)
- [ ] Multiple users in same org (RLS)

## Future Enhancements

Potential improvements (not implemented):
1. **Category hierarchy** (parent/child categories)
2. **Tag colors** (visual differentiation)
3. **Bulk tag operations** (add/remove tags from multiple products)
4. **Tag suggestions** (based on product title/description)
5. **Category icons** (visual representation)
6. **Export/import** categories and tags
7. **Analytics** (most used categories/tags)
8. **Tag groups** (organize tags into groups)

## Files Changed

### New Files
- `supabase/migrations/20250125000001_add_categories_and_tags.sql`
- `src/lib/api/categories-and-tags.ts`
- `CATEGORIES_TAGS_IMPLEMENTATION.md` (this file)

### Modified Files
- `src/lib/types.ts` - Added types for categories, tags, tag links
- `src/pages/settings/CatalogSettings.tsx` - Complete rewrite using database tables
- `src/pages/dashboard/products/ProductForm.tsx` - Updated to use category_id and tag links
- `src/pages/dashboard/inventory/Inventory.tsx` - Added category filter and grouping

## Rollback Plan

If issues arise, the system can be rolled back:
1. Revert frontend changes (use metadata again)
2. Keep database tables (no harm, just unused)
3. Or drop tables: `DROP TABLE product_tag_links, product_tags, product_categories CASCADE;`
4. Remove `category_id` column: `ALTER TABLE products DROP COLUMN category_id;`

The old metadata-based system will continue to work as the `category` and `tags` fields are still present in the `Product` type.

