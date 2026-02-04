# Share Endpoint Setup Guide

This document explains how to set up the `/s/:orgSlug/:eventSlug` share endpoint for WhatsApp/Instagram link previews.

## ⚠️ Critical Requirement

**The Edge Function MUST be deployed with `--no-verify-jwt` flag for OG previews to work.**

Social media crawlers (WhatsApp, Instagram, Facebook) cannot send Authorization headers. Without this flag, they will receive `401 Missing authorization header` errors and link previews will fail.

**Deployment command:**
```bash
supabase functions deploy share-event --no-verify-jwt
```

## Overview

The share endpoint (`/s/:orgSlug/:eventSlug`) serves server-rendered HTML with Open Graph tags for social media crawlers. It then redirects real users to the SPA event page.

## Architecture

- **Supabase Edge Function**: `supabase/functions/share-event/index.ts`
- **Route**: `/s/:orgSlug/:eventSlug?ticket=<ticketTypeId>`
- **Purpose**: Serve OG tags for WhatsApp/Instagram crawlers

## Setup Instructions

### 1. Deploy Supabase Edge Function

**⚠️ CRITICAL: Public Access Required for OG Previews**

The function **MUST** be deployed with the `--no-verify-jwt` flag to allow public access without authentication. This is **required** for WhatsApp/Instagram/Facebook crawlers which cannot send Authorization headers.

**Without this flag:**
- Direct calls to the function URL return `401 Missing authorization header`
- Social media crawlers cannot access the endpoint
- Link previews will not work in WhatsApp, Instagram, or Facebook

**Deployment command:**
```bash
# Deploy the function WITHOUT JWT verification (REQUIRED for OG previews)
supabase functions deploy share-event --no-verify-jwt

# Set environment variables (if not already set)
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Why `--no-verify-jwt`?**
- Social media crawlers (WhatsApp, Instagram, Facebook) cannot send Authorization headers
- Without this flag, direct calls to the function URL return `401 Missing authorization header`
- The function uses `SUPABASE_SERVICE_ROLE_KEY` internally for database access, so it doesn't need user authentication
- This makes the function publicly accessible, which is necessary for crawlers to generate link previews

**Security Note:** The function is safe to expose publicly because:
- It only reads public event data (no sensitive information)
- It uses `SUPABASE_SERVICE_ROLE_KEY` internally for database queries
- No user authentication or authorization is required for viewing public events

**Verify Deployment:**
After deploying, test the function URL directly in a browser:
```
https://YOUR_PROJECT.supabase.co/functions/v1/share-event?orgSlug=your-org&eventSlug=your-event
```

**Expected result:** HTML response with OG tags (status 200)  
**If you see 401:** The function was deployed with JWT verification - redeploy with `--no-verify-jwt`

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

- **401 Missing authorization header**: 
  - **This is the most common issue!** The function must be deployed with `--no-verify-jwt` flag
  - Redeploy using: `supabase functions deploy share-event --no-verify-jwt`
  - Verify by calling the function URL directly in a browser (should return HTML, not 401)
  - If you see 401, the function was deployed with JWT verification enabled
  
- **404 errors**: Check that the Edge Function is deployed and routing is configured
  
- **Missing OG tags**: Verify event/ticket data exists in database
  
- **Image not showing**: Ensure image URLs are absolute HTTPS URLs
  
- **Redirect not working**: Check that JavaScript is enabled (fallback uses meta refresh)
  
- **WhatsApp/Instagram previews not working**:
  - Ensure function is deployed with `--no-verify-jwt`
  - Test the function URL directly in a browser (should return HTML with OG tags)
  - Use Facebook Sharing Debugger to scrape and refresh the preview
  - Verify OG tags are present in the HTML response
