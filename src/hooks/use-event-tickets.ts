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
  /** Human-readable access path: Public, Code — ABC, Affiliate, Hidden */
  accessLabel: string;
  /** Optional detail for title attribute (e.g. allowed affiliates) */
  accessTooltip?: string;
}

type AccessFields = {
  visibility_mode?: string | null;
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
};

function normalizeAffiliateList(raw: string[] | null | undefined): string {
  if (!Array.isArray(raw) || raw.length === 0) return '';
  return raw.filter(Boolean).join(', ');
}

function modeDisplayName(mode: string): string {
  const m = mode.toLowerCase();
  const map: Record<string, string> = {
    public: 'Public',
    code: 'Code',
    affiliate: 'Affiliate',
    hidden: 'Hidden',
  };
  return map[m] ?? mode.charAt(0).toUpperCase() + mode.slice(1);
}

function buildAccessRow(
  variant: AccessFields | null | undefined,
  ticketType: AccessFields & { name?: string } | null | undefined,
): { accessLabel: string; accessTooltip?: string } {
  const useVariant = Boolean(variant && variant.visibility_mode);
  const modeRaw = (useVariant ? variant!.visibility_mode : ticketType?.visibility_mode) || 'public';
  const mode = String(modeRaw).toLowerCase();

  const accessCode = (useVariant ? variant!.access_code : ticketType?.access_code) ?? null;
  const affiliatesRaw = useVariant ? variant!.allowed_affiliates : ticketType?.allowed_affiliates;
  const affText = normalizeAffiliateList(affiliatesRaw ?? undefined);

  if (mode === 'code') {
    const code = accessCode?.trim() || '';
    const accessLabel = code ? `${modeDisplayName(mode)} — ${code}` : modeDisplayName(mode);
    return { accessLabel };
  }

  if (mode === 'affiliate' && affText) {
    return { accessLabel: modeDisplayName(mode), accessTooltip: affText };
  }

  return { accessLabel: modeDisplayName(mode) };
}

export function useEventTickets(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-tickets', eventId],
    queryFn: async () => {
      if (!eventId) return [];

      // Get tickets with order, order line variant, and ticket type (including legacy access fields)
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
          order_items(
            ticket_type_access_variant_id,
            ticket_type_access_variants(
              visibility_mode,
              access_code,
              allowed_affiliates
            )
          ),
          ticket_types(
            name,
            visibility_mode,
            access_code,
            allowed_affiliates
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
        const variantPart = a.variant_label ? `${a.variant_label} – ` : '';
        return `${variantPart}${label} × ${a.quantity}`;
      };

      return ticketRows.map((ticket): EventTicketRow => {
        const order = ticket.orders as Record<string, unknown> | null;
        const ticketType = ticket.ticket_types as AccessFields & { name?: string } | null;

        const rawOi = ticket.order_items as
          | {
              ticket_type_access_variant_id?: string | null;
              ticket_type_access_variants?: AccessFields | AccessFields[] | null;
            }
          | Array<{
              ticket_type_access_variant_id?: string | null;
              ticket_type_access_variants?: AccessFields | AccessFields[] | null;
            }>
          | null
          | undefined;
        const orderItemsRow = Array.isArray(rawOi) ? rawOi[0] : rawOi;
        let variant: AccessFields | null = null;
        if (orderItemsRow?.ticket_type_access_variants) {
          const v = orderItemsRow.ticket_type_access_variants;
          variant = Array.isArray(v) ? (v[0] as AccessFields) ?? null : v;
        }

        const { accessLabel, accessTooltip } = buildAccessRow(variant, ticketType);

        // Name: prefer ticket first_name/last_name, fallback to order buyer info
        const name = ticket.first_name && ticket.last_name
          ? `${ticket.first_name} ${ticket.last_name}`.trim()
          : order?.buyer_first_name && order?.buyer_last_name
          ? `${order.buyer_first_name} ${order.buyer_last_name}`.trim()
          : ticket.first_name || order?.buyer_first_name || '';

        // Phone: prefer ticket phone, fallback to order buyer_phone
        const phone = ticket.phone || (order?.buyer_phone as string | null | undefined) || null;

        // Email: prefer ticket email, fallback to order buyer_email
        const email = ticket.email || (order?.buyer_email as string | null | undefined) || null;

        // Ticket Type: from ticket_types.name
        const ticketTypeName = ticketType?.name || 'Unknown';

        // Remark: from ticket.remark column (prefer ticket remark, fallback to order metadata for backward compatibility)
        const meta = order?.metadata as { remark?: string } | undefined;
        const remark = ticket.remark || meta?.remark || '';

        // Add-ons: per-ticket (ticket_id = ticket.id) + order-level (ticket_id null) on first ticket of order
        const perTicketAddons = addonItems.filter(
          (a: { ticket_id: string | null }) => a.ticket_id === ticket.id,
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
          accessLabel,
          ...(accessTooltip ? { accessTooltip } : {}),
        };
      });
    },
    enabled: !!eventId,
  });
}
