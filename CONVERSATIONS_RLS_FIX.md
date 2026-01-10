# Conversations RLS Policy Fix

## Problem
- Thread page shows "conversation not found" after sending a message
- Enquiries may not list conversations for the receiver

## Root Cause
Missing or incorrect RLS SELECT policy on `public.conversations` and `public.conversation_participants`, so participants cannot SELECT the conversation row by id.

The previous `conversation_participants` policy only allowed users to see participant rows where they're a member of that participant's org. This prevented users from seeing the OTHER participant in a conversation, causing:
1. MessagesThreadPage cannot find the other org → "Conversation not found"
2. Enquiries page cannot fetch other participant details → conversations don't appear

## Solution Applied

### Migration: `20260120000005_fix_conversations_rls_policies.sql`

#### 1. Created Helper Function: `user_can_access_conversation()`
- **Type:** SECURITY DEFINER function (bypasses RLS to break recursion)
- **Purpose:** Check if current user is a member of any org participating in a conversation
- **Why:** Avoids infinite recursion by querying `conversation_participants` without RLS checks

#### 2. Fixed `conversations` SELECT Policy
- **Policy:** "Users can view their conversations"
- **Logic:** Uses `user_can_access_conversation()` function to check access

#### 3. Fixed `conversation_participants` SELECT Policy
- **Policy:** "cp_select_if_member"
- **Logic:** Allow SELECT if:
  1. User is a member of the participant's org (can see their own org's participation), OR
  2. User can access the conversation (via helper function - breaks recursion)

This ensures users can see BOTH participants in a conversation, not just their own org's participation, while avoiding infinite recursion.

## Frontend Verification

The frontend code is already correct:
- ✅ `Enquiries.tsx`: Queries conversations via `conversation_participants.org_id = currentOrg.id` (line 187-190)
- ✅ `Enquiries.tsx`: Fetches other org details with `org_profiles` join (line 243-251)
- ✅ `MessagesThreadPage.tsx`: Fetches participants and finds other org correctly (line 59-66)
- ✅ `MessagesThreadPage.tsx`: Fetches other org with `org_profiles` (line 74-83)

No frontend changes needed.

## Manual Test Steps

### Prerequisites
- Two orgs: Org A and Org B
- User A is a member of Org A
- User B is a member of Org B

### Test 1: Send Message and Navigate to Thread
1. Login as User A (member of Org A)
2. Navigate to compose message to Org B
3. Send a message
4. **Expected:** Navigates to `/messages/:conversationId` and loads successfully
5. **Expected:** Thread header shows Org B name + category + address
6. **Expected:** Message appears in thread

### Test 2: Receiver Sees Conversation in Enquiries
1. Login as User B (member of Org B)
2. Navigate to `/app/enquiries`
3. Filter by "Messages"
4. **Expected:** Conversation with Org A appears in list
5. **Expected:** Shows Org A name, category, location, and message preview
6. Click on conversation
7. **Expected:** Navigates to thread page and loads successfully

### Test 3: Both Can Send/Receive Messages
1. In thread view (User A or User B)
2. Send a message
3. **Expected:** Message appears immediately
4. Switch to other user account
5. **Expected:** New message appears in thread
6. **Expected:** Conversation appears in Enquiries with updated preview

### Test 4: Verify RLS Policies
Run these queries as User A (member of Org A):

```sql
-- Should return conversations where Org A participates
SELECT * FROM conversations;

-- Should return BOTH participants (Org A and Org B)
SELECT * FROM conversation_participants WHERE conversation_id = '<conversation_id>';

-- Should return all messages in the conversation
SELECT * FROM conversation_messages WHERE conversation_id = '<conversation_id>';
```

All queries should succeed and return expected data.

## Files Changed

1. **Migration:** `supabase/migrations/20260120000005_fix_conversations_rls_policies.sql`
   - Fixed `conversations` SELECT policy
   - Fixed `conversation_participants` SELECT policy

2. **Frontend:** No changes needed (already correct)

## Notes

- **Recursion Prevention:** The `conversation_participants` policy uses a SECURITY DEFINER helper function to check conversation access. This function bypasses RLS when querying `conversation_participants`, breaking the recursion cycle that would occur if the policy referenced itself directly.

- **Security:** The fix maintains security: users can only see conversations where they're a participant (via org membership). The SECURITY DEFINER function still checks org membership, it just bypasses RLS to avoid recursion.

- **Why SECURITY DEFINER:** PostgreSQL RLS policies cannot reference the same table they're protecting without causing recursion. By using a SECURITY DEFINER function, we can query `conversation_participants` without triggering RLS, then use the result in the policy check.

