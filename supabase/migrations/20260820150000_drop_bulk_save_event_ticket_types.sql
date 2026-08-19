-- Remove bulk ticket-type save RPCs (statement timeout + payload bugs on normal saves).
-- Client uses parallel per-row writes instead.

DROP FUNCTION IF EXISTS public.save_event_ticket_types_bulk(UUID, UUID[], JSONB);
DROP FUNCTION IF EXISTS public.sync_ticket_type_access_variants_bulk(UUID, JSONB);
