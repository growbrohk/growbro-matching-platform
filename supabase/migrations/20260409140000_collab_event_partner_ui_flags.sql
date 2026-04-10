-- Collab event partner UI: host-configurable flags on tracking_links + RLS/RPC so
-- partners can use Events list, Tickets/Scan tabs (and optionally Edit) per link.

-- ============================================================================
-- 1. Columns (nullable when type <> 'collab'; CHECK enforces per row)
-- ============================================================================
ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS collab_show_event_in_partner_events_tab BOOLEAN,
  ADD COLUMN IF NOT EXISTS collab_partner_allow_edit_tab BOOLEAN,
  ADD COLUMN IF NOT EXISTS collab_partner_allow_tickets_tab BOOLEAN,
  ADD COLUMN IF NOT EXISTS collab_partner_allow_scan_tab BOOLEAN;

UPDATE public.tracking_links
SET
  collab_show_event_in_partner_events_tab = COALESCE(collab_show_event_in_partner_events_tab, true),
  collab_partner_allow_edit_tab = COALESCE(collab_partner_allow_edit_tab, false),
  collab_partner_allow_tickets_tab = COALESCE(collab_partner_allow_tickets_tab, true),
  collab_partner_allow_scan_tab = COALESCE(collab_partner_allow_scan_tab, true)
WHERE type = 'collab';

COMMENT ON COLUMN public.tracking_links.collab_show_event_in_partner_events_tab IS
  'collab + event: partner org sees event in catalog Events tab when true.';
COMMENT ON COLUMN public.tracking_links.collab_partner_allow_edit_tab IS
  'collab + event: partner editors may edit event/ticket types when true.';
COMMENT ON COLUMN public.tracking_links.collab_partner_allow_tickets_tab IS
  'collab + event: partner may use Tickets tab (read ticket_types / roster) when true.';
COMMENT ON COLUMN public.tracking_links.collab_partner_allow_scan_tab IS
  'collab + event: partner editors may scan/check-in when true.';

ALTER TABLE public.tracking_links
  DROP CONSTRAINT IF EXISTS tracking_links_collab_fields_check;

ALTER TABLE public.tracking_links
  ADD CONSTRAINT tracking_links_collab_fields_check
  CHECK (
    (
      type <> 'collab'
      AND collab_sales_scope IS NULL
      AND collab_partner_role IS NULL
      AND collab_can_view_order_details IS NULL
      AND collab_can_mark_shipped IS NULL
      AND collab_show_event_in_partner_events_tab IS NULL
      AND collab_partner_allow_edit_tab IS NULL
      AND collab_partner_allow_tickets_tab IS NULL
      AND collab_partner_allow_scan_tab IS NULL
    )
    OR (
      type = 'collab'
      AND collab_sales_scope IS NOT NULL
      AND collab_sales_scope IN ('attributed', 'all_for_resource')
      AND collab_partner_role IS NOT NULL
      AND collab_partner_role IN ('viewer', 'editor')
      AND collab_can_view_order_details IS NOT NULL
      AND collab_can_mark_shipped IS NOT NULL
      AND collab_show_event_in_partner_events_tab IS NOT NULL
      AND collab_partner_allow_edit_tab IS NOT NULL
      AND collab_partner_allow_tickets_tab IS NOT NULL
      AND collab_partner_allow_scan_tab IS NOT NULL
    )
  );

-- ============================================================================
-- 2. Effective flags for current user (partner org) on an event
-- ============================================================================
CREATE OR REPLACE FUNCTION public.collab_event_partner_ui_flags(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'is_collab_partner', true,
        'collab_show_event_in_partner_events_tab', bool_or(tl.collab_show_event_in_partner_events_tab),
        'collab_partner_allow_edit_tab', bool_or(
          tl.collab_partner_allow_edit_tab AND tl.collab_partner_role = 'editor'
        ),
        'collab_partner_allow_tickets_tab', bool_or(tl.collab_partner_allow_tickets_tab),
        'collab_partner_allow_scan_tab', bool_or(tl.collab_partner_allow_scan_tab)
      )
      FROM public.tracking_links tl
      INNER JOIN public.org_members om
        ON om.org_id = tl.affiliate_org_id
        AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id IS NOT NULL
        AND tl.event_id = p_event_id
    ),
    jsonb_build_object('is_collab_partner', false)
  );
$$;

COMMENT ON FUNCTION public.collab_event_partner_ui_flags(uuid) IS
  'For authenticated user: aggregated collab UI flags for partner org on this event. OR across active collab links.';

GRANT EXECUTE ON FUNCTION public.collab_event_partner_ui_flags(uuid) TO authenticated;

-- ============================================================================
-- 3. create_ticket_type: allow collab editor with edit tab
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_ticket_type(
  p_event_id uuid,
  p_name text,
  p_price numeric,
  p_quota integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_type_id uuid;
  v_user_id uuid;
  v_host_ok boolean;
  v_collab_ok boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.events e
    INNER JOIN public.org_members om ON om.org_id = e.org_id
    WHERE e.id = p_event_id AND om.user_id = v_user_id
  ) INTO v_host_ok;

  SELECT EXISTS (
    SELECT 1 FROM public.tracking_links tl
    INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = v_user_id
    WHERE tl.type = 'collab'
      AND tl.status = 'active'
      AND tl.event_id = p_event_id
      AND tl.collab_partner_role = 'editor'
      AND tl.collab_partner_allow_edit_tab = true
  ) INTO v_collab_ok;

  IF NOT v_host_ok AND NOT v_collab_ok THEN
    RAISE EXCEPTION 'User does not have access to this event';
  END IF;

  INSERT INTO public.ticket_types (event_id, name, price, quota)
  VALUES (p_event_id, p_name, p_price, p_quota)
  RETURNING id INTO v_ticket_type_id;

  RETURN v_ticket_type_id;
END;
$$;

-- ============================================================================
-- 4. RLS: ticket_types — partner read (tickets or scan tab)
-- ============================================================================
CREATE POLICY "Collab partners can view ticket types for linked events when allowed"
  ON public.ticket_types
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id = ticket_types.event_id
        AND (
          tl.collab_partner_allow_tickets_tab = true
          OR tl.collab_partner_allow_scan_tab = true
        )
    )
  );

CREATE POLICY "Collab editors can insert ticket types when edit tab allowed"
  ON public.ticket_types
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id = ticket_types.event_id
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  );

CREATE POLICY "Collab editors can update ticket types when edit tab allowed"
  ON public.ticket_types
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id = ticket_types.event_id
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id = ticket_types.event_id
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  );

CREATE POLICY "Collab editors can delete ticket types when edit tab allowed"
  ON public.ticket_types
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id = ticket_types.event_id
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  );

-- ============================================================================
-- 5. RLS: ticket_type_access_variants — mirror ticket_types for collab
-- ============================================================================
CREATE POLICY "Collab partners can view access variants when tickets or scan allowed"
  ON public.ticket_type_access_variants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_types tt
      INNER JOIN public.tracking_links tl ON tl.event_id = tt.event_id
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND (
          tl.collab_partner_allow_tickets_tab = true
          OR tl.collab_partner_allow_scan_tab = true
        )
    )
  );

CREATE POLICY "Collab editors can insert access variants when edit tab allowed"
  ON public.ticket_type_access_variants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ticket_types tt
      INNER JOIN public.tracking_links tl ON tl.event_id = tt.event_id
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  );

CREATE POLICY "Collab editors can update access variants when edit tab allowed"
  ON public.ticket_type_access_variants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_types tt
      INNER JOIN public.tracking_links tl ON tl.event_id = tt.event_id
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ticket_types tt
      INNER JOIN public.tracking_links tl ON tl.event_id = tt.event_id
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  );

CREATE POLICY "Collab editors can delete access variants when edit tab allowed"
  ON public.ticket_type_access_variants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_types tt
      INNER JOIN public.tracking_links tl ON tl.event_id = tt.event_id
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tt.id = ticket_type_access_variants.ticket_type_id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  );

-- ============================================================================
-- 6. RLS: events — collab editor update when edit tab allowed
-- ============================================================================
CREATE POLICY "Collab editors can update linked events when edit tab allowed"
  ON public.events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id = events.id
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tracking_links tl
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.event_id = events.id
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
    )
  );

-- ============================================================================
-- 7. RLS: tickets — collab editor scan when scan tab allowed
-- ============================================================================
CREATE POLICY "Collab editors can update tickets for scan when allowed"
  ON public.tickets
  FOR UPDATE
  USING (
    public.collab_can_access_order(tickets.order_id, 'editor', false)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      INNER JOIN public.tracking_links tl ON tl.event_id = o.event_id
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE o.id = tickets.order_id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_allow_scan_tab = true
        AND tl.collab_partner_role = 'editor'
    )
  )
  WITH CHECK (
    public.collab_can_access_order(tickets.order_id, 'editor', false)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      INNER JOIN public.tracking_links tl ON tl.event_id = o.event_id
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE o.id = tickets.order_id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_allow_scan_tab = true
        AND tl.collab_partner_role = 'editor'
    )
  );

-- ============================================================================
-- 8. RLS: order_addon_items — roster add-ons for collab partners
-- ============================================================================
CREATE POLICY "Collab partners can view order addon items for eligible orders"
  ON public.order_addon_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_addon_items.order_id
        AND public.collab_can_access_order(o.id, 'viewer', false)
    )
  );

-- ============================================================================
-- 9. Storage: event-previews — collab editors (edit tab) for host org / event path
-- ============================================================================
CREATE POLICY "Collab editors can upload event preview images for linked events"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'event-previews'
    AND EXISTS (
      SELECT 1
      FROM public.events e
      INNER JOIN public.tracking_links tl
        ON tl.event_id = e.id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE (storage.foldername(name))[1] = e.org_id::text
        AND (storage.foldername(name))[2] = e.id::text
    )
  );

CREATE POLICY "Collab editors can update event preview images for linked events"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'event-previews'
    AND EXISTS (
      SELECT 1
      FROM public.events e
      INNER JOIN public.tracking_links tl
        ON tl.event_id = e.id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE (storage.foldername(name))[1] = e.org_id::text
        AND (storage.foldername(name))[2] = e.id::text
    )
  )
  WITH CHECK (
    bucket_id = 'event-previews'
    AND EXISTS (
      SELECT 1
      FROM public.events e
      INNER JOIN public.tracking_links tl
        ON tl.event_id = e.id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE (storage.foldername(name))[1] = e.org_id::text
        AND (storage.foldername(name))[2] = e.id::text
    )
  );

CREATE POLICY "Collab editors can delete event preview images for linked events"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'event-previews'
    AND EXISTS (
      SELECT 1
      FROM public.events e
      INNER JOIN public.tracking_links tl
        ON tl.event_id = e.id
        AND tl.type = 'collab'
        AND tl.status = 'active'
        AND tl.collab_partner_role = 'editor'
        AND tl.collab_partner_allow_edit_tab = true
      INNER JOIN public.org_members om ON om.org_id = tl.affiliate_org_id AND om.user_id = auth.uid()
      WHERE (storage.foldername(name))[1] = e.org_id::text
        AND (storage.foldername(name))[2] = e.id::text
    )
  );
