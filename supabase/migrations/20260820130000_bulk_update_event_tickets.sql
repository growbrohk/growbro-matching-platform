-- Bulk update event tickets in one transaction (RLS enforced via SECURITY INVOKER)
-- and harden refund authority trigger (SECURITY DEFINER + WHEN clause).

-- ============================================================================
-- 1. Bulk update RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_event_tickets_bulk(
  p_event_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_ticket_id UUID;
  v_updated_count INTEGER := 0;
  v_rejected_ids UUID[] := ARRAY[]::UUID[];
  v_invalid_scope_ids UUID[];
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) != 'array' THEN
    RAISE EXCEPTION 'p_updates must be a JSON array';
  END IF;

  IF jsonb_array_length(p_updates) = 0 THEN
    RETURN jsonb_build_object('updated', 0);
  END IF;

  SELECT array_agg((elem->>'id')::uuid)
  INTO v_invalid_scope_ids
  FROM jsonb_array_elements(p_updates) AS elem
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tickets t
    INNER JOIN public.orders o ON o.id = t.order_id
    WHERE t.id = (elem->>'id')::uuid
      AND o.event_id = p_event_id
  );

  IF v_invalid_scope_ids IS NOT NULL AND array_length(v_invalid_scope_ids, 1) > 0 THEN
    RAISE EXCEPTION 'Ticket(s) do not belong to event %: %', p_event_id, v_invalid_scope_ids;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    v_ticket_id := (v_item->>'id')::uuid;

    IF v_ticket_id IS NULL THEN
      RAISE EXCEPTION 'Each update must include a ticket id';
    END IF;

    UPDATE public.tickets
    SET
      first_name = CASE WHEN v_item ? 'first_name' THEN v_item->>'first_name' ELSE first_name END,
      last_name = CASE WHEN v_item ? 'last_name' THEN v_item->>'last_name' ELSE last_name END,
      remark = CASE WHEN v_item ? 'remark' THEN v_item->>'remark' ELSE remark END,
      status = CASE WHEN v_item ? 'status' THEN v_item->>'status' ELSE status END,
      scanned_at = CASE
        WHEN v_item ? 'scanned_at' THEN (v_item->>'scanned_at')::timestamptz
        ELSE scanned_at
      END,
      scanned_by = CASE
        WHEN v_item ? 'scanned_by' THEN (v_item->>'scanned_by')::uuid
        ELSE scanned_by
      END,
      refunded_at = CASE
        WHEN v_item ? 'refunded_at' THEN (v_item->>'refunded_at')::timestamptz
        ELSE refunded_at
      END
    WHERE id = v_ticket_id;

    IF NOT FOUND THEN
      v_rejected_ids := array_append(v_rejected_ids, v_ticket_id);
    ELSE
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  IF array_length(v_rejected_ids, 1) > 0 THEN
    RAISE EXCEPTION 'Update rejected for ticket(s): %', v_rejected_ids;
  END IF;

  RETURN jsonb_build_object('updated', v_updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_event_tickets_bulk(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.update_event_tickets_bulk IS
  'Atomically updates multiple event tickets in one transaction. RLS policies apply (SECURITY INVOKER).';

-- ============================================================================
-- 2. Harden refund authority trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_ticket_refund_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_org_id UUID;
BEGIN
  SELECT e.org_id INTO v_event_org_id
  FROM public.orders o
  JOIN public.events e ON e.id = o.event_id
  WHERE o.id = NEW.order_id;

  IF v_event_org_id IS NULL THEN
    RAISE EXCEPTION 'Cannot refund ticket: order is not an event order';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members om
    WHERE om.org_id = v_event_org_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only host organization members can refund tickets';
  END IF;

  IF NEW.refunded_at IS NOT NULL THEN
    NEW.refunded_by := auth.uid();
  ELSE
    NEW.refunded_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_refund_authority ON public.tickets;
CREATE TRIGGER tickets_refund_authority
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  WHEN (OLD.refunded_at IS DISTINCT FROM NEW.refunded_at)
  EXECUTE FUNCTION public.enforce_ticket_refund_authority();
