import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EventTicketRow {
  id: string;
  status: string;
  name: string; // Combined first_name + last_name from ticket or order
  phone: string | null;
  email: string | null;
  ticketType: string; // From ticket_types.name
  remark: string; // From order metadata or ticket metadata if available
  addons: string; // Formatted add-on products (per-ticket + order-level on first ticket of order)
  scanned_at: string | null;
  order_id: string;
}

export function useEventTickets(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-tickets', eventId],
    queryFn: async () => {
      if (!eventId) return [];

      // Get tickets with order and ticket type info
      // Using a join through orders to filter by event_id and order stage
      // Only include: confirmed orders OR pending_confirmation with receipt uploaded (payment_status='submitted')
      // Exclude: unpaid orders without receipt, cancelled orders
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          status,
          scanned_at,
          first_name,
          last_name,
          email,
          phone,
          remark,
          order_id,
          orders!inner(
            id,
            event_id,
            buyer_first_name,
            buyer_last_name,
            buyer_email,
            buyer_phone,
            metadata
          ),
          ticket_types(
            name
          )
        `)
        .eq('orders.event_id', eventId)
        .or('fulfillment_status.eq.confirmed,and(fulfillment_status.eq.pending_confirmation,payment_status.eq.submitted)', {
          foreignTable: 'orders',
        })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const ticketRows = data || [];

      // Fetch order_addon_items for all orders in this result
      const orderIds = [...new Set(ticketRows.map((t: { order_id: string }) => t.order_id))];
      let addonItems: Array<{ order_id: string; ticket_id: string | null; label: string | null; variant_label: string | null; quantity: number }> = [];
      if (orderIds.length > 0) {
        const { data: addonData } = await supabase
          .from('order_addon_items')
          .select('order_id, ticket_id, label, variant_label, quantity')
          .in('order_id', orderIds);
        addonItems = addonData || [];
      }

      // Build addons string per ticket: per-ticket addons + order-level addons on first ticket of each order
      const orderLevelAddonsShown = new Set<string>();
      const formatAddon = (a: { label: string | null; variant_label: string | null; quantity: number }) => {
        const label = a.label || 'Add-on';
        const variantPart = a.variant_label ? ` – ${a.variant_label}` : '';
        return `${label}${variantPart} × ${a.quantity}`;
      };

      return ticketRows.map((ticket): EventTicketRow => {
        const order = ticket.orders as any;
        const ticketType = ticket.ticket_types as any;

        // Name: prefer ticket first_name/last_name, fallback to order buyer info
        const name = ticket.first_name && ticket.last_name
          ? `${ticket.first_name} ${ticket.last_name}`.trim()
          : order?.buyer_first_name && order?.buyer_last_name
          ? `${order.buyer_first_name} ${order.buyer_last_name}`.trim()
          : ticket.first_name || order?.buyer_first_name || '';

        // Phone: prefer ticket phone, fallback to order buyer_phone
        const phone = ticket.phone || order?.buyer_phone || null;

        // Email: prefer ticket email, fallback to order buyer_email
        const email = ticket.email || order?.buyer_email || null;

        // Ticket Type: from ticket_types.name
        const ticketTypeName = ticketType?.name || 'Unknown';

        // Remark: from ticket.remark column (prefer ticket remark, fallback to order metadata for backward compatibility)
        const remark = ticket.remark || order?.metadata?.remark || '';

        // Add-ons: per-ticket (ticket_id = ticket.id) + order-level (ticket_id null) on first ticket of order
        const perTicketAddons = addonItems.filter(
          (a: { ticket_id: string | null }) => a.ticket_id === ticket.id
        );
        const orderLevelAddons =
          !orderLevelAddonsShown.has(ticket.order_id)
            ? addonItems.filter((a: { ticket_id: string | null; order_id: string }) => a.ticket_id == null && a.order_id === ticket.order_id)
            : [];
        if (orderLevelAddons.length > 0) {
          orderLevelAddonsShown.add(ticket.order_id);
        }
        const allAddons = [...perTicketAddons, ...orderLevelAddons];
        const addons = allAddons.length > 0 ? allAddons.map(formatAddon).join(', ') : '';

        return {
          id: ticket.id,
          status: ticket.status || 'valid',
          name,
          phone,
          email,
          ticketType: ticketTypeName,
          remark,
          addons,
          scanned_at: ticket.scanned_at,
          order_id: ticket.order_id,
        };
      });
    },
    enabled: !!eventId,
  });
}
