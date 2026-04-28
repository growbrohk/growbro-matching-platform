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

The `share-event` function:

1. Outputs **single-line** `og:title` / `og:description` (newlines collapsed) — WhatsApp’s parser rejects multiline HTML attribute values more often than Facebook/Instagram.
2. Uses **`https://www.growbrohk.com/...`** for redirects and default `og:url` so bots avoid an extra apex (non-www → www) redirect.
3. Appends **`?cb=<updated_at_ms>`** to each `og:image` URL when `events.updated_at` changes (WhatsApp also caches by exact `og:image` string).

After changing images or descriptions, **save the event once** in Event Form so `updated_at` bumps, then retry sharing.

**URL-level WhatsApp cache** (different from OG image URL): previews are keyed partly on the **page URL**. If an old bubble still looks wrong after deploy, paste a variant with a dummy query:

`https://www.growbrohk.com/orgSlug/eventSlug?v=2`
