# Storage Policy Setup Instructions

## ⚠️ Permission Error Fix

If you're getting `ERROR: 42501: must be owner of relation objects`, this is because storage policies require elevated permissions that normal migrations don't have.

## ✅ Solution: Use Supabase Dashboard SQL Editor

The **easiest and recommended** way to create storage policies is via the Supabase Dashboard:

### Step-by-Step Instructions

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/[YOUR_PROJECT_ID]/sql/new
   - Or navigate: Your Project → SQL Editor → New Query

2. **Copy the SQL**
   - Open: `supabase/migrations/20260246000000_fix_payment_receipt_storage_minimal.sql`
   - Copy the entire contents (or run via `supabase migration up` if your setup supports it)

3. **Paste and Run**
   - Paste the SQL into the Dashboard SQL Editor
   - Click "Run" button
   - The Dashboard automatically uses `service_role` permissions, so it will work!

### Alternative: Create Policies via Dashboard UI

If you prefer not to use SQL, you can create the policies manually:

#### Policy 1: INSERT (Upload Receipts)

Minimal policy – allows anyone (including anonymous users) to upload. Fixes PayMe/FPS receipt upload for incognito/guest users.

1. Go to: **Storage** → **Policies** → Select `payment-receipts` bucket
2. Click **"New Policy"**
3. Configure:
   - **Policy Name**: `Users can upload payment receipts`
   - **Allowed Operation**: `INSERT`
   - **Policy Definition**: Use this SQL:

```sql
bucket_id = 'payment-receipts'
```

#### Policy 2: SELECT (View Receipts)

1. Click **"New Policy"** again
2. Configure:
   - **Policy Name**: `Users can view their own payment receipts`
   - **Allowed Operation**: `SELECT`
   - **Policy Definition**: Use this SQL:

```sql
bucket_id = 'payment-receipts' AND
(
  (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id::text = split_part(name, '/', 1)
      AND (
        o.buyer_user_id = auth.uid()
        OR
        (
          o.buyer_user_id IS NULL
          AND o.buyer_email IS NOT NULL
          AND (auth.jwt() ->> 'email') IS NOT NULL
          AND o.buyer_email = (auth.jwt() ->> 'email')
        )
        OR
        o.created_at > NOW() - INTERVAL '1 hour'
      )
    )
  )
  OR
  (
    auth.role() = 'anon' AND
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id::text = split_part(name, '/', 1)
      AND o.buyer_user_id IS NULL
      AND o.buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND o.buyer_email = (auth.jwt() ->> 'email')
      AND o.created_at > NOW() - INTERVAL '1 hour'
    )
  )
  OR
  (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM orders o
      JOIN events e ON e.id = o.event_id
      JOIN org_members om ON om.org_id = e.org_id
      WHERE o.id::text = split_part(name, '/', 1)
      AND om.user_id = auth.uid()
    )
  )
)
```

## Verification

After creating the policies, verify they exist:

```sql
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND policyname IN (
  'Users can upload payment receipts',
  'Users can view their own payment receipts'
);
```

You should see 2 rows returned.

## Why This Happens

Storage policies are created on the `storage.objects` system table, which requires superuser permissions. Regular database migrations run with limited permissions for security reasons. The Supabase Dashboard SQL Editor runs with `service_role` permissions, which allows it to create these policies.

