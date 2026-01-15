# Per-Ticket Contact Info Flow Fix

## Summary
Fixed Per-Ticket information flow to reuse the SAME Contact Info module as the FREE (HK$0) route, and prevented "Unauthorized: Email does not match order buyer_email" errors.

## Changes Made

### A) Shared Contact Info Component
- **Created**: `src/components/booking/ContactInfoCard.tsx`
  - Extracted Contact info UI/component from FREE route
  - Handles both display and editing via dialog
  - Supports configurable required fields and phone visibility
  - Shows "Add" button when no contact info exists

### B) Updated CompleteBookingPage
- **Replaced**: Per-Ticket Order Contact section with shared `ContactInfoCard` component
- **Added**: Checkbox "Use Contact info as Attendee 1" (default ON)
  - When ON: Attendee 1 fields auto-fill from Contact info and stay in sync
  - When OFF: Attendee 1 can differ from Contact info
- **Changed**: `create_event_booking` now ALWAYS receives `contactInfo` as `p_buyer_*` parameters (not `orderContact`)
  - Ensures `orders.buyer_email` is always set from Contact info
  - Consistent behavior for both FREE route and Per-Ticket mode

### C) Prevented Email Mismatch Error
- **Location**: Error thrown in `submit_payment_receipt` RPC function
  - File: `supabase/migrations/20260216000000_safe_payme_fps_payment_flow.sql`
  - Lines: 88-94 (guest order email verification)
- **Prevention**:
  1. **PaymentPage guard**: Added explicit check in `handleManualPaymentSubmit` to prevent calling `submitManualPayment` for free orders (redirects to success instead)
  2. **Routing guard**: `getBookingRoute` already returns 'success' for free orders, preventing PaymentPage from being reached
  3. **RPC guard**: `submit_payment_receipt` RPC already checks `total_amount <= 0` and throws error before email verification (line 60-62)
- **Result**: FREE orders never call `submit_payment_receipt`, so email mismatch check never runs

## Key Files Modified
1. `src/components/booking/ContactInfoCard.tsx` (new)
2. `src/pages/checkout/CompleteBookingPage.tsx`
3. `src/pages/booking/PaymentPage.tsx`

## Testing Checklist
- [ ] Free ticket + Per-Ticket mode: Shows Contact info section identical to $0 route
- [ ] Checkbox ON fills Attendee 1 from Contact info
- [ ] Checkbox OFF allows Attendee 1 to differ
- [ ] No unauthorized email mismatch toast appears for FREE orders
- [ ] Paid ticket + Per-Ticket mode: Contact info stored as `orders.buyer_email`
- [ ] Receipt submission uses `order.buyer_email` (no mismatch error)

