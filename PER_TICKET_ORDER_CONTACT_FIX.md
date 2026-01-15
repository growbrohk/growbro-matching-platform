# Per-Ticket Order Contact Fix

## Problem Summary

In Per-Ticket mode, `create_event_booking` derived `orders.buyer_email` from `attendees[0].email` (Attendee 1). When guests submitted PayMe/FPS receipts, they received "Unauthorized: Email does not match order buyer_email" because:

1. No stable "Order Contact (Primary Booker)" email was explicitly collected
2. `orders.buyer_email` could be different from the email used for receipt submission
3. If Attendee 1 wasn't the actual contact person, email mismatches occurred

## Solution Implemented

### A) Frontend: CompleteBookingPage.tsx

**Changes:**
1. Added "Order Contact (Primary Booker)" section above attendee list in Per-Ticket mode
   - Fields: `first_name`, `last_name`, `email` (required), `phone` (optional)
   - Email is always required for guest bookings

2. Added toggle checkbox: "Use Attendee 1 as Order Contact" (default: ON)
   - When ON: Order Contact fields auto-sync from Attendee 1 fields
   - When OFF: Order Contact can be edited independently
   - Fields are disabled when toggle is ON

3. Updated validation:
   - Order Contact email is required for Per-Ticket mode
   - Form validation checks both attendees and Order Contact

4. Updated booking submission:
   - Always passes Order Contact info as `p_buyer_*` parameters to `create_event_booking`
   - Uses `orderContact` instead of `contactInfo` for Per-Ticket mode

**File:** `src/pages/checkout/CompleteBookingPage.tsx`

### B) Backend: create_event_booking SQL Function

**Changes:**
1. Updated order contact determination logic to **ALWAYS prefer `p_buyer_email`** over `attendees[0].email`
2. Uses `COALESCE(NULLIF(p_buyer_email, ''), attendees[0].email)` pattern
   - This ensures `p_buyer_email` (Order Contact) is used if provided
   - Falls back to Attendee 1 only if `p_buyer_email` is empty (backward compatibility)

**Files:**
- `supabase/migrations/20260215000000_fix_server_side_amounts.sql` (updated)
- `supabase/migrations/20260217000000_fix_per_ticket_order_contact.sql` (new migration)

### C) PaymentPage Verification

**Verified:**
- PaymentPage does NOT ask users to re-enter email
- Uses `order.buyer_email` from RPC function for authorization
- `submit_payment_receipt` RPC checks JWT email against `orders.buyer_email`

**File:** `src/pages/booking/PaymentPage.tsx` (no changes needed)

## Flow After Fix

1. **Per-Ticket Booking Creation:**
   - User fills Order Contact section (or uses Attendee 1 via toggle)
   - Order Contact email is passed as `p_buyer_email` to `create_event_booking`
   - `orders.buyer_email` = Order Contact email (stable, explicit)

2. **Receipt Submission:**
   - User navigates to PaymentPage (no email re-entry)
   - User authenticates with Order Contact email (if guest)
   - `submit_payment_receipt` checks: `JWT email == orders.buyer_email`
   - ✅ Authorization succeeds because emails match

## Acceptance Tests

### Test 1: Per-Ticket + Guest (Toggle ON)
1. Fill attendees (including Attendee 1 email)
2. Toggle "Use Attendee 1" is ON (default)
3. Order Contact auto-fills from Attendee 1
4. Create order → `orders.buyer_email` = Attendee 1 email
5. Submit PayMe/FPS receipt with Attendee 1 email
6. ✅ Should NOT show "Unauthorized" error

### Test 2: Per-Ticket + Guest (Toggle OFF)
1. Fill attendees (including Attendee 1 email)
2. Toggle "Use Attendee 1" is OFF
3. Enter custom Order Contact email (different from Attendee 1)
4. Create order → `orders.buyer_email` = Order Contact email
5. Submit PayMe/FPS receipt with Order Contact email
6. ✅ Should NOT show "Unauthorized" error

### Test 3: Primary Booker Mode (Unchanged)
1. Fill contact info (not Per-Ticket mode)
2. Create order → `orders.buyer_email` = contact email
3. Submit receipt → ✅ Works as before

## Files Changed

1. `src/pages/checkout/CompleteBookingPage.tsx` - Added Order Contact section
2. `supabase/migrations/20260215000000_fix_server_side_amounts.sql` - Updated function logic
3. `supabase/migrations/20260217000000_fix_per_ticket_order_contact.sql` - New migration (optional, can use existing)

## Migration Instructions

Run the migration:
```bash
supabase migration up
```

Or apply the SQL changes from `20260217000000_fix_per_ticket_order_contact.sql` to your database.

## Notes

- For anonymous users submitting receipts, they must authenticate with the Order Contact email first
- This is a security measure to prevent unauthorized receipt submissions
- The fix ensures `orders.buyer_email` is always stable and matches the UI-collected Order Contact email

