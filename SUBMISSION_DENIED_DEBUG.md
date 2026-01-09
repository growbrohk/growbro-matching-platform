# Why Submission is Denied for "Table User"

## Understanding the Issue

When you mention "table user", this could refer to:
1. **Database user** (e.g., `postgres` user) inserting directly into the table
2. **Service role** user in Supabase
3. **Anonymous/unauthenticated** user through Supabase client
4. **Authenticated user** without proper permissions

## Current RLS Policy

The `poster_space_booking_requests` table has this INSERT policy:

```sql:130:132:supabase/migrations/20250131000001_create_poster_spaces.sql
CREATE POLICY "Anyone can create booking requests"
  ON poster_space_booking_requests FOR INSERT
  WITH CHECK (true);
```

This policy should allow **anyone** (authenticated or anonymous) to insert booking requests.

## Possible Causes of Denial

### 1. **RLS Bypass Issue with Service Role**

If you're using the **service role key** (which bypasses RLS), the insert should work. However, if you're using a **database user** directly (like `postgres`), RLS policies still apply.

**Solution**: Use Supabase client with proper authentication context, or ensure you're using service role if you need to bypass RLS.

### 2. **Foreign Key Constraint Failure**

The `poster_space_id` has a foreign key constraint:

```sql:36:36:supabase/migrations/20250131000001_create_poster_spaces.sql
poster_space_id uuid NOT NULL REFERENCES poster_spaces(id) ON DELETE CASCADE,
```

If the `poster_space_id` doesn't exist or isn't accessible due to RLS on `poster_spaces`, the insert will fail.

**Check**: Verify the `poster_space_id` exists and is accessible:
```sql
SELECT id FROM poster_spaces WHERE id = '<your-space-id>';
```

### 3. **RLS on `poster_spaces` Table Blocking Foreign Key Check**

Even though the INSERT policy allows inserts, Supabase might need to verify the foreign key relationship. The `poster_spaces` table has RLS enabled:

```sql:80:82:supabase/migrations/20250131000001_create_poster_spaces.sql
CREATE POLICY "Public can view published poster spaces"
  ON poster_spaces FOR SELECT
  USING (status = 'published');
```

If the space is not published (`status != 'published'`), anonymous users cannot see it, which might cause the foreign key check to fail.

**Solution**: Ensure the poster space has `status = 'published'` if inserting as anonymous user.

### 4. **Missing Required Fields**

The table requires these NOT NULL fields:
- `poster_space_id` (uuid, NOT NULL)
- `requested_start_date` (date, NOT NULL)
- `duration_units` (int, NOT NULL)
- `computed_end_date` (date, NOT NULL)
- `status` (text, NOT NULL, defaults to 'pending')

**Check**: Verify all required fields are provided in the insert.

### 5. **Check Constraint Violation**

The `status` field has a CHECK constraint:
```sql:44:44:supabase/migrations/20250131000001_create_poster_spaces.sql
status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
```

**Check**: Ensure status is one of: 'pending', 'approved', 'declined', 'cancelled'

## Code Flow Analysis

### Frontend Submission

```typescript:246:255:src/pages/public/PublicPosterSpaceRequest.tsx
const request = await createBookingRequest({
  poster_space_id: space.id,
  requester_user_id: user?.id || null,
  requester_name: formData.requester_name || undefined,
  requester_email: formData.requester_email || undefined,
  message: formData.message || null,
  requested_start_date: formData.requested_start_date,
  duration_units: formData.duration_units,
  computed_end_date: endDate,
});
```

### API Function

```typescript:343:358:src/lib/api/poster-spaces.ts
export async function createBookingRequest(
  input: CreateBookingRequestInput
): Promise<PosterSpaceBookingRequest> {
  const { data, error } = await supabase
    .from('poster_space_booking_requests')
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error('Error creating booking request:', error);
    throw error;
  }

  return data as PosterSpaceBookingRequest;
}
```

## How to Debug

### 1. Check Browser Console

When submission fails, check the browser console for the error:
```typescript:263:265:src/pages/public/PublicPosterSpaceRequest.tsx
} catch (error: any) {
  console.error('Error creating booking request:', error);
  toast.error(error.message || 'Failed to submit booking request');
}
```

The error object will contain:
- `error.message` - Human-readable error message
- `error.code` - Error code (e.g., '23503' for foreign key violation, '42501' for permission denied)
- `error.details` - Additional details

### 2. Check Supabase Logs

In Supabase Dashboard:
1. Go to **Logs** → **Postgres Logs**
2. Look for errors related to `poster_space_booking_requests`
3. Check for RLS policy violations or constraint violations

### 3. Test Direct Insert

Test if the insert works with service role:

```sql
-- Using service role (bypasses RLS)
INSERT INTO poster_space_booking_requests (
  poster_space_id,
  requested_start_date,
  duration_units,
  computed_end_date
) VALUES (
  '<valid-space-id>',
  '2025-02-10',
  3,
  '2025-02-12'
);
```

### 4. Verify Space Accessibility

Check if the space is accessible:

```sql
-- As anonymous user (should see published spaces)
SELECT id, status FROM poster_spaces WHERE id = '<space-id>';

-- As authenticated user (should see org spaces)
SELECT id, status FROM poster_spaces WHERE id = '<space-id>';
```

## Common Error Codes

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `42501` | Permission denied | Check RLS policies |
| `23503` | Foreign key violation | Verify `poster_space_id` exists and is accessible |
| `23502` | NOT NULL violation | Ensure all required fields are provided |
| `23514` | Check constraint violation | Verify status value is valid |

## Solutions

### Solution 1: Ensure Space is Published

If inserting as anonymous user, ensure the poster space is published:

```sql
UPDATE poster_spaces 
SET status = 'published' 
WHERE id = '<space-id>';
```

### Solution 2: Use Authenticated User

If the space is not published, use an authenticated user who is a member of the org:

```typescript
// The user must be authenticated and member of the org
const { data: { user } } = await supabase.auth.getUser();
```

### Solution 3: Check RLS Policies

Verify RLS policies allow the operation:

```sql
-- Check current policies
SELECT * FROM pg_policies 
WHERE tablename = 'poster_space_booking_requests';
```

### Solution 4: Use Service Role for Admin Operations

If you need to insert as admin (bypassing RLS), use service role:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role bypasses RLS
);
```

## Testing Checklist

- [ ] Verify `poster_space_id` exists in `poster_spaces` table
- [ ] Check if space `status = 'published'` (for anonymous users)
- [ ] Verify user is authenticated (if space is not published)
- [ ] Check all required fields are provided
- [ ] Verify `status` value is valid ('pending', 'approved', 'declined', 'cancelled')
- [ ] Check browser console for specific error message
- [ ] Check Supabase logs for database errors
- [ ] Verify RLS policies are correctly configured

## Next Steps

1. **Check the actual error message** in browser console or Supabase logs
2. **Verify the space exists and is accessible** based on user context
3. **Test with service role** to isolate RLS issues
4. **Review RLS policies** if permission denied errors persist

