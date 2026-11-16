-- Remember previous event slugs so old public links redirect, and rewrite
-- tracking link destinations when an event slug changes.

CREATE TABLE public.event_slug_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (char_length(slug) > 0),
  slug_lower text GENERATED ALWAYS AS (lower(slug)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_slug_history_org_slug_lower_key UNIQUE (org_id, slug_lower)
);

CREATE INDEX idx_event_slug_history_event_id ON public.event_slug_history (event_id);

COMMENT ON TABLE public.event_slug_history IS
  'Previous event slugs within an org. Public pages redirect these to the event''s current slug.';

ALTER TABLE public.event_slug_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_slug_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_slug_history TO anon, authenticated;

CREATE POLICY "Public can view slug history for published events"
  ON public.event_slug_history
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events
      WHERE events.id = event_slug_history.event_id
        AND events.status = 'published'
    )
  );

-- Replace /{org}/{oldSlug} in a destination URL, keeping the query string and hash.
CREATE OR REPLACE FUNCTION public.rewrite_event_slug_in_destination(
  p_url text,
  p_org_slug text,
  p_old_slug text,
  p_new_slug text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base text;
  v_rest text;
  v_origin text;
  v_path text;
  v_prefix text;
  v_prefix_len int;
  q_pos int;
  h_pos int;
  cut_pos int;
BEGIN
  IF p_url IS NULL OR p_org_slug IS NULL OR p_old_slug IS NULL OR p_new_slug IS NULL THEN
    RETURN p_url;
  END IF;
  IF p_old_slug = p_new_slug THEN
    RETURN p_url;
  END IF;

  q_pos := position('?' IN p_url);
  h_pos := position('#' IN p_url);
  cut_pos := 0;
  IF q_pos > 0 THEN
    cut_pos := q_pos;
  END IF;
  IF h_pos > 0 AND (cut_pos = 0 OR h_pos < cut_pos) THEN
    cut_pos := h_pos;
  END IF;

  IF cut_pos > 0 THEN
    v_base := substring(p_url FROM 1 FOR cut_pos - 1);
    v_rest := substring(p_url FROM cut_pos);
  ELSE
    v_base := p_url;
    v_rest := '';
  END IF;

  v_origin := substring(v_base FROM '^https?://[^/]+');
  IF v_origin IS NULL THEN
    v_origin := '';
  END IF;
  v_path := substring(v_base FROM char_length(v_origin) + 1);

  v_prefix := '/' || p_org_slug || '/' || p_old_slug;
  v_prefix_len := char_length(v_prefix);

  IF left(v_path, v_prefix_len) = v_prefix
     AND (
       char_length(v_path) = v_prefix_len
       OR substring(v_path FROM v_prefix_len + 1 FOR 1) = '/'
     ) THEN
    RETURN v_origin
      || '/' || p_org_slug || '/' || p_new_slug
      || substring(v_path FROM v_prefix_len + 1)
      || v_rest;
  END IF;

  RETURN p_url;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_event_slug_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_slug text;
BEGIN
  IF OLD.slug IS NOT DISTINCT FROM NEW.slug THEN
    RETURN NEW;
  END IF;

  IF NEW.slug IS NOT NULL AND btrim(NEW.slug) <> '' THEN
    DELETE FROM public.event_slug_history
    WHERE org_id = NEW.org_id
      AND slug_lower = lower(NEW.slug);
  END IF;

  IF OLD.slug IS NOT NULL
     AND btrim(OLD.slug) <> ''
     AND lower(OLD.slug) IS DISTINCT FROM lower(COALESCE(NEW.slug, ''))
     AND NOT EXISTS (
       SELECT 1
       FROM public.events
       WHERE org_id = NEW.org_id
         AND id <> NEW.id
         AND slug IS NOT NULL
         AND lower(slug) = lower(OLD.slug)
     ) THEN
    INSERT INTO public.event_slug_history (org_id, event_id, slug)
    VALUES (NEW.org_id, NEW.id, OLD.slug)
    ON CONFLICT (org_id, slug_lower)
    DO UPDATE SET
      event_id = EXCLUDED.event_id,
      slug = EXCLUDED.slug,
      created_at = now();
  END IF;

  IF OLD.slug IS NOT NULL AND NEW.slug IS NOT NULL AND OLD.slug <> NEW.slug THEN
    SELECT o.slug INTO v_org_slug
    FROM public.orgs o
    WHERE o.id = NEW.org_id;

    IF v_org_slug IS NOT NULL AND btrim(v_org_slug) <> '' THEN
      UPDATE public.tracking_links
      SET destination_url = public.rewrite_event_slug_in_destination(
        destination_url,
        v_org_slug,
        OLD.slug,
        NEW.slug
      )
      WHERE event_id = NEW.id
        AND destination_url IS NOT NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_record_slug_history ON public.events;

CREATE TRIGGER events_record_slug_history
  AFTER UPDATE OF slug ON public.events
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION public.record_event_slug_history();

COMMENT ON FUNCTION public.record_event_slug_history IS
  'Stores the previous event slug and rewrites tracking link destinations to the new slug.';

-- The updating role must be allowed to execute the trigger function.
GRANT EXECUTE ON FUNCTION public.record_event_slug_history() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rewrite_event_slug_in_destination(text, text, text, text) TO authenticated, service_role;
