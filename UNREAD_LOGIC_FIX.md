# Unread Message Logic Fix

## Summary
Fixed unread message logic to correctly count only messages from OTHER orgs, not sender's own messages.

## Changes Made

### Database (Migration: `20260120000008_fix_unread_message_logic.sql`)

1. **Updated RPC Function `get_unread_enquiries_count()`**
   - **Old Logic:** Counted conversations where `conversations.last_message_at > last_read_at`
   - **Problem:** This treated sender's own messages as unread
   - **New Logic:** Counts conversations where there EXISTS a message from another org (`sender_org_id <> p_org_id`) that was sent after `last_read_at` (or if `last_read_at` is NULL)
   - **Query:**
     ```sql
     SELECT COUNT(DISTINCT cp.conversation_id)
     FROM conversation_participants cp
     WHERE cp.org_id = p_org_id
       AND EXISTS (
         SELECT 1
         FROM conversation_messages m
         WHERE m.conversation_id = cp.conversation_id
           AND m.sender_org_id <> p_org_id
           AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
       )
     ```

2. **Added Performance Index**
   - Created index: `idx_conversation_messages_conv_sender_created`
   - On: `(conversation_id, sender_org_id, created_at DESC)`
   - Purpose: Optimize the EXISTS subquery in unread count calculation

### Frontend Changes

1. **MessagesThreadPage.tsx**
   - ✅ **Mark as read on open:** `markAsRead()` is called AFTER messages are loaded (not before)
   - ✅ **No mark on send:** `handleSend()` does NOT call `markAsRead()` - sender's badge won't increase

2. **MessagesComposerPage.tsx**
   - ✅ **No mark on send:** Already correct - doesn't mark as read when sending

## Verification Steps

### Test Case 1: Sender sends message
1. Org A sends message to Org B
2. **Expected:** Org A's unread badge does NOT increase
3. **Expected:** Org B's unread badge increases

### Test Case 2: Receiver opens thread
1. Org B opens the conversation thread
2. **Expected:** Org B's unread badge decreases
3. **Expected:** `conversation_participants.last_read_at` is updated for Org B

### Test Case 3: Booking requests (unchanged)
1. Create booking request for Org A's space
2. **Expected:** Org A's unread badge increases
3. **Expected:** Opening Enquiries page marks request as seen and badge decreases

## Technical Details

### Unread Message Logic
- A conversation is unread if:
  - There exists at least one message from another org (`sender_org_id <> current_org_id`)
  - AND that message was sent after `last_read_at` (or `last_read_at` is NULL)

### Mark as Read Behavior
- **When opening thread:** `last_read_at` is updated to current timestamp
- **When sending message:** `last_read_at` is NOT updated (sender doesn't mark own messages as read)

### Performance
- Index `idx_conversation_messages_conv_sender_created` optimizes the EXISTS subquery
- Uses `COUNT(DISTINCT conversation_id)` to avoid double-counting conversations with multiple unread messages

## Migration Order
1. `20260120000006_add_unread_enquiries_badge.sql` - Initial unread badge feature
2. `20260120000007_fix_conversation_last_message_at_trigger.sql` - Fix trigger for last_message_at
3. `20260120000008_fix_unread_message_logic.sql` - Fix unread logic (this fix)

## Notes
- TypeScript errors in MessagesThreadPage.tsx are due to missing conversation table types in Supabase types.ts - these are pre-existing and don't affect runtime behavior
- The unread badge hook (`useUnreadEnquiriesCount`) automatically polls every 30 seconds and refetches on window focus


