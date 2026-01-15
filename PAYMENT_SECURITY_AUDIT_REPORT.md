# Payment & Booking Flow Security Audit Report

**Date:** 2025-02-01  
**Scope:** Event booking + payment flow (PayMe/FPS + FREE path)  
**Goal:** Verify security before adding Stripe integration

---

## Executive Summary

This audit identified **CRITICAL vulnerabilities** that allow users to:
1. ✅ **Bypass payment by tampering with `total_amount`** (P0 - MUST FIX)
2. ✅ **Mark orders as paid without verification** (P0 - MUST FIX)
3. ✅ **Access FREE path for paid events** (P0 - MUST FIX)

**Status:** 🔴 **FAIL** - System is vulnerable to payment bypass attacks.

---

## 1. Architecture Map

### Order Creation Flow
```
Frontend (CompleteBookingPage.tsx)
  ↓
  calculateBookingTotal() [CLIENT-SIDE]
  ↓
  createBooking() → supabase.rpc('create_event_booking')
    ├─ p_total_amount: CLIENT-PROVIDED (⚠️ VULNERABLE)
    ├─ p_order_lines: CLIENT-PROVIDED (⚠️ VULNERABLE)
    └─ RPC function: Uses p_total_amount directly (NO RECOMPUTATION)
  ↓
  orders table INSERT
    ├─ total_amount: FROM CLIENT (⚠️ VULNERABLE)
    ├─ payment_status: 'unpaid' (if amount > 0) or 'paid' (if amount = 0)
    └─ fulfillment_status: 'pending_confirmation' (if amount > 0) or 'confirmed' (if amount = 0)
```

### Payment Update Flow
```
Frontend (PaymentPage.tsx)
  ↓
  submitManualPayment() → updateOrderPayment()
    ├─ .from('orders').update()
    ├─ payment_status: 'paid' (CLIENT-SET ⚠️)
    ├─ paid_at: NOW() (CLIENT-SET ⚠️)
    ├─ receipt_url: CLIENT-SET ⚠️
    └─ RLS Policy: "Buyers can update their own order payment info" (ALLOWS THIS)
```

### Host Confirmation Flow
```
Frontend (HostEnquiryOrderCard.tsx)
  ↓
  supabase.rpc('update_order_fulfillment')
    ├─ Checks org membership ✅ (SECURE)
    ├─ Updates fulfillment_status: 'confirmed'
    └─ Sets payment_status='paid' if not already paid (⚠️ BYPASS RISK)
```

### FREE Path Flow
```
Frontend (CompleteBookingPage.tsx)
  ↓
  if (finalTotal === 0) → confirmFreeOrder()
    ├─ .from('orders').update()
    ├─ payment_status: 'paid'
    ├─ fulfillment_status: 'confirmed'
    └─ RLS Policy: "Buyers can update their own order payment info" (ALLOWS THIS)
```

---

## 2. Security Checklist

| Check | Status | Severity | Evidence |
|-------|--------|-----------|----------|
| **Amount Integrity** | 🔴 **FAIL** | P0 | Client-provided `total_amount` flows into DB without server-side recomputation |
| **Payment Status Integrity** | 🔴 **FAIL** | P0 | Clients can set `payment_status='paid'` and `paid_at` directly |
| **FREE Path Bypass** | 🔴 **FAIL** | P0 | Client can set `total_amount=0` to bypass payment for paid events |
| **Receipt URL Overwrite** | 🟡 **PARTIAL** | P1 | RLS restricts to own orders, but client can set `receipt_url` |
| **Receipt URL Read Leakage** | ✅ **PASS** | - | Storage RLS properly restricts access |
| **Host Confirmation Permission** | ✅ **PASS** | - | RPC function checks org membership |
| **Order Ownership & Enumeration** | ✅ **PASS** | - | UUID-based IDs + RLS policies prevent enumeration |

---

## 3. Detailed Findings

### 3.1 Amount Integrity (🔴 FAIL - P0)

**Vulnerability:** Client-provided `total_amount` is inserted into database without server-side validation or recomputation.

**Evidence:**
- **File:** `src/lib/api/bookings.ts:110-112`
  ```typescript
  const subtotal = draft.lines.reduce((sum, line) => sum + (line.unitPrice * line.qty), 0);
  const totalAmount = Math.max(0, subtotal - discountAmount);
  ```
  - Calculation happens **client-side**

- **File:** `src/lib/api/bookings.ts:127-129`
  ```typescript
  const { data: orderId, error } = await supabase.rpc('create_event_booking' as any, {
    p_total_amount: totalAmount,  // ⚠️ CLIENT-PROVIDED
    p_order_lines: orderLines,     // ⚠️ CLIENT-PROVIDED (unit_price, quantity, subtotal)
  });
  ```

- **File:** `supabase/migrations/20260127000000_fix_free_order_confirmation.sql:175`
  ```sql
  INSERT INTO orders (
    ...
    total_amount,  -- ⚠️ Uses p_total_amount directly
    ...
  )
  VALUES (
    ...
    p_total_amount,  -- ⚠️ NO RECOMPUTATION
    ...
  )
  ```

**Attack Vector:**
```javascript
// Malicious client can modify network request:
const maliciousRequest = {
  p_total_amount: 0,  // Set to 0 to bypass payment
  p_order_lines: [
    {
      ticket_type_id: "real-ticket-id",
      quantity: 1,
      unit_price: 100,  // Real price
      subtotal: 100     // Real subtotal
    }
  ]
};
// Result: Order created with total_amount=0, payment_status='paid', fulfillment_status='confirmed'
```

**Impact:** Users can create orders with `total_amount=0` for paid events, bypassing payment entirely.

---

### 3.2 Payment Status Integrity (🔴 FAIL - P0)

**Vulnerability:** Clients can directly set `payment_status='paid'` and `paid_at` without any server-side verification.

**Evidence:**
- **File:** `src/lib/api/bookings.ts:282-343`
  ```typescript
  export async function updateOrderPayment(
    orderId: string,
    paymentMethod: 'stripe' | 'payme' | 'fps',
    receiptUrl?: string,
    paymentReferenceLink?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const updateData: any = {
      payment_method: paymentMethod,
      submitted_at: now,
      updated_at: now,
    };

    // For PayMe/FPS: Set to paid status with receipt
    if (paymentMethod === 'payme' || paymentMethod === 'fps') {
      updateData.payment_status = 'paid';  // ⚠️ CLIENT-SET
      updateData.paid_at = now;            // ⚠️ CLIENT-SET
    }

    const { data, error } = await supabase
      .from('orders')
      .update(updateData)  // ⚠️ Direct update, no verification
      .eq('id', orderId)
  }
  ```

- **File:** `supabase/migrations/20260201000000_fix_payment_receipt_rls.sql:17-82`
  ```sql
  CREATE POLICY "Buyers can update their own order payment info"
    ON orders FOR UPDATE
    USING (
      -- Ownership check...
    )
    WITH CHECK (
      -- Ownership check...
      -- ⚠️ NO RESTRICTION ON payment_status OR paid_at
    );
  ```

**Attack Vector:**
```javascript
// Malicious client can call updateOrderPayment() or directly update:
await supabase
  .from('orders')
  .update({
    payment_status: 'paid',
    paid_at: new Date().toISOString(),
    receipt_url: 'fake-receipt-url'
  })
  .eq('id', 'order-id');
// Result: Order marked as paid without any payment verification
```

**Impact:** Users can mark their orders as paid without actually paying, bypassing payment verification.

---

### 3.3 FREE Path Bypass (🔴 FAIL - P0)

**Vulnerability:** The FREE path is determined by client-provided `total_amount`, allowing users to bypass payment for paid events.

**Evidence:**
- **File:** `supabase/migrations/20260127000000_fix_free_order_confirmation.sql:130-140`
  ```sql
  -- Free tickets (amount = 0): Immediately confirmed
  IF p_total_amount <= 0 THEN
    v_payment_status := 'paid';
    v_fulfillment_status := 'confirmed';
    v_payment_method := 'free';
    v_order_status := 'paid';
  ELSE
    v_payment_status := 'unpaid';
    v_fulfillment_status := 'pending_confirmation';
  END IF;
  ```
  - Decision based on **client-provided** `p_total_amount`

- **File:** `src/pages/checkout/CompleteBookingPage.tsx:579-609`
  ```typescript
  // For free tickets (total === 0): confirm order and navigate to success
  if (finalTotal === 0) {  // ⚠️ Client-side check
    const updatedOrder = await confirmFreeOrder(result.orderId);
    // ...
  }
  ```

- **File:** `src/lib/api/bookings.ts:248-274`
  ```typescript
  export async function confirmFreeOrder(orderId: string): Promise<OrderWithEvent> {
    const { error } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',      // ⚠️ Client can call this
        fulfillment_status: 'confirmed',
        payment_method: 'free',
        status: 'paid',
        paid_at: now,
        confirmed_at: now,
      })
      .eq('id', orderId)
  }
  ```

**Attack Vector:**
```javascript
// Step 1: Create order with total_amount=0 (see 3.1)
// Step 2: Order is automatically set to paid/confirmed
// OR
// Step 3: Call confirmFreeOrder() directly on a paid order
await confirmFreeOrder('order-id-for-paid-event');
// Result: Paid order marked as free and confirmed
```

**Impact:** Users can bypass payment for paid events by setting `total_amount=0` or calling `confirmFreeOrder()`.

---

### 3.4 Receipt URL Overwrite (🟡 PARTIAL - P1)

**Vulnerability:** Clients can set `receipt_url` on their orders, but RLS restricts to own orders only.

**Evidence:**
- **File:** `src/lib/payments/submitManualPayment.ts:21-66`
  ```typescript
  async function uploadReceipt(orderId: string, file: File): Promise<string> {
    const fileName = `${orderId}/${Date.now()}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('payment-receipts')
      .upload(fileName, file, { upsert: false });
    // ...
    return receiptPath;  // Returns path
  }
  ```
  - Storage RLS checks order ownership ✅

- **File:** `supabase/migrations/20260201000001_fix_payment_receipt_storage_rls.sql:25-65`
  ```sql
  CREATE POLICY "Users can upload payment receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-receipts' AND
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id::text = split_part(name, '/', 1)  -- Checks order ownership
      AND (o.buyer_user_id = auth.uid() OR ...)
    )
  );
  ```
  - ✅ Storage RLS properly restricts uploads to own orders

- **File:** `src/lib/api/bookings.ts:306-308`
  ```typescript
  if (receiptUrl) {
    updateData.receipt_url = receiptUrl;  // ⚠️ Client can set this
  }
  ```
  - Client can set `receipt_url` via `updateOrderPayment()`, but only for their own orders

**Status:** 🟡 **PARTIAL** - RLS prevents overwriting other users' receipts, but client can still set `receipt_url` on their own orders without proper validation.

---

### 3.5 Receipt URL Read Leakage (✅ PASS)

**Status:** ✅ **PASS** - Storage RLS properly restricts read access.

**Evidence:**
- **File:** `supabase/migrations/20260201000001_fix_payment_receipt_storage_rls.sql:67-121`
  ```sql
  CREATE POLICY "Users can view their own payment receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-receipts' AND
    (
      -- Authenticated users can view receipts for their own orders
      (auth.role() = 'authenticated' AND EXISTS (...))
      OR
      -- Hosts (org members) can view receipts for orders in their events
      (auth.role() = 'authenticated' AND EXISTS (
        SELECT 1 FROM orders o
        JOIN events e ON e.id = o.event_id
        JOIN org_members om ON om.org_id = e.org_id
        WHERE o.id::text = split_part(name, '/', 1)
        AND om.user_id = auth.uid()
      ))
    )
  );
  ```
  - ✅ Properly restricts read access to order owners and event hosts

---

### 3.6 Host Confirmation Permission (✅ PASS)

**Status:** ✅ **PASS** - RPC function properly checks org membership.

**Evidence:**
- **File:** `supabase/migrations/20260130000000_host_order_cards_view.sql:113-182`
  ```sql
  CREATE OR REPLACE FUNCTION public.update_order_fulfillment(
    p_order_id UUID,
    p_fulfillment_status TEXT,
    p_confirmed_at TIMESTAMPTZ DEFAULT NOW()
  )
  AS $$
  DECLARE
    v_event_org_id UUID;
    v_user_org_membership BOOLEAN;
  BEGIN
    -- Get the event's org_id
    SELECT e.org_id INTO v_event_org_id
    FROM orders o
    JOIN events e ON e.id = o.event_id
    WHERE o.id = p_order_id;

    -- Check if user is a member of the event's org
    SELECT EXISTS(
      SELECT 1 FROM org_members om
      WHERE om.org_id = v_event_org_id
      AND om.user_id = auth.uid()
    ) INTO v_user_org_membership;

    IF NOT v_user_org_membership THEN
      RAISE EXCEPTION 'User is not a member of the organization that owns this event';
    END IF;
    -- ...
  END;
  $$;
  ```
  - ✅ Properly validates org membership before allowing updates

**Note:** The function also sets `payment_status='paid'` if not already paid (line 162-165), which could be a bypass if someone gains access to the RPC. However, the org membership check prevents unauthorized access.

---

### 3.7 Order Ownership & Enumeration (✅ PASS)

**Status:** ✅ **PASS** - UUID-based IDs and RLS policies prevent enumeration.

**Evidence:**
- **File:** `supabase/migrations/20250110000006_create_orders.sql:4-13`
  ```sql
  CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- ✅ UUID prevents enumeration
    ...
  );
  ```

- **File:** `supabase/migrations/20260122000001_fix_orders_rls_for_guest_checkout.sql:13-35`
  ```sql
  CREATE POLICY "Users can view their own orders"
  ON orders FOR SELECT
  USING (
    (buyer_user_id IS NOT NULL AND buyer_user_id = auth.uid())
    OR
    (buyer_user_id IS NULL AND buyer_email = (auth.jwt() ->> 'email'))
    OR
    (created_at > NOW() - INTERVAL '1 hour')  -- ⚠️ 1-hour window for guest checkout
  );
  ```
  - ✅ RLS restricts access to own orders
  - ⚠️ **Note:** 1-hour window for guest checkout could allow enumeration of recent orders, but UUIDs still prevent systematic enumeration

---

## 4. Recommended Fixes (Prioritized)

### P0 - MUST FIX (Before Stripe Integration)

#### 4.1 Server-Side Amount Computation
**Problem:** `total_amount` is client-provided and not recomputed server-side.

**Fix:** Modify `create_event_booking` RPC to:
1. Accept `p_order_lines` (ticket_type_id, quantity)
2. **Recompute** `unit_price` from `ticket_types` table
3. **Recompute** `subtotal` = `unit_price * quantity`
4. **Recompute** `total_amount` = sum of all subtotals
5. **Reject** if client-provided `p_total_amount` doesn't match recomputed value (or remove parameter entirely)

**Files to modify:**
- `supabase/migrations/20260127000000_fix_free_order_confirmation.sql` (or create new migration)

---

#### 4.2 Prevent Client-Side Payment Status Updates
**Problem:** Clients can set `payment_status='paid'` and `paid_at` directly.

**Fix:** 
1. **Remove** `payment_status` and `paid_at` from the "Buyers can update their own order payment info" RLS policy
2. Create a new RPC function `submit_payment_receipt(order_id, receipt_url, payment_method)` that:
   - Only sets `receipt_url`, `payment_method`, `submitted_at`
   - Sets `payment_status='submitted'` (not 'paid')
   - Does NOT set `paid_at`
3. Only allow `payment_status='paid'` and `paid_at` to be set by:
   - Server-side webhook (Stripe)
   - Host confirmation RPC (`update_order_fulfillment`)
   - Database trigger (for free orders)

**Files to modify:**
- `supabase/migrations/20260201000000_fix_payment_receipt_rls.sql`
- `src/lib/api/bookings.ts` (updateOrderPayment function)
- `src/lib/payments/submitManualPayment.ts`

---

#### 4.3 Secure FREE Path
**Problem:** FREE path is determined by client-provided `total_amount`.

**Fix:**
1. After fixing 4.1, `total_amount` will be server-computed
2. Remove `confirmFreeOrder()` function or restrict it to service role only
3. FREE path should only be determined by server-computed `total_amount` in RPC function

**Files to modify:**
- `supabase/migrations/20260127000000_fix_free_order_confirmation.sql`
- `src/lib/api/bookings.ts` (remove or restrict `confirmFreeOrder`)
- `src/pages/checkout/CompleteBookingPage.tsx` (remove call to `confirmFreeOrder`)

---

### P1 - Nice to Have

#### 4.4 Validate Receipt URL Format
**Problem:** Client can set arbitrary `receipt_url` values.

**Fix:** Add validation in RPC function to ensure `receipt_url` matches expected storage path format: `payment-receipts/{order_id}/{timestamp}.{ext}`

---

#### 4.5 Remove 1-Hour Window for Guest Checkout
**Problem:** 1-hour window in RLS policy allows enumeration of recent orders.

**Fix:** Remove the `created_at > NOW() - INTERVAL '1 hour'` clause and rely solely on email matching for guest checkout.

---

## 5. Patch Suggestions

### Patch 1: Server-Side Amount Computation

**File:** `supabase/migrations/20260202000000_fix_amount_computation.sql`

```sql
-- Migration: Fix amount computation to be server-side only
-- This prevents clients from tampering with total_amount

CREATE OR REPLACE FUNCTION create_event_booking(
  p_event_id UUID,
  -- REMOVE p_total_amount parameter (compute server-side)
  p_order_lines JSONB, -- Array of {ticket_type_id, quantity} (NO unit_price, NO subtotal)
  p_buyer_user_id UUID DEFAULT NULL,
  p_buyer_first_name TEXT DEFAULT NULL,
  p_buyer_last_name TEXT DEFAULT NULL,
  p_buyer_email TEXT DEFAULT NULL,
  p_buyer_phone TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'HKD',
  p_attendees JSONB DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_order_item_id UUID;
  v_line JSONB;
  v_attendee JSONB;
  v_qr_code TEXT;
  v_order_no TEXT;
  v_ticket_count INTEGER;
  v_attendee_index INTEGER;
  v_total_tickets INTEGER;
  v_order_first_name TEXT;
  v_order_last_name TEXT;
  v_order_email TEXT;
  v_order_phone TEXT;
  v_first_attendee JSONB;
  v_payment_status TEXT;
  v_fulfillment_status TEXT;
  v_payment_method TEXT;
  v_order_status TEXT;
  -- NEW: Server-side computation variables
  v_unit_price DECIMAL(10,2);
  v_subtotal DECIMAL(10,2);
  v_total_amount DECIMAL(10,2) := 0;
BEGIN
  -- ... (existing contact info logic) ...

  -- ============================================================================
  -- STEP 4: SERVER-SIDE AMOUNT COMPUTATION
  -- ============================================================================
  -- Recompute total_amount from ticket_types table
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    -- Get unit_price from ticket_types table (server-side source of truth)
    SELECT price INTO v_unit_price
    FROM ticket_types
    WHERE id = (v_line->>'ticket_type_id')::UUID;
    
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found: %', v_line->>'ticket_type_id';
    END IF;
    
    -- Compute subtotal server-side
    v_subtotal := v_unit_price * (v_line->>'quantity')::INTEGER;
    v_total_amount := v_total_amount + v_subtotal;
    
    -- Validate quantity
    IF (v_line->>'quantity')::INTEGER <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than 0';
    END IF;
  END LOOP;

  -- ============================================================================
  -- STEP 5: DETERMINE PAYMENT AND FULFILLMENT STATUS (using server-computed amount)
  -- ============================================================================
  IF v_total_amount <= 0 THEN
    v_payment_status := 'paid';
    v_fulfillment_status := 'confirmed';
    v_payment_method := 'free';
    v_order_status := 'paid';
  ELSE
    v_payment_status := 'unpaid';
    v_fulfillment_status := 'pending_confirmation';
    v_payment_method := NULL;
    v_order_status := 'pending';
  END IF;

  -- ... (rest of function, using v_total_amount instead of p_total_amount) ...

  -- Create order with server-computed total_amount
  INSERT INTO orders (
    event_id,
    buyer_user_id,
    buyer_first_name,
    buyer_last_name,
    buyer_email,
    buyer_phone,
    total_amount,  -- ✅ Server-computed
    currency,
    status,
    payment_status,
    payment_method,
    fulfillment_status,
    order_no,
    paid_at,
    confirmed_at
  )
  VALUES (
    p_event_id,
    p_buyer_user_id,
    v_order_first_name,
    v_order_last_name,
    v_order_email,
    v_order_phone,
    v_total_amount,  -- ✅ Server-computed
    p_currency,
    v_order_status,
    v_payment_status,
    v_payment_method,
    v_fulfillment_status,
    v_order_no,
    CASE WHEN v_total_amount <= 0 THEN NOW() ELSE NULL END,
    CASE WHEN v_total_amount <= 0 THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  -- Create order_items with server-computed prices
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_order_lines)
  LOOP
    -- Re-fetch unit_price (already computed above, but for clarity)
    SELECT price INTO v_unit_price
    FROM ticket_types
    WHERE id = (v_line->>'ticket_type_id')::UUID;
    
    v_subtotal := v_unit_price * (v_line->>'quantity')::INTEGER;
    
    INSERT INTO order_items (
      order_id,
      ticket_type_id,
      quantity,
      unit_price,  -- ✅ Server-computed
      subtotal     -- ✅ Server-computed
    )
    VALUES (
      v_order_id,
      (v_line->>'ticket_type_id')::UUID,
      (v_line->>'quantity')::INTEGER,
      v_unit_price,
      v_subtotal
    )
    RETURNING id INTO v_order_item_id;

    -- ... (ticket creation logic) ...
  END LOOP;

  RETURN v_order_id;
END;
$$;
```

**File:** `src/lib/api/bookings.ts` (update createBooking function)

```typescript
export async function createBooking(
  draft: BookingDraft,
  contactInfo: ContactInfo,
  attendees?: AttendeeInfo[],
  discountAmount: number = 0
): Promise<CreateBookingResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  const buyerUserId = user?.id || null;

  // Prepare order lines - REMOVE unit_price and subtotal (server will compute)
  const orderLines = draft.lines
    .filter(line => line.qty > 0)
    .map(line => ({
      ticket_type_id: line.ticketTypeId,
      quantity: line.qty,
      // REMOVE: unit_price, subtotal (server will compute from ticket_types table)
    }));

  // REMOVE client-side total calculation - server will compute
  // const subtotal = draft.lines.reduce((sum, line) => sum + (line.unitPrice * line.qty), 0);
  // const totalAmount = Math.max(0, subtotal - discountAmount);

  // Call RPC function - REMOVE p_total_amount parameter
  const { data: orderId, error } = await supabase.rpc('create_event_booking' as any, {
    p_event_id: draft.eventId,
    // REMOVED: p_total_amount: totalAmount,
    p_order_lines: orderLines,
    p_buyer_user_id: buyerUserId,
    p_buyer_first_name: contactInfo.firstName || null,
    p_buyer_last_name: contactInfo.lastName || null,
    p_buyer_email: contactInfo.email || null,
    p_buyer_phone: contactInfo.phone || null,
    p_currency: draft.currency || 'HKD',
    p_attendees: attendeesArray,
  });

  // ... (rest of function) ...
}
```

---

### Patch 2: Prevent Client-Side Payment Status Updates

**File:** `supabase/migrations/20260202000001_fix_payment_status_updates.sql`

```sql
-- Migration: Prevent clients from setting payment_status='paid' and paid_at
-- Only allow setting receipt_url and payment_method

-- Drop existing policy
DROP POLICY IF EXISTS "Buyers can update their own order payment info" ON orders;

-- Create new RPC function for submitting payment receipts
CREATE OR REPLACE FUNCTION submit_payment_receipt(
  p_order_id UUID,
  p_receipt_url TEXT,
  p_payment_method TEXT,
  p_payment_reference_link TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_owner BOOLEAN;
BEGIN
  -- Check ownership
  SELECT EXISTS(
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id
    AND (
      (o.buyer_user_id IS NOT NULL AND o.buyer_user_id = auth.uid())
      OR
      (
        o.buyer_user_id IS NULL
        AND o.buyer_email IS NOT NULL
        AND (auth.jwt() ->> 'email') IS NOT NULL
        AND o.buyer_email = (auth.jwt() ->> 'email')
      )
    )
  ) INTO v_order_owner;

  IF NOT v_order_owner THEN
    RAISE EXCEPTION 'User does not own this order';
  END IF;

  -- Validate payment_method
  IF p_payment_method NOT IN ('payme', 'fps') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
  END IF;

  -- Update order - ONLY set receipt_url, payment_method, submitted_at
  -- DO NOT set payment_status='paid' or paid_at (host must confirm)
  UPDATE orders
  SET
    receipt_url = p_receipt_url,
    payment_method = p_payment_method,
    payment_reference_link = p_payment_reference_link,
    submitted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_payment_receipt TO authenticated;
GRANT EXECUTE ON FUNCTION submit_payment_receipt TO anon;

-- Create restrictive RLS policy that prevents updating payment_status and paid_at
CREATE POLICY "Buyers can update receipt info only"
  ON orders FOR UPDATE
  USING (
    -- Same ownership checks as before
    (
      auth.role() = 'authenticated' AND
      buyer_user_id IS NOT NULL AND 
      buyer_user_id = auth.uid()
    )
    OR
    (
      auth.role() = 'authenticated' AND
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
    )
    OR
    (
      auth.role() = 'anon' AND
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
      AND created_at > NOW() - INTERVAL '1 hour'
    )
  )
  WITH CHECK (
    -- Same ownership checks
    (
      auth.role() = 'authenticated' AND
      buyer_user_id IS NOT NULL AND 
      buyer_user_id = auth.uid()
    )
    OR
    (
      auth.role() = 'authenticated' AND
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
    )
    OR
    (
      auth.role() = 'anon' AND
      buyer_user_id IS NULL
      AND buyer_email IS NOT NULL
      AND (auth.jwt() ->> 'email') IS NOT NULL
      AND buyer_email = (auth.jwt() ->> 'email')
      AND created_at > NOW() - INTERVAL '1 hour'
    )
    -- ⚠️ NOTE: PostgreSQL RLS policies cannot restrict specific columns
    -- We rely on the RPC function to enforce this
    -- Consider using a trigger to reject updates to payment_status/paid_at from non-service roles
  );

-- Create trigger to prevent direct updates to payment_status and paid_at
CREATE OR REPLACE FUNCTION prevent_payment_status_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If payment_status or paid_at changed, and user is not service_role, reject
  IF (
    (OLD.payment_status IS DISTINCT FROM NEW.payment_status OR
     OLD.paid_at IS DISTINCT FROM NEW.paid_at)
    AND auth.role() != 'service_role'
  ) THEN
    -- Check if this is a legitimate update from update_order_fulfillment RPC
    -- (which is SECURITY DEFINER and runs as service_role)
    -- OR from a database trigger
    RAISE EXCEPTION 'Direct updates to payment_status and paid_at are not allowed. Use submit_payment_receipt() or update_order_fulfillment() RPC functions.';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_payment_status_updates ON orders;
CREATE TRIGGER trigger_prevent_payment_status_updates
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_payment_status_updates();
```

**File:** `src/lib/api/bookings.ts` (update updateOrderPayment function)

```typescript
/**
 * Submit payment receipt (PayMe/FPS)
 * Sets receipt_url, payment_method, submitted_at
 * Does NOT set payment_status='paid' or paid_at (host must confirm)
 */
export async function updateOrderPayment(
  orderId: string,
  paymentMethod: 'stripe' | 'payme' | 'fps',
  receiptUrl?: string,
  paymentReferenceLink?: string
): Promise<void> {
  if (!receiptUrl) {
    throw new Error('Receipt URL is required');
  }

  if (paymentMethod !== 'payme' && paymentMethod !== 'fps') {
    throw new Error('Invalid payment method for manual payment');
  }

  // Use RPC function instead of direct update
  const { data, error } = await supabase.rpc('submit_payment_receipt', {
    p_order_id: orderId,
    p_receipt_url: receiptUrl,
    p_payment_method: paymentMethod,
    p_payment_reference_link: paymentReferenceLink || null,
  });

  if (error) {
    console.error('[updateOrderPayment] RPC error:', error);
    throw new Error(error.message || 'Failed to submit payment receipt');
  }

  console.log('[updateOrderPayment] Payment receipt submitted successfully:', {
    orderId,
    paymentMethod,
  });
}
```

**File:** `src/lib/api/bookings.ts` (remove or restrict confirmFreeOrder)

```typescript
/**
 * REMOVED: confirmFreeOrder() function
 * Free orders are automatically confirmed by create_event_booking RPC
 * when server-computed total_amount = 0
 * 
 * This function should NOT be callable by clients.
 * If needed for admin purposes, create a service-role-only RPC.
 */
```

**File:** `src/pages/checkout/CompleteBookingPage.tsx` (remove confirmFreeOrder call)

```typescript
// REMOVE this block (lines 579-609):
// if (finalTotal === 0) {
//   try {
//     const updatedOrder = await confirmFreeOrder(result.orderId);
//     // ...
//   }
// }

// REPLACE with:
// Free orders are automatically confirmed by RPC function
// Just navigate to success page
if (finalTotal === 0) {
  toast({
    title: 'Booking created successfully',
    description: 'Your free ticket has been confirmed!',
  });
  navigate(`/booking/success/${result.orderId}`, { replace: true });
} else {
  // Paid ticket - go to payment page
  toast({
    title: 'Booking created successfully',
    description: 'Redirecting to payment...',
  });
  navigate(`/booking/payment/${result.orderId}`, { replace: true });
}
```

---

## 6. Testing Recommendations

### Test 1: Amount Tampering
```bash
# Attempt to create order with total_amount=0 for paid event
curl -X POST https://your-project.supabase.co/rest/v1/rpc/create_event_booking \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_event_id": "real-event-id",
    "p_total_amount": 0,  # Should be rejected or recomputed
    "p_order_lines": [{"ticket_type_id": "paid-ticket-id", "quantity": 1}]
  }'
# Expected: Should fail or recompute to correct amount
```

### Test 2: Payment Status Tampering
```bash
# Attempt to set payment_status='paid' directly
curl -X PATCH https://your-project.supabase.co/rest/v1/orders?id=eq.order-id \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payment_status": "paid", "paid_at": "2025-02-01T00:00:00Z"}'
# Expected: Should fail (trigger rejects or RLS blocks)
```

### Test 3: FREE Path Bypass
```bash
# Attempt to call confirmFreeOrder on paid order
# (Should be removed or restricted to service role)
# Expected: Should fail
```

---

## 7. Summary

### Critical Vulnerabilities (P0)
1. ✅ **Amount Tampering** - Clients can set `total_amount=0` to bypass payment
2. ✅ **Payment Status Tampering** - Clients can set `payment_status='paid'` without verification
3. ✅ **FREE Path Bypass** - Clients can trigger free order confirmation for paid events

### Recommended Actions
1. **Implement server-side amount computation** (Patch 1)
2. **Prevent client-side payment status updates** (Patch 2)
3. **Remove or restrict `confirmFreeOrder()` function**
4. **Test all fixes before Stripe integration**

### Timeline
- **P0 fixes:** Must be completed before Stripe integration
- **P1 fixes:** Can be done after Stripe integration

---

**Report Generated:** 2025-02-01  
**Next Steps:** Review patches, implement fixes, re-audit before Stripe integration

