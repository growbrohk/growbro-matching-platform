# Payment Receipt RLS Migration Instructions

## Overview

This migration fixes RLS policies to allow buyers to upload payment receipts and update their orders. It's split into two files due to permission requirements:

1. **20260201000000_fix_payment_receipt_rls.sql** - Orders policies (can run with normal permissions)
2. **20260201000001_fix_payment_receipt_storage_rls.sql** - Storage policies (requires elevated permissions)

## Running the Migrations

### Option 1: Run Both Migrations Separately

**Step 1: Run orders migration (normal permissions)**
```bash
supabase migration up
# or
supabase db reset  # if starting fresh
```

**Step 2: Run storage migration (elevated permissions)**

If running locally:
```bash
# Connect as postgres superuser
psql -U postgres -d postgres -f supabase/migrations/20260201000001_fix_payment_receipt_storage_rls.sql
```

If running on Supabase Cloud:
1. Go to Supabase Dashboard > SQL Editor
2. Use the SQL Editor (it runs with service_role permissions)
3. Copy and paste the contents of `20260201000001_fix_payment_receipt_storage_rls.sql`
4. Run the query

### Option 2: Create Storage Policies Manually via Dashboard

If you can't run the storage migration with elevated permissions:

1. Go to Supabase Dashboard > Storage > Policies
2. Select the `payment-receipts` bucket
3. Click "New Policy"
4. Create two policies using the SQL from `20260201000001_fix_payment_receipt_storage_rls.sql`:

   **Policy 1: INSERT (Upload)**
   - Policy name: `Users can upload payment receipts`
   - Policy type: `INSERT`
   - Use the WITH CHECK clause from the migration file

   **Policy 2: SELECT (View)**
   - Policy name: `Users can view their own payment receipts`
   - Policy type: `SELECT`
   - Use the USING clause from the migration file

## Verification

After running both migrations, verify they worked:

```sql
-- Check orders UPDATE policy exists
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'orders' 
AND policyname = 'Buyers can update their own order payment info';

-- Check storage policies exist
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND policyname IN (
  'Users can upload payment receipts',
  'Users can view their own payment receipts'
);
```

## Troubleshooting

### Error: "must be owner of relation objects"

This means you're trying to create storage policies without elevated permissions. Use Option 2 above (manual creation via Dashboard) or run the storage migration with superuser permissions.

### Error: "policy already exists"

If policies already exist, you can drop them first:
```sql
DROP POLICY IF EXISTS "Users can upload payment receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own payment receipts" ON storage.objects;
```

Then re-run the migration.

## What These Migrations Do

1. **Orders UPDATE Policy**: Allows buyers to update payment fields (`receipt_url`, `payment_status`, `paid_at`, `payment_method`, `submitted_at`) on their own orders
   - Supports authenticated users (by `buyer_user_id`)
   - Supports guest checkout (by `buyer_email` matching JWT email)
   - Supports anonymous users (email match + 1-hour window)

2. **Storage Policies**: Allows users to upload and view payment receipts
   - INSERT policy: Users can upload receipts to orders they own
   - SELECT policy: Users can view their own receipts; hosts can view receipts for their events

3. **Trigger**: Automatically sets `buyer_user_id` for authenticated users on order insert

