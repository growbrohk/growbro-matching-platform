-- Bulk save event ticket types + access variants in one transaction (RLS via SECURITY INVOKER).

-- ============================================================================
-- 1. Sync access variants for one ticket type (mirrors client syncTicketTypeAccessVariants)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_ticket_type_access_variants_bulk(
  p_ticket_type_id UUID,
  p_variants JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_variant_id UUID;
  v_primary JSONB;
  v_matched_ids UUID[] := ARRAY[]::UUID[];
  v_existing RECORD;
  v_visibility TEXT;
  v_access_code TEXT;
  v_allowed_affiliates TEXT[];
BEGIN
  IF p_variants IS NULL OR jsonb_typeof(p_variants) != 'array' OR jsonb_array_length(p_variants) = 0 THEN
    RETURN;
  END IF;

  -- Primary variant for legacy fallback columns on ticket_types
  SELECT elem INTO v_primary
  FROM jsonb_array_elements(p_variants) AS elem
  WHERE (elem->>'visibility_mode') = 'public' AND COALESCE((elem->>'is_active')::boolean, true)
  LIMIT 1;

  IF v_primary IS NULL THEN
    SELECT elem INTO v_primary
    FROM jsonb_array_elements(p_variants) AS elem
    WHERE (elem->>'visibility_mode') = 'code' AND COALESCE((elem->>'is_active')::boolean, true)
    LIMIT 1;
  END IF;

  IF v_primary IS NULL THEN
    SELECT elem INTO v_primary
    FROM jsonb_array_elements(p_variants) AS elem
    WHERE (elem->>'visibility_mode') = 'affiliate' AND COALESCE((elem->>'is_active')::boolean, true)
    LIMIT 1;
  END IF;

  IF v_primary IS NULL THEN
    SELECT elem INTO v_primary FROM jsonb_array_elements(p_variants) AS elem LIMIT 1;
  END IF;

  v_visibility := COALESCE(v_primary->>'visibility_mode', 'public');
  v_access_code := CASE WHEN v_visibility = 'code' THEN v_primary->>'access_code' ELSE NULL END;
  v_allowed_affiliates := CASE
    WHEN v_visibility = 'affiliate' THEN
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_primary->'allowed_affiliates', '[]'::jsonb)))
    ELSE NULL
  END;

  UPDATE public.ticket_types
  SET
    visibility_mode = v_visibility,
    access_code = v_access_code,
    allowed_affiliates = v_allowed_affiliates
  WHERE id = p_ticket_type_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_variants)
  LOOP
    v_variant_id := NULL;

    IF v_item ? 'id' AND (v_item->>'id') IS NOT NULL AND (v_item->>'id') != '' THEN
      SELECT ttav.id INTO v_variant_id
      FROM public.ticket_type_access_variants ttav
      WHERE ttav.id = (v_item->>'id')::uuid
        AND ttav.ticket_type_id = p_ticket_type_id;
    END IF;

    IF v_variant_id IS NULL THEN
      SELECT ttav.id INTO v_variant_id
      FROM public.ticket_type_access_variants ttav
      WHERE ttav.ticket_type_id = p_ticket_type_id
        AND NOT (ttav.id = ANY(v_matched_ids))
        AND ttav.visibility_mode = (v_item->>'visibility_mode')
        AND (
          (v_item->>'visibility_mode') != 'code'
          OR COALESCE(ttav.access_code, '') = COALESCE(v_item->>'access_code', '')
        )
        AND (
          (v_item->>'visibility_mode') != 'affiliate'
          OR COALESCE(ttav.allowed_affiliates, ARRAY[]::text[]) = COALESCE(
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'allowed_affiliates', '[]'::jsonb))),
            ARRAY[]::text[]
          )
        )
      LIMIT 1;
    END IF;

    IF v_variant_id IS NOT NULL THEN
      v_matched_ids := array_append(v_matched_ids, v_variant_id);
      UPDATE public.ticket_type_access_variants
      SET
        visibility_mode = v_item->>'visibility_mode',
        access_code = CASE WHEN (v_item->>'visibility_mode') = 'code' THEN v_item->>'access_code' ELSE NULL END,
        allowed_affiliates = CASE
          WHEN (v_item->>'visibility_mode') = 'affiliate' THEN
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'allowed_affiliates', '[]'::jsonb)))
          ELSE NULL
        END,
        price_override = CASE WHEN v_item ? 'price_override' AND v_item->>'price_override' IS NOT NULL
          THEN (v_item->>'price_override')::numeric ELSE NULL END,
        discount_percent = CASE WHEN v_item ? 'discount_percent' AND v_item->>'discount_percent' IS NOT NULL
          THEN (v_item->>'discount_percent')::numeric ELSE NULL END,
        quota = CASE WHEN v_item ? 'quota' AND v_item->>'quota' IS NOT NULL
          THEN (v_item->>'quota')::integer ELSE NULL END,
        is_active = COALESCE((v_item->>'is_active')::boolean, true)
      WHERE id = v_variant_id AND ticket_type_id = p_ticket_type_id;
    ELSE
      INSERT INTO public.ticket_type_access_variants (
        ticket_type_id,
        visibility_mode,
        access_code,
        allowed_affiliates,
        price_override,
        discount_percent,
        quota,
        is_active
      ) VALUES (
        p_ticket_type_id,
        v_item->>'visibility_mode',
        CASE WHEN (v_item->>'visibility_mode') = 'code' THEN v_item->>'access_code' ELSE NULL END,
        CASE
          WHEN (v_item->>'visibility_mode') = 'affiliate' THEN
            ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'allowed_affiliates', '[]'::jsonb)))
          ELSE NULL
        END,
        CASE WHEN v_item ? 'price_override' AND v_item->>'price_override' IS NOT NULL
          THEN (v_item->>'price_override')::numeric ELSE NULL END,
        CASE WHEN v_item ? 'discount_percent' AND v_item->>'discount_percent' IS NOT NULL
          THEN (v_item->>'discount_percent')::numeric ELSE NULL END,
        CASE WHEN v_item ? 'quota' AND v_item->>'quota' IS NOT NULL
          THEN (v_item->>'quota')::integer ELSE NULL END,
        COALESCE((v_item->>'is_active')::boolean, true)
      )
      RETURNING id INTO v_variant_id;
      v_matched_ids := array_append(v_matched_ids, v_variant_id);
    END IF;
  END LOOP;

  -- Soft-delete variants removed from the payload
  UPDATE public.ticket_type_access_variants
  SET is_active = false
  WHERE ticket_type_id = p_ticket_type_id
    AND NOT (id = ANY(v_matched_ids))
    AND is_active = true;
END;
$$;

-- ============================================================================
-- 2. Bulk save RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_event_ticket_types_bulk(
  p_event_id UUID,
  p_delete_ids UUID[],
  p_upserts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_ticket_id UUID;
  v_deleted_count INTEGER := 0;
  v_upserted_count INTEGER := 0;
  v_invalid_ids UUID[];
BEGIN
  IF p_delete_ids IS NOT NULL AND array_length(p_delete_ids, 1) > 0 THEN
    SELECT array_agg(did)
    INTO v_invalid_ids
    FROM unnest(p_delete_ids) AS did
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ticket_types tt
      WHERE tt.id = did AND tt.event_id = p_event_id
    );

    IF v_invalid_ids IS NOT NULL AND array_length(v_invalid_ids, 1) > 0 THEN
      RAISE EXCEPTION 'Ticket type(s) do not belong to event %: %', p_event_id, v_invalid_ids;
    END IF;

    DELETE FROM public.ticket_types
    WHERE event_id = p_event_id
      AND id = ANY(p_delete_ids);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  IF p_upserts IS NULL OR jsonb_typeof(p_upserts) != 'array' THEN
    RETURN jsonb_build_object('deleted', v_deleted_count, 'upserted', 0);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_upserts)
  LOOP
    v_ticket_id := NULL;
    IF v_item ? 'id' AND (v_item->>'id') IS NOT NULL AND (v_item->>'id') != '' THEN
      v_ticket_id := (v_item->>'id')::uuid;
    END IF;

    IF v_ticket_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.ticket_types tt
        WHERE tt.id = v_ticket_id AND tt.event_id = p_event_id
      ) THEN
        RAISE EXCEPTION 'Ticket type % does not belong to event %', v_ticket_id, p_event_id;
      END IF;

      UPDATE public.ticket_types
      SET
        name = COALESCE(v_item->>'name', name),
        price = COALESCE((v_item->>'price')::numeric, price),
        quota = COALESCE((v_item->>'quota')::integer, quota),
        metadata = CASE WHEN v_item ? 'metadata' THEN v_item->'metadata' ELSE metadata END,
        is_active = COALESCE((v_item->>'is_active')::boolean, is_active),
        availability_mode = COALESCE(v_item->>'availability_mode', availability_mode),
        available_start_at = CASE WHEN v_item ? 'available_start_at'
          THEN (v_item->>'available_start_at')::timestamptz ELSE available_start_at END,
        available_end_at = CASE WHEN v_item ? 'available_end_at'
          THEN (v_item->>'available_end_at')::timestamptz ELSE available_end_at END,
        valid_for_days = COALESCE(v_item->>'valid_for_days', valid_for_days),
        valid_for_slots = CASE WHEN v_item ? 'valid_for_slots'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'valid_for_slots')) ELSE valid_for_slots END,
        slot_quotas = CASE WHEN v_item ? 'slot_quotas' THEN v_item->'slot_quotas' ELSE slot_quotas END,
        show_remaining_count = COALESCE((v_item->>'show_remaining_count')::boolean, show_remaining_count),
        threshold_to_show = CASE WHEN v_item ? 'threshold_to_show'
          THEN (v_item->>'threshold_to_show')::integer ELSE threshold_to_show END,
        description = CASE WHEN v_item ? 'description' THEN v_item->>'description' ELSE description END
      WHERE id = v_ticket_id;
    ELSE
      INSERT INTO public.ticket_types (
        event_id,
        name,
        price,
        quota,
        metadata,
        is_active,
        availability_mode,
        available_start_at,
        available_end_at,
        valid_for_days,
        valid_for_slots,
        slot_quotas,
        show_remaining_count,
        threshold_to_show,
        description
      ) VALUES (
        p_event_id,
        v_item->>'name',
        (v_item->>'price')::numeric,
        (v_item->>'quota')::integer,
        COALESCE(v_item->'metadata', '{}'::jsonb),
        COALESCE((v_item->>'is_active')::boolean, true),
        COALESCE(v_item->>'availability_mode', 'always'),
        CASE WHEN v_item ? 'available_start_at' THEN (v_item->>'available_start_at')::timestamptz ELSE NULL END,
        CASE WHEN v_item ? 'available_end_at' THEN (v_item->>'available_end_at')::timestamptz ELSE NULL END,
        COALESCE(v_item->>'valid_for_days', 'day_1'),
        CASE WHEN v_item ? 'valid_for_slots'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'valid_for_slots')) ELSE NULL END,
        CASE WHEN v_item ? 'slot_quotas' THEN v_item->'slot_quotas' ELSE NULL END,
        COALESCE((v_item->>'show_remaining_count')::boolean, true),
        CASE WHEN v_item ? 'threshold_to_show' THEN (v_item->>'threshold_to_show')::integer ELSE NULL END,
        CASE WHEN v_item ? 'description' THEN v_item->>'description' ELSE NULL END
      )
      RETURNING id INTO v_ticket_id;
    END IF;

    IF v_item ? 'access_variants' AND jsonb_typeof(v_item->'access_variants') = 'array'
      AND jsonb_array_length(v_item->'access_variants') > 0 THEN
      PERFORM public.sync_ticket_type_access_variants_bulk(v_ticket_id, v_item->'access_variants');
    END IF;

    v_upserted_count := v_upserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted_count, 'upserted', v_upserted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_ticket_type_access_variants_bulk(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_ticket_types_bulk(UUID, UUID[], JSONB) TO authenticated;

COMMENT ON FUNCTION public.save_event_ticket_types_bulk IS
  'Atomically deletes and upserts event ticket types with access variants in one transaction. RLS applies (SECURITY INVOKER).';
