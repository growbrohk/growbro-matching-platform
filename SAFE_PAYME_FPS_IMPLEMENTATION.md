# SAFE PayMe/FPS Manual Payment Flow Implementation

## Summary

Implemented a secure PayMe/FPS manual payment flow where receipt upload does NOT mark orders as paid. Only host confirmation can mark orders as paid.

## Changes Made

### A) Database Migration (`supabase/migrations/20260216000000_safe_payme_fps_payment_flow.sql`)

#### 1. Created `submit_payment_receipt` RPC Function
- **Purpose**: Secure receipt submission that sets `payment_status='submitted'` (NOT 'paid')
- **Authorization**:
  - Authenticated users: Must match `buyer_user_id`
  - Guest orders: Email match + 1-hour window
- **Validation**:
  - Validates `payment_method` is 'payme' or 'fps'
  - Rejects free orders (`total_amount <= 0`)
  - Only allows transition from 'unpaid', 'failed', or 'submitted' status
  - Rejects cancelled orders
- **Updates**:
  - Sets `payment_method`, `receipt_url`, `payment_reference_link`, `submitted_at`
  - Sets `payment_status='submitted'`
  - **Does NOT set**: `paid_at`, `status='paid'`, `fulfillment_status='confirmed'`

#### 2. Tightened RLS Policies
- **Removed**: Policy that allowed buyers to update `payment_status`, `paid_at`, `confirmed_at`, `status`, `total_amount`, `fulfillment_status`
- **Created**: New restrictive policy that only allows updating buyer contact fields
- **Result**: Clients can no longer directly update payment fields - must use RPC

#### 3. Updated `update_order_fulfillment` RPC
- **For PayMe/FPS orders**: Requires `receipt_url` and `payment_status='submitted'` before confirming
- **On confirmation**: Sets `payment_status='paid'`, `paid_at`, `fulfillment_status='confirmed'`, `confirmed_at`, `status='paid'`
- **This is the ONLY way** PayMe/FPS orders become 'paid'

#### 4. Added Notification Trigger
- **Trigger**: `trigger_order_payment_submitted_send_message`
- **Fires**: When `payment_status` transitions to 'submitted'
- **Action**: Sends message to host via Edge Function to alert them that receipt needs verification

### B) Frontend Changes

#### 1. Updated `src/lib/payments/submitManualPayment.ts`
- **Changed**: Now calls `submit_payment_receipt` RPC instead of direct `updateOrderPayment`
- **Result**: Sets `payment_status='submitted'` instead of 'paid'
- **Security**: No longer allows client to mark orders as paid

#### 2. Updated `src/pages/booking/PaymentPage.tsx`
- **Changed**: Redirects to `/booking/pending/{orderId}` after receipt submission
- **Result**: Users see "Pending Confirmation" page instead of success page

#### 3. Deprecated `src/lib/api/bookings.ts` → `updateOrderPayment()`
- **Status**: Marked as deprecated
- **Reason**: Direct order updates are no longer allowed for security
- **Replacement**: Use `submitManualPayment()` from `@/lib/payments/submitManualPayment`

## Flow Diagram

```
User Flow:
1. User creates order → payment_status='unpaid', fulfillment_status='pending_confirmation'
2. User uploads receipt → submit_payment_receipt RPC
   → payment_status='submitted', submitted_at set, paid_at=NULL
   → Host receives notification
3. User sees "Pending Confirmation" page
4. Host confirms → update_order_fulfillment RPC
   → payment_status='paid', paid_at set
   → fulfillment_status='confirmed', confirmed_at set
   → status='paid'
   → Confirmation email sent (via existing trigger)
5. User sees "Success" page with QR code
```

## Security Guarantees

✅ **Clients CANNOT**:
- Set `payment_status='paid'` directly
- Set `paid_at` directly
- Set `fulfillment_status='confirmed'` directly
- Set `status='paid'` directly
- Set `total_amount` (already protected by server-side calculation)

✅ **Clients CAN**:
- Submit receipts via `submit_payment_receipt` RPC (sets `payment_status='submitted'`)
- Update buyer contact fields (name, email, phone)

✅ **Only Hosts CAN**:
- Mark orders as paid via `update_order_fulfillment` RPC
- Set `payment_status='paid'` and `paid_at`
- Set `fulfillment_status='confirmed'` and `confirmed_at`

## Testing Checklist

### ✅ Test 1: Paid Event + PayMe
1. Create order → `payment_status='unpaid'`
2. Submit receipt → `payment_status='submitted'`, `submitted_at` set, `paid_at` NULL
3. Host confirms → `payment_status='paid'`, `paid_at` set, `fulfillment_status='confirmed'`, `confirmed_at` set, `status='paid'`

### ✅ Test 2: Client Cannot Mark Paid
- Direct update `payment_status='paid'` from client should fail (RLS blocks it)
- `submit_payment_receipt` RPC sets `payment_status='submitted'` (not 'paid')

### ✅ Test 3: Free Event
- Cannot submit receipt (RPC rejects with error: "Cannot submit receipt for free orders")

### ✅ Test 4: Host Notification
- Host gets pending message only on `payment_status` transition to 'submitted'
- Message sent via Edge Function trigger

## Files Modified

1. `supabase/migrations/20260216000000_safe_payme_fps_payment_flow.sql` (NEW)
2. `src/lib/payments/submitManualPayment.ts` (UPDATED)
3. `src/pages/booking/PaymentPage.tsx` (UPDATED)
4. `src/lib/api/bookings.ts` (UPDATED - deprecated function)

## Files That Already Support This Flow

- `src/pages/booking/PendingBookingPage.tsx` - Already checks for `payment_status='submitted'`
- `src/lib/utils/booking-route.ts` - Already routes 'submitted' status to 'pending' page
- `supabase/migrations/20260129000000_fix_confirmation_email_trigger.sql` - Email trigger fires on `fulfillment_status='confirmed'`

## Migration Instructions

1. **Run Migration**:
   ```bash
   supabase migration up
   ```
   Or apply via Supabase Dashboard SQL Editor

2. **Verify RPC Function**:
   ```sql
   SELECT proname, proargnames, prosrc 
   FROM pg_proc 
   WHERE proname = 'submit_payment_receipt';
   ```

3. **Verify RLS Policy**:
   ```sql
   SELECT policyname, cmd, qual 
   FROM pg_policies 
   WHERE tablename = 'orders' AND policyname LIKE '%contact%';
   ```

4. **Test Receipt Submission**:
   - Create a paid order
   - Call `submit_payment_receipt` RPC
   - Verify `payment_status='submitted'` (not 'paid')
   - Verify `paid_at` is NULL

5. **Test Host Confirmation**:
   - Host calls `update_order_fulfillment` RPC
   - Verify `payment_status='paid'`, `paid_at` set
   - Verify confirmation email sent

## Notes

- **Stripe payments**: Not affected by this change (handled by webhook)
- **Free orders**: Cannot submit receipts (RPC validation)
- **Guest checkout**: Supported via email match + 1-hour window
- **Backward compatibility**: `updateOrderPayment()` deprecated but kept for reference

## Next Steps (Optional)

- [ ] Update TypeScript types to include `submit_payment_receipt` RPC
- [ ] Add unit tests for RPC function
- [ ] Add integration tests for payment flow
- [ ] Update API documentation

