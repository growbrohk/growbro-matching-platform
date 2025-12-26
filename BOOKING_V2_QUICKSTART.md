# Booking V2 - Quick Start Guide 🚀

## Step 1: Deploy the Database

Run the migration to create all necessary tables and functions:

```bash
cd /path/to/growbro-matching-platform
supabase db push
```

Or if using Supabase dashboard:
1. Go to SQL Editor
2. Copy contents of `supabase/migrations/20251226000000_booking_v2.sql`
3. Run the migration

---

## Step 2: Configure Booking Settings

1. Login to your admin dashboard
2. Navigate to **Booking V2** in the sidebar
3. Go to **Settings** (or visit `/app/booking-v2/settings`)
4. Configure:
   - Timezone (e.g., `Asia/Hong_Kong`)
   - Enable manual payment
   - Add payment instructions
   - Add payment QR code URL (optional)
5. Click **Save Settings**

---

## Step 3: Create Your First Resource

1. Go to **Booking V2** → **Resources** (`/app/booking-v2/resources`)
2. Click **New Resource**
3. Fill in the details:
   ```
   Name: Co-working Desk
   Type: Space
   Description: Dedicated desk in our co-working space
   Location: 123 Main St, Hong Kong
   Base Price: 100 (HKD)
   ```
4. Click **Create Resource**

---

## Step 4: Set Availability

1. Click on your newly created resource
2. Go to the **Availability** tab
3. Add a weekly rule:
   ```
   Rule Type: Weekly Recurring
   Day of Week: Monday
   Start Time: 09:00
   End Time: 17:00
   Slot Duration: 60 minutes
   Capacity per Slot: 5
   Buffer Before: 0 minutes
   Buffer After: 0 minutes
   ```
4. Click **Save Rule**
5. Repeat for other days of the week

**Pro Tip**: For a quick setup, create one rule per day you want to be available.

---

## Step 5: Customize Booking Form (Optional)

1. Still in your resource, go to the **Form** tab
2. Add custom fields:

   **Example 1: Dietary Requirements**
   ```
   Label: Dietary Requirements
   Field Type: Long Text
   Required: No
   Placeholder: Any allergies or dietary restrictions?
   ```

   **Example 2: Company Name**
   ```
   Label: Company Name
   Field Type: Short Text
   Required: Yes
   Placeholder: Your company name
   ```

3. Click **Save Field** for each

---

## Step 6: Get Your Public Booking URL

1. Go back to the **Overview** tab
2. Find the **Public Booking URL** section
3. Copy the URL (format: `/book/your-org-slug/resource-slug`)
4. Share this link with your customers!

**Example URL**: 
```
https://yourdomain.com/book/growbro/co-working-desk
```

---

## Step 7: Test a Booking

1. Open the public booking URL in an incognito window
2. Select a date and time slot
3. Fill in customer information:
   ```
   Name: John Doe
   Phone: +852 1234 5678
   Email: john@example.com
   Party Size: 1
   ```
4. Submit the booking
5. You'll be redirected to the reservation page

---

## Step 8: Manage Reservations

1. Go to **Booking V2** → **Reservations** (`/app/booking-v2/reservations`)
2. You should see your test booking
3. Click on it to view details
4. Actions you can take:
   - **Mark as Paid** (confirms the booking)
   - **Cancel Reservation** (if needed)
   - **View QR Code** (for check-in)

---

## Step 9: Payment Workflow

### As Host (Admin):
1. Customer makes booking → Status: **Pending Payment**
2. Customer submits payment proof
3. You review the proof image
4. Click **Mark as Paid** → Status: **Confirmed**
5. Customer receives QR code

### As Customer:
1. Make booking
2. See payment instructions
3. Upload payment proof (image URL)
4. Wait for confirmation
5. Receive QR code
6. Show QR code at venue

---

## Step 10: Check-in Process

### Method 1: Manual Check-in (Admin Dashboard)
1. Customer shows their QR code or booking reference
2. Go to **Reservations**
3. Find the booking
4. Click **Check In** or update status

### Method 2: QR Code Scan (Future Enhancement)
- Scan customer's QR code using RPC function
- `host_booking_checkin_by_token(qr_token)`
- Status automatically updated to **Checked In**

---

## Common Configurations

### Free Events (No Payment)
- Set **Base Price** to `0` or leave empty
- Bookings auto-confirm without payment

### Half-hour Slots
- Set **Slot Duration** to `30` minutes

### Limited Capacity
- Set **Capacity per Slot** to desired number
- System prevents overbooking automatically

### Buffer Time
- **Buffer Before**: Time before booking starts (setup time)
- **Buffer After**: Time after booking ends (cleanup time)
- Prevents back-to-back bookings

---

## Example Use Cases

### 1. Co-working Space Booking
```
Resource Type: Space
Slot Duration: 60 or 240 minutes (hourly or half-day)
Capacity: 1-10 (depending on space)
Pricing: Per hour or per day
```

### 2. Workshop Registration
```
Resource Type: Workshop
Slot Duration: Match workshop duration (e.g., 180 minutes)
Capacity: 20 (class size)
Pricing: Fixed price per person
One-off availability: Specific workshop dates
```

### 3. Event Ticketing
```
Resource Type: Event
Slot Duration: Full event duration
Capacity: Total attendees
Pricing: Ticket price
One-off availability: Event date only
```

---

## Troubleshooting

### No available slots showing
- Check that availability rules are **active**
- Verify slot times are in the future
- Ensure resource is **active**

### Booking fails with "Slot is full"
- Capacity reached for that slot
- Customer should choose another time

### Payment proof not showing
- Ensure customer provided a valid image URL
- Check the **Payment Intent** section in reservation detail

### QR code not generating
- Verify `qrcode.react` is installed
- Check browser console for errors

---

## Next Steps

- [ ] Create multiple resources
- [ ] Add more availability rules
- [ ] Customize booking forms per resource
- [ ] Share public booking links
- [ ] Test the full booking flow
- [ ] Train staff on check-in process
- [ ] Set up payment collection (manual or Stripe)

---

## Support

For detailed information, see `BOOKING_V2_IMPLEMENTATION.md`

For questions or issues:
1. Check the implementation docs
2. Review the code comments
3. Test in development first
4. Contact your development team

---

**🎉 You're all set! Start accepting bookings now!**

