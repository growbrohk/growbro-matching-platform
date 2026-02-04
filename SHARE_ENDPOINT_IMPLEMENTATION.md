# Share Endpoint Implementation Summary

## ✅ Implementation Complete

WhatsApp/Instagram link previews for event tickets have been implemented using a server-rendered share endpoint.

## What Was Implemented

### 1. Supabase Edge Function (`supabase/functions/share-event/index.ts`)
- **Route**: `/s/:orgSlug/:eventSlug?ticket=<ticketTypeId>`
- **Purpose**: Serves server-rendered HTML with Open Graph tags for social media crawlers
- **Features**:
  - Extracts `orgSlug` and `eventSlug` from URL path or query params
  - Supports `?ticket=<ticketTypeId>` and `?ticketSlug=<slug>` query params
  - Fetches event and ticket data from Supabase
  - Generates OG tags with proper fallback hierarchy:
    - **Title**: Ticket name (if ticket param) → Event title
    - **Description**: Event description → "Book now on Growbro"
    - **Image**: Ticket preview image → Event preview image → Org logo → Default
  - Redirects real users to SPA event page
  - Includes cache headers (`s-maxage=300`)

### 2. EventForm Updates (`src/pages/events/EventForm.new.tsx`)
- Added "Share Ticket Link" section for each ticket type
- Only shown when:
  - Event has been saved (`eventId` exists)
  - Event has a slug (`eventSlug` exists)
  - Organization has a slug (`currentOrg.slug` exists)
  - Ticket has been saved (`tt.id` exists)
- Includes:
  - Read-only input showing the share URL
  - Copy button to copy link to clipboard
  - Format: `https://growbrohk.com/s/${orgSlug}/${eventSlug}?ticket=${ticketId}`

### 3. Configuration
- Updated `supabase/config.toml` to include `share-event` function configuration
- Created `SHARE_ENDPOINT_SETUP.md` with deployment and routing instructions

## Next Steps

### 1. Deploy Edge Function
```bash
supabase functions deploy share-event
```

### 2. Configure Routing
Configure your hosting platform to proxy `/s/*` requests to the Supabase Edge Function. See `SHARE_ENDPOINT_SETUP.md` for detailed instructions.

**Example for Vercel** (`vercel.json`):
```json
{
  "rewrites": [
    {
      "source": "/s/:orgSlug/:eventSlug",
      "destination": "https://YOUR_PROJECT.supabase.co/functions/v1/share-event?orgSlug=:orgSlug&eventSlug=:eventSlug"
    }
  ]
}
```

### 3. Test
1. **Test OG tags**: Use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
2. **Test in WhatsApp**: Paste a share link and verify preview shows correctly
3. **Verify redirect**: Open share link in browser - should redirect to SPA

## URL Formats

- **Event share**: `https://growbrohk.com/s/:orgSlug/:eventSlug`
- **Ticket share**: `https://growbrohk.com/s/:orgSlug/:eventSlug?ticket=<ticketTypeId>`

## OG Tag Priority

1. **Title**: Ticket name (if `?ticket=` exists) → Event title
2. **Description**: Event description → "Book now on Growbro"
3. **Image**: 
   - Ticket `metadata.preview_image_url` or `metadata.image_url`
   - Event `instagram_preview_image_url`
   - Org `metadata.logo_url` or `metadata.image_url`
   - Default: `https://growbrohk.com/og-default.png`

## Notes

- The Edge Function handles both direct calls (`/functions/v1/share-event?orgSlug=...`) and proxied routes (`/s/:orgSlug/:eventSlug`)
- Image URLs are automatically converted to absolute HTTPS URLs
- Cache headers allow edge caching for 5 minutes
- Fallback redirect uses both JavaScript and meta refresh for maximum compatibility
