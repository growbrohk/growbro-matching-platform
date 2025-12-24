# Events Components - DEPRECATED

**Status:** These components are based on the OLD ticketing schema and have been temporarily disabled.

## Why Deprecated?

The old event/ticketing system used:
- `events` table with `brand_id`  
- `ticket_products` table
- Different schema structure

The NEW schema uses:
- `events` table with `org_id` (organization-based)
- `ticket_types` table
- `orders` → `order_items` → `tickets` flow

## Files in This Directory

All files in this directory need to be rebuilt using the new schema:

- `EventForm.tsx` - Event creation/editing form (OLD)
- `EventsList.tsx` - List of events (OLD)  
- `components/EventInfoFormSection.tsx` - (OLD)
- `components/TicketTypesFormSection.tsx` - (OLD)
- `components/AdmissionSettingsSection.tsx` - (OLD)
- `components/PublishingSection.tsx` - (OLD)

## Next Steps

1. Create new event management API in `src/lib/api/events.ts`
2. Create new types based on the new schema
3. Rebuild event forms and lists
4. Implement ticket type management
5. Implement order and ticket generation

## New Schema Reference

```sql
events (org_id, title, description, start_at, end_at, status, venue_org_id)
  └── ticket_types (event_id, name, price, quota)
      └── orders (event_id, buyer_user_id, total_amount, status)
          └── order_items (order_id, ticket_type_id, quantity, unit_price)
              └── tickets (order_id, order_item_id, ticket_type_id, qr_code, status)
```

