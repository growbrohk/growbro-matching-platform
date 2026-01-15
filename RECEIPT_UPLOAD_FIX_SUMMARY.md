# Receipt Upload Flow Fix - Summary

## Overview
Fixed the receipt upload flow to work reliably for incognito users with no auth gates. Edit_token is the ONLY security boundary.

## Changes Made

### A) Upload Path ✅
**File**: `src/lib/payments/submitManualPayment.ts`
- **Fixed**: Upload path is now `${orderId}/${filename}` (matches storage policy)
- **Changed**: Receipt URL storage now stores just the path (without bucket prefix) for consistency
- **Before**: `payment-receipts/${orderId}/${filename}`
- **After**: `${orderId}/${filename}`

### B) Receipt URL Storage ✅
**File**: `src/lib/payments/submitManualPayment.ts`
- Stores path without bucket prefix: `${orderId}/${filename}`
- Host view (`HostEnquiryOrderCard.tsx`) already handles this correctly by stripping bucket prefix if present
- Signed URLs are generated server-side when host views receipt

### C) Simplified RPC Function ✅
**File**: `supabase/migrations/20260219000000_simplify_submit_payment_receipt_anon.sql`
- **Removed**: All auth gates (JWT email, buyer_user_id checks)
- **Kept**: Only edit_token validation
- **Result**: Works for incognito/anon users without any authentication
- Function signature: `submit_payment_receipt(p_order_id, p_edit_token, p_payment_method, p_receipt_url, p_payment_reference_link)`

### D) Contact Info Save Fix ✅
**Files**: 
- `src/pages/booking/PaymentPage.tsx`
- `src/components/booking/ContactInfoCard.tsx`
- `supabase/migrations/20260219000001_add_update_order_contact_info_rpc.sql`

**Changes**:
1. Email is now optional for incognito users (not required in PaymentPage)
2. Created new RPC function `update_order_contact_info` that uses edit_token (no auth gates)
3. Contact info updates now use RPC instead of direct UPDATE (consistent with receipt submission)
4. Validation allows empty email when not required

### E) Receipt Submission Errors Fixed ✅
**Files**: 
- `src/lib/payments/submitManualPayment.ts` (already uses edit_token)
- `supabase/migrations/20260219000000_simplify_submit_payment_receipt_anon.sql`

**Fixes**:
- Removed all JWT email matching logic
- Removed buyer_user_id checks
- Only edit_token validation remains
- Works in incognito mode without any authentication

## SQL Migrations

### 1. `20260219000000_simplify_submit_payment_receipt_anon.sql`
- Simplifies `submit_payment_receipt` RPC to use only edit_token
- Removes all auth gates
- Grants EXECUTE to anon and authenticated

### 2. `20260219000001_add_update_order_contact_info_rpc.sql`
- Creates new `update_order_contact_info` RPC function
- Uses edit_token for authorization (consistent with receipt submission)
- Allows updating contact info without authentication

## Testing Checklist

### Incognito/Private Window Test:
1. ✅ Go to payment page (`/booking/payment/:orderId`)
2. ✅ Upload receipt image (PayMe or FPS)
3. ✅ Click "I've Paid"
4. ✅ Verify no errors in console/network
5. ✅ Verify redirect to pending page

### Database Verification:
```sql
-- Check order was updated correctly
SELECT 
  id,
  receipt_url,
  payment_status,
  submitted_at,
  payment_method
FROM orders
WHERE id = '<order_id>';

-- Expected:
-- receipt_url: '{order_id}/{timestamp}.{ext}' (no bucket prefix)
-- payment_status: 'submitted'
-- submitted_at: NOT NULL
-- payment_method: 'payme' or 'fps'
```

### Storage Verification:
```sql
-- Check file exists in storage
SELECT name, bucket_id
FROM storage.objects
WHERE bucket_id = 'payment-receipts'
AND name LIKE '<order_id>/%';

-- Expected: File exists at path '{order_id}/{timestamp}.{ext}'
```

### Host View Test:
1. ✅ Host logged in: navigate to order details
2. ✅ Click receipt link
3. ✅ Verify signed URL is generated and image displays
4. ✅ Verify receipt path is correctly parsed (strips bucket prefix if present)

### Contact Info Test:
1. ✅ In incognito: go to payment page
2. ✅ Click "Add" or "Edit" contact info
3. ✅ Fill in name (email optional)
4. ✅ Click "Save"
5. ✅ Verify no errors
6. ✅ Verify contact info is saved

## Key Points

1. **No Auth Gates**: Edit_token is the ONLY security boundary
2. **Incognito Compatible**: All flows work without authentication
3. **Consistent Approach**: Both receipt submission and contact info updates use RPC with edit_token
4. **Storage Path**: Receipts stored as `${orderId}/${filename}` (no bucket prefix)
5. **Host View**: Generates signed URLs server-side when viewing receipts

## Files Modified

### Frontend:
- `src/lib/payments/submitManualPayment.ts` - Fixed upload path and receipt URL storage
- `src/pages/booking/PaymentPage.tsx` - Fixed contact info update to use RPC, made email optional
- `src/components/booking/ContactInfoCard.tsx` - Fixed validation to allow empty email when not required

### Database:
- `supabase/migrations/20260219000000_simplify_submit_payment_receipt_anon.sql` - Simplified RPC
- `supabase/migrations/20260219000001_add_update_order_contact_info_rpc.sql` - New RPC for contact info

## No Changes Required

- Storage policies (already configured via Dashboard UI)
- Host view receipt display (already handles path correctly)
- Order confirmation flow (unchanged)

