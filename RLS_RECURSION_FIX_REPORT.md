# RLS Infinite Recursion Fix Report

## Problem
Supabase was throwing "infinite recursion detected in policy for relation conversation_messages" when sending messages.

## Root Cause
RLS policies formed a cycle:
- `conversation_messages` SELECT policy → references `conversation_participants`
- `conversation_participants` SELECT policy → references `conversation_messages`
- This created: `conversation_messages` ↔ `conversation_participants` (CYCLE)

## Solution Applied
Created migration: `20260120000003_fix_rls_infinite_recursion.sql`

### Changes Made

#### 1. Fixed `conversation_messages` SELECT Policy
**Policy:** "Users can view messages from their conversations"
- **Before:** Referenced `conversation_participants` (which referenced `conversation_messages` back)
- **After:** References `conversation_participants` + `org_members` only
- **Logic:** User can view messages if they're a member of an org that participates in the conversation

#### 2. Fixed `conversation_messages` INSERT Policy
**Policy:** "Users can insert messages as sender"
- **Before:** Referenced `conversation_participants` (which referenced `conversation_messages` back)
- **After:** References `org_members` + `conversation_participants` only
- **Logic:** User can insert if:
  - They're a member of `sender_org_id`
  - AND `sender_org_id` is a participant in the conversation

#### 3. Fixed `conversation_participants` SELECT Policy (CRITICAL)
**Policy:** "cp_select_if_member"
- **Before:** Referenced `conversation_messages` (creating the cycle)
- **After:** References ONLY `org_members` (NO `conversation_messages`)
- **Logic:** User can see participant rows where they're a member of that participant's org
- **Dropped:** "Users can view participants of their conversations" (contained `conversation_messages` reference)

#### 4. Verified `org_members` SELECT Policy
**Policy:** "org_members_select_own"
- **Status:** Already correct, recreated to ensure consistency
- **Logic:** Users can view their own org memberships (`user_id = auth.uid()`)
- **Note:** Existing "Users can view members of their orgs" policy remains (only references `org_members` itself)

## Policy Dependency Graph (After Fix)

```
conversation_messages (SELECT)
  └─> conversation_participants
        └─> org_members
              └─> (no further references - BASE)

conversation_messages (INSERT)
  ├─> org_members (BASE)
  └─> conversation_participants
        └─> org_members (BASE)

conversation_participants (SELECT)
  └─> org_members (BASE)

org_members (SELECT)
  └─> (self-reference only: user_id = auth.uid())
```

**Result:** No cycles! All paths terminate at `org_members` or self-references.

## Verification Checklist

- [x] `conversation_messages` policies NEVER reference `conversation_messages`
- [x] `conversation_participants` policies NEVER reference `conversation_messages`
- [x] `org_members` policies NEVER reference `conversation_messages`
- [x] All message access decided via `org_members` + `conversation_participants` only
- [x] No views or functions used in RLS policies
- [x] Logic is inline and explicit

## Next Steps

1. **Apply Migration:** Run the migration file against your Supabase database
2. **Test Message Sending:** Verify that sending messages no longer throws recursion errors
3. **Test Message Reading:** Verify that reading messages in conversations works correctly
4. **Monitor:** Watch for any "infinite recursion detected" errors

## Files Changed

- `supabase/migrations/20260120000003_fix_rls_infinite_recursion.sql` (NEW)

## Migration Order

The migration file is named with timestamp `20260120000003` to run after:
- `20260120000000_create_conversations.sql` (creates tables and initial policies)
- `20260120000001_fix_conversation_participants_rls_recursion.sql` (previous fix attempt - now superseded)
- `20260120000002_allow_org_lookup_for_messaging.sql` (unrelated)

