# Catalog Settings Implementation

## Overview
Added org-level catalog management for Categories and Tags to ensure consistency across products.

## What Was Built

### 1. Catalog Settings Page (`/app/settings/catalog`)
**Location:** `src/pages/settings/CatalogSettings.tsx`

**Features:**
- **Two Tabs:** Categories and Tags
- **Categories Management:**
  - Add new categories
  - Rename categories (bulk updates all products using that category)
  - Delete categories with options:
    - Cancel
    - Delete anyway (removes category from products)
    - Merge into another category (bulk updates products to use target category)
  - Shows usage count for each category (how many products use it)

- **Tags Management:**
  - Add new tags
  - Rename tags (bulk updates all products using that tag)
  - Delete tags (removes tag from all products)
  - Shows usage count for each tag

**Data Storage:**
- Categories and tags are stored in `orgs.metadata.catalog`:
  ```json
  {
    "catalog": {
      "categories": ["Apparel", "Electronics", ...],
      "tags": ["featured", "new-arrival", ...]
    }
  }
  ```

### 2. Settings Page Update
**Location:** `src/pages/Settings.tsx`

Added a new card linking to Catalog Settings with:
- Icon (Tags)
- Description
- "Manage Categories & Tags" button

### 3. ProductForm Integration
**Location:** `src/pages/dashboard/products/ProductForm.tsx`

**Changes:**
- **Category Selection:**
  - Now loads categories from `orgs.metadata.catalog.categories`
  - Replaced inline "Create new category" SelectItem with a proper "Create" button
  - Category creation now:
    - Opens a dialog
    - Saves to org metadata
    - Shows loading state
    - Prevents duplicates
    - Updates all products in the org

- **Tags Input:**
  - Now loads tag suggestions from `orgs.metadata.catalog.tags`
  - Shows suggestions below the input field
  - Uses HTML5 datalist for autocomplete
  - Tags can still be created on-the-fly (not saved to org metadata automatically)

### 4. Routing
**Location:** `src/App.tsx`

Added route:
```tsx
<Route path="/app/settings/catalog" element={<ProtectedRoute><AppLayout><CatalogSettings /></AppLayout></ProtectedRoute>} />
```

## Key Features

### Responsive Design
- All pages work on mobile and desktop
- Cards, tables, and dialogs adapt to screen size
- Touch-friendly buttons and inputs

### User Experience
- Loading states for all async operations
- Toast notifications for success/error feedback
- Confirmation dialogs for destructive actions
- Usage counts to help users understand impact
- Merge option to prevent data loss

### Data Integrity
- Bulk updates ensure consistency across all products
- Prevents duplicate categories/tags
- Validates input before saving
- Handles errors gracefully

## Usage Flow

### For Admins (Setting up catalog):
1. Go to Settings → Catalog Settings
2. Add categories (e.g., "Apparel", "Electronics", "Food")
3. Add tags (e.g., "featured", "new-arrival", "sale")

### For Product Managers (Creating products):
1. Go to Products → Create Product
2. Select category from dropdown (populated from org metadata)
3. Click "Create" button next to category to add a new one
4. Add tags with autocomplete suggestions
5. Product saves with category/tags in `products.metadata`

## Technical Notes

### No Schema Changes
- Uses existing `orgs.metadata` JSONB field
- Uses existing `products.metadata` JSONB field
- No new tables or columns needed

### Type Safety
- Used `(supabase as any)` for `orgs` table queries (not in generated types)
- All other code is fully typed

### Performance
- Bulk updates use single queries per product
- Usage counts calculated on-demand (could be cached if needed)
- Minimal database queries

## Testing Checklist

- [ ] Navigate to /app/settings/catalog
- [ ] Add a category
- [ ] Rename a category (verify products update)
- [ ] Delete a category with merge option
- [ ] Add a tag
- [ ] Rename a tag (verify products update)
- [ ] Delete a tag
- [ ] Create a product and select category
- [ ] Create a new category from product form
- [ ] Add tags with autocomplete suggestions
- [ ] Verify mobile responsiveness
- [ ] Check error handling (network errors, validation)

## Future Enhancements

1. **Tag Auto-save:** Automatically add new tags to org metadata when used in products
2. **Category Colors:** Add color coding for categories
3. **Tag Groups:** Organize tags into groups (e.g., "Status", "Features")
4. **Bulk Actions:** Select multiple categories/tags for batch operations
5. **Import/Export:** CSV import/export for categories and tags
6. **Analytics:** Show trending categories/tags, unused ones, etc.
7. **Permissions:** Role-based access control for catalog management

