# Apply `og_preview_image_url` migration (production)

If `supabase db push` is not viable (migration history out of sync with CLI), apply this safely in **Supabase Dashboard → SQL Editor**:

```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS og_preview_image_url TEXT;

COMMENT ON COLUMN events.og_preview_image_url IS
  'Optional landscape image URL for Facebook/WhatsApp link previews (1.91:1 e.g. 1200×630); preferred over instagram_preview_image_url for OG tags';
```

Then redeploy the Edge Function (see [`SHARE_ENDPOINT_SETUP.md`](../SHARE_ENDPOINT_SETUP.md)):

```bash
supabase functions deploy share-event --no-verify-jwt
```

Finally:

1. In **Event Form**, re-save or re-upload the **Facebook / WhatsApp Preview** image so `og_preview_image_url` is written to the row (if it was uploaded before this column existed).
2. **[Meta Sharing Debugger](https://developers.facebook.com/tools/debug/)** → paste the event URL → **Scrape Again**.

## WhatsApp previews

The `share-event` function appends `?cb=<updated_at_ms>` to every `og:image` URL so WhatsApp sees a new image URL when `events.updated_at` changes (WhatsApp caches by exact `og:image` string). After changing images or descriptions, **save the event once** in Event Form so `updated_at` bumps, then retry sharing in WhatsApp.
