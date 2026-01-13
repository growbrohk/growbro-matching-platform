# Automatic Confirmation Email Setup

This document describes the automatic confirmation email system that sends emails when orders become confirmed.

## Overview

When an order's `fulfillment_status` transitions to `'confirmed'`, a database trigger automatically calls an Edge Function that sends a confirmation email via Resend API. The system is idempotent - emails are sent **once only**, even if the trigger fires multiple times.

## Components

### 1. Database Migration (`20260128000000_auto_confirmation_email.sql`)

Adds tracking fields to `orders` table:
- `confirmation_email_sent_at` - Timestamp when email was sent
- `confirmation_email_resend_id` - Resend API message ID
- `confirmation_email_error` - Error message if sending failed
- `confirmation_email_attempts` - Number of attempts

Creates a trigger `trigger_order_confirmed_send_email` that:
- Fires AFTER UPDATE of `fulfillment_status`
- Only when transitioning to `'confirmed'`
- Only when `confirmation_email_sent_at IS NULL` (idempotency)
- Calls Edge Function via `pg_net` HTTP POST
- Increments `confirmation_email_attempts`

### 2. Edge Function (`supabase/functions/send-confirmation-email/index.ts`)

Handles the email sending:
- Accepts `{ order_id }` in request body
- Fetches order + event details + tickets count
- Guard rails:
  - Skips if `fulfillment_status != 'confirmed'`
  - Skips if `confirmation_email_sent_at IS NOT NULL` (already sent)
  - Errors if `buyer_email` missing
- Sends email via Resend API
- Updates order with `confirmation_email_sent_at` and `confirmation_email_resend_id` (idempotent write)

### 3. Configuration (`supabase/config.toml`)

Edge Function configured with `verify_jwt = false` to allow database trigger calls.

## Setup Instructions

### 1. Deploy Migration

```bash
supabase db push
```

Or apply manually in Supabase Dashboard → SQL Editor.

### 2. Set Supabase Secrets

In Supabase Dashboard → Settings → Edge Functions → Secrets, set:
- `RESEND_API_KEY` - Your Resend API key
- `SUPABASE_URL` - Your Supabase project URL (e.g., `https://usadgrhxgdhjmkznupri.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

### 3. Deploy Edge Function

```bash
supabase functions deploy send-confirmation-email
```

### 4. Update Email From Address

Edit `supabase/functions/send-confirmation-email/index.ts` line 201:
```typescript
from: 'Growbro <noreply@growbrohk.com>', // Update with your verified Resend domain
```

### 5. Verify pg_net Extension

The migration enables `pg_net` extension. If it fails, enable manually:
```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

## Testing

### Test 1: Manual Order Confirmation

```sql
-- Update an order to confirmed status
UPDATE public.orders 
SET fulfillment_status = 'confirmed', confirmed_at = now() 
WHERE id = '<some_order_uuid>';

-- Check if email was sent
SELECT 
  id, 
  order_no, 
  fulfillment_status, 
  confirmation_email_sent_at, 
  confirmation_email_resend_id,
  confirmation_email_error,
  confirmation_email_attempts
FROM orders 
WHERE id = '<some_order_uuid>';
```

### Test 2: Idempotency Check

Run the same UPDATE again - it should NOT send another email (already_sent).

### Test 3: FREE Order Flow

When a FREE order is created via `create_event_booking`:
- `payment_status = 'paid'`
- `fulfillment_status = 'confirmed'`
- Email should auto-send immediately

### Test 4: Stripe Paid Order

When a Stripe-paid order is later confirmed:
- Update `fulfillment_status = 'confirmed'`
- Email should auto-send

## Monitoring

Check Edge Function logs:
```bash
supabase functions logs send-confirmation-email
```

Check failed emails:
```sql
SELECT id, order_no, buyer_email, confirmation_email_error, confirmation_email_attempts
FROM orders
WHERE confirmation_email_error IS NOT NULL;
```

## Troubleshooting

### Email not sending

1. Check Edge Function logs for errors
2. Verify secrets are set correctly
3. Check `confirmation_email_error` field on order
4. Verify Resend API key is valid
5. Check Resend domain is verified

### Trigger not firing

1. Verify trigger exists:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'trigger_order_confirmed_send_email';
   ```
2. Check trigger function:
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'on_order_confirmed_send_email';
   ```
3. Verify `pg_net` extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```

### Duplicate emails

The system is idempotent, but if duplicates occur:
1. Check `confirmation_email_sent_at` is being set correctly
2. Verify Edge Function idempotency check is working
3. Check for race conditions (shouldn't happen with idempotent write)

## Email Template

The email includes:
- Event title
- Order number
- Date & time (formatted)
- Venue location
- Number of tickets
- Amount paid (if > 0)
- Link to order success page

## Security Notes

- Edge Function uses `verify_jwt = false` for database trigger access
- Service role key is stored in Supabase Secrets (server-only)
- No sensitive data exposed to frontend
- Idempotency prevents duplicate sends

