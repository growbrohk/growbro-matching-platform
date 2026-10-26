-- Block deleting a ticket type that already has order lines.
-- order_items and tickets both cascade from ticket_types, and those cascaded
-- deletes skip row-level security, so a host delete would otherwise wipe
-- buyers' tickets.
--
-- Deleting the parent event is still allowed. Foreign-key cascades run as
-- AFTER DELETE triggers, so the event row is already gone when this fires
-- for a cascaded ticket-type delete. A direct delete of the ticket type
-- still sees the event and is rejected when orders exist.

CREATE OR REPLACE FUNCTION public.prevent_delete_ticket_type_with_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = OLD.event_id) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM order_items WHERE ticket_type_id = OLD.id) THEN
    RAISE EXCEPTION 'Ticket type "%" has orders and cannot be deleted. Turn off "On sale" instead.', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_delete_ticket_type_with_orders ON ticket_types;

CREATE TRIGGER prevent_delete_ticket_type_with_orders
  BEFORE DELETE ON ticket_types
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_ticket_type_with_orders();
