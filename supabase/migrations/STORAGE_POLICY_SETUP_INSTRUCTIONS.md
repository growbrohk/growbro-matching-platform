# Storage Policy Setup Instructions

## ⚠️ Permission Error Fix

If you're getting `ERROR: 42501: must be owner of relation objects`, this is because storage policies require elevated permissions that normal migrations don't have. This can occur even when running SQL in the Dashboard SQL Editor.

## ✅ Solution: Use Storage Policy UI (Recommended when SQL Editor fails)

When the SQL Editor returns "must be owner of relation objects", use the **Storage** section of the Dashboard instead. The Storage UI uses a different code path and typically succeeds.

### Step-by-Step Instructions

1. Go to **Storage** → **Policies**
2. Select the `payment-receipts` bucket
3. If a policy **"Users can view their own payment receipts"** already exists, delete it (trash icon) before creating the new one
4. Create policies as described below

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
2. Choose **"For full customization"** (or equivalent) so you can paste custom SQL
3. Configure:
   - **Policy Name**: `Users can view their own payment receipts`
   - **Allowed Operation**: `SELECT`
   - **Policy Definition** (USING expression): Use this SQL:

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
  OR
  (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM orders o
      JOIN org_members om ON om.org_id = o.host_org_id
      WHERE o.id::text = split_part(name, '/', 1)
      AND o.host_org_id IS NOT NULL
      AND om.user_id = auth.uid()
    )
  )
)
```

4. Save the policy

### Product orders (hosts view receipts)

The fourth `OR` clause in the SELECT policy above allows hosts (org members) to view PayMe/FPS receipts for **product orders** in Enquiries. When `orders.host_org_id` matches the host's org, they can load the receipt. Without this clause, product order receipts fail to load in the Enquiries page.

### Alternative: hosts_can_view_payment_receipts (hosts only)

If your SELECT policy is named `hosts_can_view_payment_receipts` and only allows hosts (no buyer/anon), use this USING expression:

```sql
bucket_id = 'payment-receipts' AND (
  EXISTS (
    SELECT 1 FROM orders o
    JOIN events e ON e.id = o.event_id
    JOIN org_members om ON om.org_id = e.org_id
    WHERE o.id::text = split_part(name, '/', 1) AND om.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM orders o
    JOIN org_members om ON om.org_id = o.host_org_id
    WHERE o.id::text = split_part(name, '/', 1) AND o.host_org_id IS NOT NULL AND om.user_id = auth.uid()
  )
)
```

Full SQL for SQL Editor: `supabase/migrations/manual/20260319000017_hosts_can_view_payment_receipts_product_orders.sql`

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

## Alternative: SQL Editor (if it works)

If the SQL Editor does not return "must be owner of relation objects", you can run the policy SQL directly:

1. Open: **SQL Editor** → New Query
2. Copy the policy SQL from `supabase/migrations/manual/20260319000016_payment_receipt_storage_product_orders.sql`
3. Paste and Run

## Why This Happens

Storage policies are created on the `storage.objects` system table, which requires superuser permissions. Regular database migrations run with limited permissions for security reasons. The Supabase Dashboard SQL Editor may still fail with "must be owner of relation objects" in some setups; in those cases, use the Storage Policy UI.

