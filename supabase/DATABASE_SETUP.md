# Database Setup Guide for Growbro Matching Platform

This guide explains how to set up the complete database schema for the Growbro Matching Platform.

## Overview

The database consists of:
- **User Management**: Profiles with roles (brand/venue)
- **Matching System**: Likes and matches between users
- **Collaborations**: Listings, requests, and options
- **Products**: Brand product catalog with inventory management
- **E-commerce**: Orders and order items for shop functionality
- **Messaging**: Messages linked to matches or collab requests

## Setup Options

### Option 1: Fresh Database Setup (Recommended for new projects)

Use the complete schema file to set up a fresh database:

```bash
# In Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Copy and paste the contents of: supabase/migrations/000_complete_schema.sql
# 3. Run the SQL script
```

Or using Supabase CLI:

```bash
supabase db reset
# Then apply the complete schema
psql -h your-db-host -U postgres -d postgres -f supabase/migrations/000_complete_schema.sql
```

### Option 2: Apply Existing Migrations + Fix

If you already have migrations applied, run the fix migration:

```bash
# Apply the fix migration
supabase migration up
```

The fix migration (`20251204080000_fix_missing_foreign_keys.sql`) will add missing foreign key constraints.

## Database Schema

### Core Tables

1. **profiles** - User profiles extending auth.users
2. **products** - Brand product catalog
3. **collab_listings** - Collaboration opportunity listings
4. **likes** - User likes for matching
5. **matches** - Mutual matches between users
6. **collab_requests** - Collaboration requests
7. **messages** - Messages between matched users or in collab requests

### Venue-Specific Tables

8. **venue_collab_options** - Venue collaboration options (event slots, shelf space, etc.)
9. **collab_request_venue_options** - Junction table linking collab requests to venue options

### E-commerce Tables

10. **inventory_locations** - Warehouse and venue inventory locations
11. **product_inventory** - Product stock at different locations
12. **orders** - Customer orders
13. **order_items** - Items in each order

### Junction Tables

- **collab_request_products** - Links products to collab requests
- **collab_request_venue_options** - Links venue options to collab requests

## Enums

- `user_role`: 'brand' | 'venue'
- `collab_type`: 'consignment' | 'event' | 'collab_product' | 'cup_sleeve_marketing'
- `collab_status`: 'pending' | 'accepted' | 'declined' | 'closed'
- `venue_option_type`: 'event_slot' | 'shelf_space' | 'exhibition_period' | 'wall_space' | 'other'
- `inventory_location_type`: 'warehouse' | 'venue'

## Key Features

### Row Level Security (RLS)

All tables have RLS enabled with appropriate policies:
- Users can only modify their own data
- Public read access where appropriate
- Secure write operations

### Automatic Features

1. **Auto-match creation**: When two users like each other, a match is automatically created via trigger
2. **Updated timestamps**: All tables with `updated_at` columns automatically update via triggers
3. **Realtime**: Messages table is enabled for realtime subscriptions

### Indexes

Performance indexes are created on:
- Foreign key columns
- Frequently queried columns (handles, slugs, status fields)
- Composite indexes for common query patterns

## Issues Fixed

The complete schema fixes the following issues from the original migrations:

1. ✅ Missing foreign key constraint: `venue_collab_options.venue_user_id` → `profiles.id`
2. ✅ Missing foreign key constraint: `collab_request_venue_options.collab_request_id` → `collab_requests.id`
3. ✅ Missing foreign key constraint: `collab_request_venue_options.venue_collab_option_id` → `venue_collab_options.id`
4. ✅ Added performance indexes for common queries
5. ✅ Consistent function security settings (SECURITY DEFINER with search_path)

## Verification

After setting up the database, verify the schema:

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check foreign keys
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

## Troubleshooting

### Migration Errors

If you encounter errors when applying migrations:

1. Check if enums already exist (they may have been created in a previous migration)
2. Check if tables already exist
3. Use `IF NOT EXISTS` clauses or drop and recreate if needed

### Foreign Key Violations

If you see foreign key violations:
- Ensure parent records exist before creating child records
- Check that referenced IDs are valid UUIDs
- Verify cascade delete behavior is appropriate

### RLS Policy Issues

If users can't access data:
- Check that RLS policies are correctly defined
- Verify `auth.uid()` is returning the correct user ID
- Test policies with different user roles

## Next Steps

After setting up the database:

1. Generate TypeScript types:
   ```bash
   supabase gen types typescript --local > src/integrations/supabase/types.ts
   ```

2. Set up storage buckets (if needed for images):
   - `avatars` - User profile pictures
   - `product-images` - Product thumbnails
   - `cover-images` - Profile cover images

3. Configure authentication providers in Supabase Dashboard

4. Set up any additional functions or triggers as needed

## Support

For issues or questions:
- Check Supabase documentation: https://supabase.com/docs
- Review the migration files in `supabase/migrations/`
- Check the TypeScript types in `src/integrations/supabase/types.ts` for expected structure

