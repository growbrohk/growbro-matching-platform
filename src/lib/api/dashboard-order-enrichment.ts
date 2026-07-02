import { supabase } from '@/integrations/supabase/client';
import type { Order } from '@/hooks/useOrdersDashboard';
import type { PartnerOrderRowAccess } from '@/lib/collab-order-access';

type RawOrder = {
  id: string;
  created_at: string;
  total_amount: number;
  payment_status: string;
  fulfillment_status: string | null;
  receipt_url: string | null;
  order_no: string | null;
  event_id: string | null;
  order_type: 'event' | 'product' | null;
  metadata: Record<string, unknown> | null;
  shipped_at?: string | null;
  carrier_tracking_number?: string | null;
  addonItemId?: string | null;
  partnerRowAccess?: PartnerOrderRowAccess;
};

/**
 * Batch-enrich a small set of orders with displayName and previewImageUrl.
 */
export async function enrichOrdersWithDisplayFields(orders: RawOrder[]): Promise<Order[]> {
  if (orders.length === 0) return [];

  const uniqueEventIds = [...new Set(orders.map((o) => o.event_id).filter(Boolean))] as string[];
  const eventsMap = new Map<string, { title: string; instagram_preview_image_url: string | null }>();

  if (uniqueEventIds.length > 0) {
    const { data: eventsData } = await supabase
      .from('events')
      .select('id, title, instagram_preview_image_url')
      .in('id', uniqueEventIds);

    (eventsData || []).forEach((event: { id: string; title: string; instagram_preview_image_url: string | null }) => {
      eventsMap.set(event.id, {
        title: event.title,
        instagram_preview_image_url: event.instagram_preview_image_url || null,
      });
    });
  }

  const orderIds = orders.filter((o) => !o.addonItemId).map((o) => o.id);
  const orderItemsMap = new Map<
    string,
    Array<{ ticket_type_id: string | null; quantity: number; metadata?: Record<string, unknown> }>
  >();

  if (orderIds.length > 0) {
    const { data: orderItemsData } = await supabase
      .from('order_items')
      .select('order_id, ticket_type_id, quantity, metadata')
      .in('order_id', orderIds);

    (orderItemsData || []).forEach(
      (item: {
        order_id: string;
        ticket_type_id: string | null;
        quantity: number;
        metadata?: Record<string, unknown>;
      }) => {
        if (!orderItemsMap.has(item.order_id)) {
          orderItemsMap.set(item.order_id, []);
        }
        orderItemsMap.get(item.order_id)!.push({
          ticket_type_id: item.ticket_type_id,
          quantity: item.quantity,
          metadata: item.metadata,
        });
      }
    );
  }

  const ticketTypeIds = new Set<string>();
  orderItemsMap.forEach((items) => {
    items.forEach((item) => {
      if (item.ticket_type_id) ticketTypeIds.add(item.ticket_type_id);
    });
  });

  const ticketTypesMap = new Map<string, { name: string }>();
  if (ticketTypeIds.size > 0) {
    const { data: ticketTypesData } = await supabase
      .from('ticket_types')
      .select('id, name')
      .in('id', Array.from(ticketTypeIds));

    (ticketTypesData || []).forEach((tt: { id: string; name: string }) => {
      ticketTypesMap.set(tt.id, { name: tt.name });
    });
  }

  const productIds = new Set<string>();
  orderItemsMap.forEach((items) => {
    items.forEach((item) => {
      const pid = item.metadata?.product_id as string | undefined;
      if (pid) productIds.add(pid);
    });
  });

  const productsMap = new Map<string, { title: string; image_url: string | null }>();
  if (productIds.size > 0) {
    const { data: productsData } = await supabase
      .from('products')
      .select('id, title, image_url')
      .in('id', Array.from(productIds));

    (productsData || []).forEach((p: { id: string; title: string; image_url: string | null }) => {
      productsMap.set(p.id, { title: p.title, image_url: p.image_url || null });
    });
  }

  return orders.map((order) => {
    const event = order.event_id ? eventsMap.get(order.event_id) : null;
    const orderItems = orderItemsMap.get(order.id) || [];

    let displayName = '';
    let previewImageUrl: string | null = null;

    if (order.addonItemId) {
      displayName = order.metadata?.displayName as string || `Order ${order.order_no || order.id.slice(0, 6)}`;
      previewImageUrl = (order.metadata?.previewImageUrl as string | null) ?? event?.instagram_preview_image_url ?? null;
    } else if (order.order_type === 'product') {
      const firstItem = orderItems[0];
      const productName =
        (firstItem?.metadata?.product_name as string | undefined) ||
        (firstItem?.metadata?.product_id &&
          productsMap.get(firstItem.metadata.product_id as string)?.title) ||
        'Product Order';
      displayName =
        orderItems.length > 1 ? `${productName} +${orderItems.length - 1} more` : productName;
      previewImageUrl = firstItem?.metadata?.product_id
        ? productsMap.get(firstItem.metadata.product_id as string)?.image_url || null
        : null;
    } else if (orderItems.length > 0 && event) {
      const firstTicketType = ticketTypesMap.get(orderItems[0].ticket_type_id!);
      if (firstTicketType) {
        const ticketName = firstTicketType.name;
        displayName =
          orderItems.length > 1
            ? `${event.title} — ${ticketName} +${orderItems.length - 1} more`
            : `${event.title} — ${ticketName}`;
      } else {
        displayName = event.title;
      }
      previewImageUrl = event.instagram_preview_image_url || null;
    } else if (event) {
      displayName = event.title;
      previewImageUrl = event.instagram_preview_image_url || null;
    } else {
      displayName = `Order ${order.order_no || order.id.slice(0, 6)}`;
    }

    return {
      ...order,
      displayName,
      previewImageUrl,
      ...(order.partnerRowAccess ? { partnerRowAccess: order.partnerRowAccess } : {}),
    };
  });
}
