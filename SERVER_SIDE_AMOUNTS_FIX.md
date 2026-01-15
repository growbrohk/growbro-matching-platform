# Server-Side Amount Calculation Fix (P0 Security)

## Summary

Fixed critical security vulnerability where clients could tamper with `total_amount` to bypass payment. All order total calculations are now performed server-side from `ticket_types.price` in the database.

## Changes Made

### A) Database Migration: `supabase/migrations/20260215000000_fix_server_side_amounts.sql`

**Updated `create_event_booking` RPC function:**

1. **Removed `p_total_amount` parameter** - No longer accepts client-provided total amount
2. **Changed `p_order_lines` format** - Now accepts ONLY:
   ```json
   [{ "ticket_type_id": "uuid", "quantity": int }]
   ```
   - Removed: `unit_price`, `subtotal` (no longer accepted from client)
3. **Server-side computation:**
   - Loops through `p_order_lines`
   - For each line:
     - SELECTs `price` from `ticket_types` table (server-side source of truth)
     - Validates ticket type exists and quantity > 0
     - Computes `subtotal = price × quantity`
     - Accumulates `total_amount = sum(subtotals)`
4. **FREE vs PAID branching** - Uses server-computed `v_total_amount`:
   - If `v_total_amount <= 0`: Sets `payment_status='paid'`, `fulfillment_status='confirmed'`, `payment_method='free'`
   - Else: Sets `payment_status='unpaid'`, `fulfillment_status='pending_confirmation'`
5. **Order and order_items creation** - Uses server-computed `v_total_amount`, `v_unit_price`, `v_subtotal`

### B) Frontend: `src/lib/api/bookings.ts`

**Updated `createBooking()` function:**

1. **Removed client-side calculations:**
   - Removed `discountAmount` parameter (not needed for next 7 days)
   - Removed `subtotal` calculation
   - Removed `totalAmount` calculation
2. **Updated `orderLines` format:**
   ```typescript
   const orderLines = draft.lines
     .filter(line => line.qty > 0)
     .map(line => ({
       ticket_type_id: line.ticketTypeId,
       quantity: line.qty,
       // NO unit_price, NO subtotal
     }));
   ```
3. **Removed `p_total_amount` from RPC call:**
   ```typescript
   await supabase.rpc('create_event_booking', {
     p_event_id: draft.eventId,
     p_order_lines: orderLines,  // Only ticket_type_id + quantity
     // NO p_total_amount
     // ... other params
   });
   ```
4. **Updated `CreateBookingData` interface** - Removed `totalAmount` and price fields from `orderLines`

### C) UI Routing: `src/pages/checkout/CompleteBookingPage.tsx`

**Updated booking completion flow:**

1. **Removed discount logic** from `createBooking()` call
2. **Fetch order after creation** to get server-computed `total_amount`:
   ```typescript
   const result = await createBooking(...);
   const order = await getOrderWithEvent(result.orderId);
   const serverTotalAmount = Number(order.total_amount);
   ```
3. **Routing decision** uses server-computed amount:
   - If `serverTotalAmount <= 0`: Navigate to success page
   - Else: Navigate to payment page

### D) Hardening

**Searched codebase for:**
- ✅ No other RPC functions accept client-provided prices
- ✅ No direct client writes to `orders.total_amount`
- ✅ `confirmFreeOrder()` and `updateOrderPayment()` don't modify `total_amount` (safe)

## Files Changed

1. **Migration:**
   - `supabase/migrations/20260215000000_fix_server_side_amounts.sql` (NEW)

2. **Frontend:**
   - `src/lib/api/bookings.ts` - Updated `createBooking()` function and interfaces
   - `src/pages/checkout/CompleteBookingPage.tsx` - Updated routing logic

## Testing in DevTools

### Before Fix (Vulnerable):
```json
// Network payload included:
{
  "p_total_amount": 0,  // ⚠️ Client could tamper this
  "p_order_lines": [
    {
      "ticket_type_id": "...",
      "quantity": 1,
      "unit_price": 100,  // ⚠️ Client-provided
      "subtotal": 100     // ⚠️ Client-provided
    }
  ]
}
```

### After Fix (Secure):
```json
// Network payload:
{
  "p_order_lines": [
    {
      "ticket_type_id": "...",
      "quantity": 1
      // NO unit_price, NO subtotal, NO p_total_amount
    }
  ]
}
```

**To verify:**
1. Open DevTools → Network tab
2. Create a booking for a paid event
3. Inspect the `create_event_booking` RPC call payload
4. Confirm:
   - ✅ `p_total_amount` is NOT present
   - ✅ `p_order_lines` contains ONLY `ticket_type_id` and `quantity`
   - ✅ No `unit_price` or `subtotal` fields

## Acceptance Tests

### ✅ Test 1: Paid Event - Tampering Prevention
**Scenario:** User tampers Network payload and sets `total_amount=0`
**Expected:** Server computes correct total from `ticket_types.price`, order created with correct amount
**Status:** ✅ Fixed - Server computes from DB, client cannot tamper

### ✅ Test 2: Free Event - Auto-Confirmation
**Scenario:** Event has `ticket_types.price=0`
**Expected:** Server computes `total_amount=0`, order auto-confirmed
**Status:** ✅ Fixed - Server computes `total_amount=0` from DB prices

### ✅ Test 3: Order Items Reflect DB Prices
**Scenario:** Create order and check `order_items` table
**Expected:** `unit_price` and `subtotal` match `ticket_types.price` from DB
**Status:** ✅ Fixed - All prices computed server-side from `ticket_types.price`

## Security Impact

**Before:** 🔴 **CRITICAL VULNERABILITY**
- Clients could set `total_amount=0` to bypass payment
- Clients could provide fake `unit_price`/`subtotal` values

**After:** ✅ **SECURE**
- All amounts computed server-side from `ticket_types.price`
- Clients cannot tamper with prices or totals
- FREE vs PAID decision uses server-computed amount only

## Migration Instructions

1. Apply migration:
   ```bash
   supabase migration up
   ```

2. Deploy frontend changes

3. Test:
   - Create booking for paid event → Verify correct total
   - Create booking for free event → Verify auto-confirmation
   - Check Network tab → Verify no price fields in payload

## Notes

- Discounts/coupons removed from booking creation (as requested, not needed for next 7 days)
- Promo code UI still exists in `CompleteBookingPage.tsx` but is not used in booking creation
- Function remains idempotent-safe
- Existing attendee/ticket creation logic preserved

