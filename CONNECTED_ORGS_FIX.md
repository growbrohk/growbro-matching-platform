# Connected Orgs Display Fix

## Problem

The Connect count shows `1` but no connected orgs appear in the user profile or connections page.

## Root Cause

There's a **column name mismatch** between the two RPC functions:

### `get_connected_orgs` (member version)
Returns columns: `other_org_id`, `other_org_name`, `other_org_handle`, `other_org_avatar_url`

### `get_connected_orgs_public` (public version)  
Returns columns: `org_id`, `name`, `handle`, `avatar_url`

### Frontend Expectation
The `ConnectedOrg` interface in `use-connected-orgs.ts` expects: `org_id`, `name`, `handle`, `avatar_url`

**Result:** When a user views their own profile (using member RPC), the column names don't match, causing an empty list even though connections exist.

## Solution

Update the `get_connected_orgs` function to return consistent column names matching the public version and frontend interface.

## How to Apply the Fix

### Option 1: Using Supabase CLI (Recommended)

If you have Supabase CLI installed:

```bash
supabase db push
```

This will apply the migration file: `supabase/migrations/20260229000000_fix_connected_orgs_column_names.sql`

### Option 2: Supabase Dashboard SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `supabase/migrations/20260229000000_fix_connected_orgs_column_names.sql`
5. Run the query

### Option 3: Install Supabase CLI and apply migration

```bash
# Install Supabase CLI
npm install -g supabase

# Push the migration
supabase db push
```

## Verification

After applying the fix:

1. Navigate to your profile page
2. Check that the Connect count matches the number of orgs shown when you click on it
3. Visit `/app/org/{your-org-id}/connections` to see the list of connected orgs
4. Verify that both your profile and public profiles show the correct connected orgs count and list

## Files Modified

- **Created:** `supabase/migrations/20260229000000_fix_connected_orgs_column_names.sql` - Migration to fix the RPC function
- **Created:** `CONNECTED_ORGS_FIX.md` - This documentation file

## Technical Details

The fix updates the `get_connected_orgs` function to return:
- `org_id` instead of `other_org_id`
- `name` instead of `other_org_name`
- `handle` instead of `other_org_handle`
- `avatar_url` instead of `other_org_avatar_url`

This ensures consistency with the public RPC and frontend TypeScript interface.
