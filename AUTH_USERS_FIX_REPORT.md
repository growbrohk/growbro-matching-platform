# Auth.Users RLS Policy Fix Report

## Problem
Supabase error `42501: permission denied for table users` when:
- Pressing "Send message"
- Loading Enquiries/booking requests page
- Viewing messages

## Root Cause
RLS policy on `public.poster_space_booking_requests` was querying `auth.users` table:
```sql
requester_email = (SELECT email FROM auth.users WHERE id = auth.uid())
```

**Issue:** Client roles (authenticated/anonymous) cannot read from `auth.users` table, causing permission denied errors whenever the policy is evaluated.

## Solution Applied
Created migration: `20260120000004_fix_auth_users_reference.sql`

### Changes Made

#### Fixed `poster_space_booking_requests` SELECT Policy
**Policy:** "Users can view their own booking requests"

**Before:**
```sql
USING (
  requester_user_id = auth.uid()
  OR (requester_email IS NOT NULL AND requester_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
);
```

**After:**
```sql
USING (
  requester_user_id = auth.uid()
  OR (
    requester_email IS NOT NULL
    AND (auth.jwt() ->> 'email') IS NOT NULL
    AND requester_email = (auth.jwt() ->> 'email')
  )
);
```

**Key Changes:**
- ✅ Removed `SELECT email FROM auth.users WHERE id = auth.uid()`
- ✅ Replaced with `auth.jwt() ->> 'email'` (reads email from JWT token)
- ✅ Added null checks for safety
- ✅ Policy logic unchanged: users can view requests where `requester_user_id` matches OR `requester_email` matches their email

## Verification

### Other Policies Checked
- ✅ No other RLS policies reference `auth.users` table
- ✅ All other `poster_space_booking_requests` policies remain unchanged:
  - "Org members can view booking requests for their spaces" (unchanged)
  - "Org members can update booking requests for their spaces" (unchanged)
  - "Authenticated users can create booking requests" (unchanged)
  - "Anonymous users can create booking requests for published spaces" (unchanged)

### How It Works Now
1. **Authenticated users** can view booking requests where:
   - `requester_user_id = auth.uid()` (their user ID), OR
   - `requester_email` matches their JWT email claim

2. **Email matching** now uses JWT token instead of querying `auth.users`:
   - `auth.jwt() ->> 'email'` extracts email from the JWT token
   - No database query needed, no permission issues

## Testing Steps

### Manual Test Checklist

1. **Apply Migration**
   ```bash
   # Apply via Supabase CLI or dashboard
   supabase migration up
   ```

2. **Test Enquiries Page**
   - Navigate to `/app/enquiries` (or Enquiries page)
   - ✅ Should load without `42501` errors
   - ✅ Should display booking requests correctly

3. **Test Message Sending**
   - Navigate to a conversation or create a new message
   - Press "Send message"
   - ✅ Should succeed without `42501` errors
   - ✅ Message should appear in the conversation

4. **Test Message Display**
   - Open a conversation with existing messages
   - ✅ Messages should display correctly
   - ✅ No permission errors in console

5. **Test Booking Request Viewing**
   - As an authenticated user, view your own booking requests
   - ✅ Requests where `requester_user_id` matches should be visible
   - ✅ Requests where `requester_email` matches your email should be visible
   - ✅ Requests for other users should NOT be visible

## Files Changed

- `supabase/migrations/20260120000004_fix_auth_users_reference.sql` (NEW)

## Migration Order

The migration file is named with timestamp `20260120000004` to run after:
- `20260120000003_fix_rls_infinite_recursion.sql` (previous fix)
- `20260120000002_allow_org_lookup_for_messaging.sql`
- `20260120000001_fix_conversation_participants_rls_recursion.sql`
- `20260120000000_create_conversations.sql`

## Technical Notes

### Why `auth.jwt() ->> 'email'` Works
- JWT tokens contain user email in the `email` claim
- `auth.jwt()` returns the current JWT as JSONB
- `->> 'email'` extracts the email value as text
- No database query needed, no permission issues
- Available to all authenticated users

### Why `auth.users` Doesn't Work
- `auth.users` is a system table in the `auth` schema
- Client roles (authenticated/anonymous) cannot SELECT from `auth.users`
- Only service role or SECURITY DEFINER functions can access it
- RLS policies run with client role permissions

## Expected Outcomes

After applying this migration:
- ✅ No more `42501: permission denied for table users` errors
- ✅ Enquiries page loads successfully
- ✅ Message sending works without errors
- ✅ Messages display correctly
- ✅ Booking request viewing works for authenticated users
- ✅ All functionality preserved, just using safer JWT-based approach

