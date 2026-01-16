# Connected Orgs Count vs List Mismatch - DEBUG & FIX

## Problem

**Symptom:** Connection count shows "1", but when clicking to view "All connected", it shows "No connected orgs yet".

## Root Cause

The issue is caused by **Row Level Security (RLS)** policies on the `orgs` table blocking access to connected org details.

### How it happens:

1. **Count Query** (`get_connected_count` / `get_connected_count_public`):
   - Simply counts rows in the `connections` table where `status = 'accepted'`
   - Does NOT join with the `orgs` table
   - Result: Count = 1 ✅

2. **List Query** (`get_connected_orgs` / `get_connected_orgs_public`):
   - Counts connections AND joins with `orgs` table to get org details (name, handle, logo, etc.)
   - **RLS policy on `orgs` table blocks access** to orgs the user is not a member of
   - Result: Empty list ❌

### The RLS Policy Blocking Access

From `20250110000001_create_orgs.sql`:

```sql
CREATE POLICY "Users can view orgs they belong to"
  ON orgs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = orgs.id
      AND org_members.user_id = auth.uid()
    )
  );
```

This policy only allows users to see orgs they are members of. When the `get_connected_orgs` RPC tries to get details of connected orgs, it can't access orgs the user is not a member of.

### Why existing policies don't help:

Two other policies exist but don't solve this:

1. **"Authenticated users can view orgs for messaging"** - Uses `TO authenticated`, which doesn't apply when the function runs as `SECURITY DEFINER`
2. **"Public can view orgs by slug for booking"** - Only applies when `slug IS NOT NULL`, may not cover all connected orgs

## Solution

Add a new RLS policy that allows users to view orgs they are connected to via accepted connections.

### Migration Created

File: `supabase/migrations/20260232000000_fix_connected_orgs_rls_access.sql`

This migration adds a policy that allows authenticated users to view orgs that have accepted connections with their orgs.

## How to Apply the Fix

### Option 1: Via Supabase Dashboard (Recommended for Lovable projects)

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase/migrations/20260232000000_fix_connected_orgs_rls_access.sql`
4. Click **Run**

### Option 2: Via Git + Lovable (If using Lovable CI/CD)

1. Commit and push the migration file:
   ```bash
   git add supabase/migrations/20260232000000_fix_connected_orgs_rls_access.sql
   git commit -m "Fix: Allow viewing connected orgs RLS policy"
   git push
   ```
2. Lovable will automatically apply migrations (if configured)

### Option 3: Via Supabase CLI

```bash
supabase migration up
```

## Verification

After applying the migration, test:

1. Navigate to a public profile that shows a connection count
2. Click on the connection count
3. Verify that the "All connected" section now shows the connected orgs

You should see the count match the number of orgs displayed.

## Technical Details

### The Fix Explained

The new policy uses this logic:

```sql
CREATE POLICY "Users can view connected orgs"
  ON orgs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM connections c
      INNER JOIN org_members om ON (
        om.user_id = auth.uid() 
        AND om.org_id IN (c.org_a_id, c.org_b_id)
      )
      WHERE c.status = 'accepted'
      AND orgs.id IN (c.org_a_id, c.org_b_id)
      AND orgs.id != om.org_id
    )
  )
```

This allows viewing an org if:
1. There's an accepted connection
2. The user is a member of one of the orgs in that connection
3. The org being viewed is the "other" org in the connection (not the user's own org)

### Why this is safe:

- Only exposes orgs that have explicitly accepted a connection
- User must be a member of the connected org
- Only basic org information is exposed (name, slug, etc.)
- More sensitive data is in `org_profiles` which has its own RLS

## Alternative Considered

Another approach would be to modify the RPC functions to use a subquery that bypasses RLS, but adding a proper RLS policy is cleaner and more maintainable.

## Files Modified

- ✅ Created: `supabase/migrations/20260232000000_fix_connected_orgs_rls_access.sql`
- ✅ Documented: `CONNECTED_ORGS_RLS_FIX.md` (this file)

## Status

- [x] Issue identified
- [x] Root cause found (RLS blocking access)
- [x] Migration created
- [ ] Migration applied (waiting for deployment)
- [ ] Verified in production

---

**Date:** 2026-01-16  
**Issue:** Count shows 1, list shows 0  
**Fix:** Add RLS policy to allow viewing connected orgs
