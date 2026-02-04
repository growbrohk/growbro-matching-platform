# Share Endpoint Setup Guide

This document explains how to set up the `/s/:orgSlug/:eventSlug` share endpoint for WhatsApp/Instagram link previews.

## Overview

The share endpoint (`/s/:orgSlug/:eventSlug`) serves server-rendered HTML with Open Graph tags for social media crawlers. It then redirects real users to the SPA event page.

## Architecture

- **Supabase Edge Function**: `supabase/functions/share-event/index.ts`
- **Route**: `/s/:orgSlug/:eventSlug?ticket=<ticketTypeId>`
- **Purpose**: Serve OG tags for WhatsApp/Instagram crawlers

## Setup Instructions

### 1. Deploy Supabase Edge Function

```bash
# Deploy the function
supabase functions deploy share-event

# Set environment variables (if not already set)
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Configure Routing

The share endpoint needs to be accessible at `/s/:orgSlug/:eventSlug`. Configure your hosting platform:

#### Option A: Vercel (Recommended)

Create `vercel.json`:

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

#### Option B: Netlify

Create `netlify.toml`:

```toml
[[redirects]]
  from = "/s/:orgSlug/:eventSlug"
  to = "https://YOUR_PROJECT.supabase.co/functions/v1/share-event?orgSlug=:orgSlug&eventSlug=:eventSlug"
  status = 200
  force = true
```

#### Option C: Lovable/Other Platforms

Configure URL rewrites/proxies in your hosting platform settings to forward `/s/*` requests to:
```
https://YOUR_PROJECT.supabase.co/functions/v1/share-event
```

Pass `orgSlug` and `eventSlug` as query parameters or extract from the path.

### 3. Local Development

For local development, you can:

1. **Use Vite proxy** (add to `vite.config.ts`):
```typescript
export default defineConfig({
  // ... existing config
  server: {
    proxy: {
      '/s': {
        target: 'https://YOUR_PROJECT.supabase.co/functions/v1/share-event',
        changeOrigin: true,
        rewrite: (path) => {
          const match = path.match(/^\/s\/([^\/]+)\/([^\/]+)/);
          if (match) {
            return `/share-event?orgSlug=${match[1]}&eventSlug=${match[2]}`;
          }
          return path;
        }
      }
    }
  }
});
```

2. **Or test directly**:
```
https://YOUR_PROJECT.supabase.co/functions/v1/share-event?orgSlug=your-org&eventSlug=your-event&ticket=ticket-id
```

## Testing

1. **Test OG tags**: Use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) or [Twitter Card Validator](https://cards-dev.twitter.com/validator)

2. **Test in WhatsApp**: Paste a share link in WhatsApp and verify the preview shows:
   - Correct ticket name (if `?ticket=` param exists)
   - Correct preview image
   - Event description

3. **Verify redirect**: Open the share link in a browser - it should redirect to the SPA event page

## URL Format

- **Event share**: `https://growbrohk.com/s/:orgSlug/:eventSlug`
- **Ticket share**: `https://growbrohk.com/s/:orgSlug/:eventSlug?ticket=<ticketTypeId>`

## OG Tag Priority

1. **Title**: Ticket name (if ticket param exists) → Event title
2. **Description**: Event description → "Book now on Growbro"
3. **Image**: Ticket preview image → Event preview image → Org logo → Default

## Cache Headers

The endpoint sets:
- `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`
- This allows edge caching for 5 minutes with stale-while-revalidate

## Troubleshooting

- **404 errors**: Check that the Edge Function is deployed and routing is configured
- **Missing OG tags**: Verify event/ticket data exists in database
- **Image not showing**: Ensure image URLs are absolute HTTPS URLs
- **Redirect not working**: Check that JavaScript is enabled (fallback uses meta refresh)
