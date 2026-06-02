import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { PartnerOrderRowAccess } from '@/lib/collab-order-access';
import { fetchPartnerVisibleOrdersInRange, fetchPartnerVisibleProductOrdersForTable } from '@/lib/collab-order-access';

export type RangeKey = 'today' | '7d' | '30d' | '90d';

export interface Order {
  id: string;
  created_at: string;
  total_amount: number;
  payment_status: string;
  fulfillment_status: string | null;
  receipt_url: string | null;
  order_no: string | null;
  event_id: string | null;
  order_type: 'event' | 'product' | null;
  metadata: Record<string, any> | null;
  shipped_at?: string | null;
  carrier_tracking_number?: string | null;
  /** When set, row represents a single event add-on line (pending-shipping / dispatch). */
  addonItemId?: string | null;
  displayName: string;
  previewImageUrl: string | null;
  /** When set, current org sees this row as affiliate/collab partner (not host). */
  partnerRowAccess?: PartnerOrderRowAccess;
}

export interface OrdersDashboardData {
  revenueTotal: number;
  ordersCount: number; // Legacy - same as ordersCountSubmittedPaid
  ordersCountSubmittedPaid: number; // Count orders where payment_status IN ('submitted','paid') within selected range
  pendingCountSubmitted: number; // Count orders where payment_status='submitted' within selected range
  pendingOrders: Order[];
  /** Product orders, payment confirmed, not shipped; user can mark dispatched (host or collab with canMarkShipped). */
  pendingShippingOrders: Order[];
  pendingShippingCount: number;
  allOrders: Order[]; // All orders for OrdersPage filtering
  pendingCount: number; // Legacy - same as pendingCountSubmitted
  completedCount: number;
  allCount: number;
}

/** Product order paid/confirmed, not shipped, and current org may edit dispatch (mirrors HostOrderDetailView). */
export function isPendingShippingActionable(order: Order): boolean {
  if (order.addonItemId) {
    const paymentConfirmed =
      order.payment_status === 'paid' || order.fulfillment_status === 'confirmed';
    if (!paymentConfirmed || order.shipped_at) return false;
    if (order.partnerRowAccess) return order.partnerRowAccess.canMarkShipped === true;
    return true;
  }
  if (order.order_type !== 'product') return false;
  const paymentConfirmed =
    order.payment_status === 'paid' || order.fulfillment_status === 'confirmed';
  if (!paymentConfirmed || order.shipped_at) return false;
  if (order.partnerRowAccess) return order.partnerRowAccess.canMarkShipped === true;
  return true;
}

/**
 * Helper to format money: $ + number with comma separators, no decimals if .00 else show 2 decimals
 */
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded % 1 === 0) {
    return `$${rounded.toLocaleString()}`;
  }
  return `$${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Get date range for a given range key (shared with dashboard pills and pipeline metrics).
 */
export function getDateRange(rangeKey: RangeKey): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  switch (rangeKey) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
  }

  return { start, end };
}

/**
 * Hook to fetch orders dashboard data
 * 
 * Definitions:
 * - Pending orders: payment_status = 'submitted' (user uploaded receipt / clicked I've paid)
 * - Revenue: SUM(total_amount) for orders where payment_status = 'paid' OR fulfillment_status = 'confirmed'
 * - Completed: payment_status = 'paid' OR fulfillment_status = 'confirmed'
 * 
 * TODO:
 * - Collab count: placeholder 0 (table not ready)
 * - Enquiries count: placeholder query returning 0 (table may not exist)
 * - Product orders: currently skipped (would need product.org_id join)
 */
export function useOrdersDashboard(
  rangeKey: RangeKey = '30d',
  options?: { enabled?: boolean }
) {
  const { currentOrg } = useAuth();
  const { start, end } = getDateRange(rangeKey);
  const enabled = options?.enabled !== false;

  return useQuery({
    queryKey: ['orders-dashboard', currentOrg?.id, rangeKey],
    queryFn: async (): Promise<OrdersDashboardData> => {
      if (!currentOrg) {
        return {
          revenueTotal: 0,
          ordersCount: 0,
          ordersCountSubmittedPaid: 0,
          pendingCountSubmitted: 0,
          pendingOrders: [],
          pendingShippingOrders: [],
          pendingShippingCount: 0,
          allOrders: [],
          pendingCount: 0,
          completedCount: 0,
          allCount: 0,
        };
      }

      // Base query: orders within date range
      // For event orders: join through events to filter by org_id
      // For product orders: need to check if there's a product_id or org_id column
      // For now, we'll query event orders via events.org_id and handle product orders separately if needed
      
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      // Query event orders (event_id in org's events)
      const { data: orgEvents } = await supabase
        .from('events')
        .select('id')
        .eq('org_id', currentOrg.id);
      const eventIds = (orgEvents || []).map((e: any) => e.id);

      // Query product orders (host_org_id = current org)
      const productOrdersQuery = supabase
        .from('orders')
        .select(`
          id,
          created_at,
          total_amount,
          payment_status,
          fulfillment_status,
          receipt_url,
          order_no,
          event_id,
          order_type,
          metadata,
          shipped_at,
          carrier_tracking_number
        `)
        .eq('order_type', 'product')
        .eq('host_org_id', currentOrg.id)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false });

      const { data: productOrdersData } = await productOrdersQuery;

      // Query event orders
      let eventOrdersData: any[] = [];
      if (eventIds.length > 0) {
        const { data } = await supabase
          .from('orders')
          .select(`
            id,
            created_at,
            total_amount,
            payment_status,
            fulfillment_status,
            receipt_url,
            order_no,
            event_id,
            order_type,
            metadata,
            shipped_at,
            carrier_tracking_number
          `)
          .in('event_id', eventIds)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false });
        eventOrdersData = data || [];
      }

      // Merge and dedupe by id
      const allOrdersData = [...eventOrdersData];
      (productOrdersData || []).forEach((o: any) => {
        if (!allOrdersData.some((e: any) => e.id === o.id)) {
          allOrdersData.push(o);
        }
      });
      allOrdersData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      let partnerAccessByOrderId: Map<string, PartnerOrderRowAccess> | null = null;
      try {
        const { orderRows: partnerRows, accessMap } = await fetchPartnerVisibleOrdersInRange(
          currentOrg.id,
          startISO,
          endISO
        );
        partnerAccessByOrderId = accessMap;
        const seenIds = new Set<string>(allOrdersData.map((o: any) => o.id as string));
        for (const pr of partnerRows) {
          const pid = pr.id as string;
          if (pid && !seenIds.has(pid)) {
            seenIds.add(pid);
            allOrdersData.push(pr as any);
          }
        }
        allOrdersData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } catch (err) {
        console.error('Partner pipeline orders merge failed:', err);
      }

      const rawOrders = allOrdersData.map((order: any) => ({
          id: order.id,
          created_at: order.created_at,
          total_amount: Number(order.total_amount) || 0,
          payment_status: order.payment_status || 'unpaid',
          fulfillment_status: order.fulfillment_status || null,
          receipt_url: order.receipt_url || null,
          order_no: order.order_no || null,
          event_id: order.event_id || null,
          order_type: order.order_type || 'event',
          metadata: order.metadata || null,
          shipped_at: order.shipped_at ?? null,
          carrier_tracking_number: order.carrier_tracking_number ?? null,
        }));

      // Helper function to check if order is pending or confirmed
      const isPendingOrConfirmed = (order: any) => {
        const isPending = order.payment_status === 'submitted' || order.fulfillment_status === 'pending_confirmation';
        const isConfirmed = order.fulfillment_status === 'confirmed' || order.payment_status === 'paid';
        return isPending || isConfirmed;
      };

      // Helper function for "All" tab: only orders where payment_status IN ('submitted','paid')
      const isAllTabOrder = (order: any) => {
        return order.payment_status === 'submitted' || order.payment_status === 'paid';
      };

      // Batch fetch events data
      const uniqueEventIds = [...new Set(rawOrders.map((o: any) => o.event_id).filter(Boolean))];
      const eventsMap = new Map<string, { title: string; instagram_preview_image_url: string | null }>();
      
      if (uniqueEventIds.length > 0) {
        const { data: eventsData } = await supabase
          .from('events')
          .select('id, title, instagram_preview_image_url')
          .in('id', uniqueEventIds);
        
        (eventsData || []).forEach((event: any) => {
          eventsMap.set(event.id, {
            title: event.title,
            instagram_preview_image_url: event.instagram_preview_image_url || null,
          });
        });
      }

      // Batch fetch order_items (include metadata for product orders)
      const orderIds = rawOrders.map((o: any) => o.id);
      const orderItemsMap = new Map<string, Array<{ ticket_type_id: string | null; quantity: number; metadata?: any }>>();
      
      if (orderIds.length > 0) {
        const { data: orderItemsData } = await supabase
          .from('order_items')
          .select('order_id, ticket_type_id, quantity, metadata')
          .in('order_id', orderIds);
        
        (orderItemsData || []).forEach((item: any) => {
          if (!orderItemsMap.has(item.order_id)) {
            orderItemsMap.set(item.order_id, []);
          }
          orderItemsMap.get(item.order_id)!.push({
            ticket_type_id: item.ticket_type_id,
            quantity: item.quantity,
            metadata: item.metadata,
          });
        });
      }

      // Batch fetch ticket_types (for event orders)
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
        
        (ticketTypesData || []).forEach((tt: any) => {
          ticketTypesMap.set(tt.id, { name: tt.name });
        });
      }

      // Batch fetch product images (for product orders)
      const productIds = new Set<string>();
      orderItemsMap.forEach((items) => {
        items.forEach((item) => {
          const pid = item.metadata?.product_id;
          if (pid) productIds.add(pid);
        });
      });
      const productsMap = new Map<string, { title: string; image_url: string | null }>();
      if (productIds.size > 0) {
        const { data: productsData } = await supabase
          .from('products')
          .select('id, title, image_url')
          .in('id', Array.from(productIds));
        (productsData || []).forEach((p: any) => {
          productsMap.set(p.id, { title: p.title, image_url: p.image_url || null });
        });
      }

      // Build displayName and previewImageUrl for each order
      const orders: Order[] = rawOrders.map((order: any) => {
        const event = order.event_id ? eventsMap.get(order.event_id) : null;
        const orderItems = orderItemsMap.get(order.id) || [];
        
        let displayName = '';
        let previewImageUrl: string | null = null;

        if (order.order_type === 'product') {
          // Product order: use first product name from order_items metadata
          const firstItem = orderItems[0];
          const productName = firstItem?.metadata?.product_name
            || (firstItem?.metadata?.product_id && productsMap.get(firstItem.metadata.product_id)?.title)
            || 'Product Order';
          if (orderItems.length > 1) {
            displayName = `${productName} +${orderItems.length - 1} more`;
          } else {
            displayName = productName;
          }
          previewImageUrl = firstItem?.metadata?.product_id
            ? productsMap.get(firstItem.metadata.product_id)?.image_url || null
            : null;
        } else if (orderItems.length > 0 && event) {
          // Event order with tickets
          const firstTicketType = ticketTypesMap.get(orderItems[0].ticket_type_id!);
          if (firstTicketType) {
            const ticketName = firstTicketType.name;
            if (orderItems.length > 1) {
              displayName = `${event!.title} — ${ticketName} +${orderItems.length - 1} more`;
            } else {
              displayName = `${event!.title} — ${ticketName}`;
            }
          } else {
            displayName = event!.title;
          }
          previewImageUrl = event?.instagram_preview_image_url || null;
        } else if (event) {
          displayName = event.title;
          previewImageUrl = event.instagram_preview_image_url || null;
        } else {
          displayName = `Order ${order.order_no || order.id.slice(0, 6)}`;
        }

        const partnerRowAccess = partnerAccessByOrderId?.get(order.id);
        return {
          ...order,
          displayName,
          previewImageUrl,
          ...(partnerRowAccess ? { partnerRowAccess } : {}),
        };
      });

      // Calculate revenue: SUM(total_amount) for paid/confirmed orders
      const revenueTotal = orders
        .filter(
          (o) => o.payment_status === 'paid' || o.fulfillment_status === 'confirmed'
        )
        .reduce((sum, o) => sum + o.total_amount, 0);

      // Counts
      const ordersCountSubmittedPaid = orders.filter(isAllTabOrder).length; // Count orders with payment_status IN ('submitted','paid') for dashboard stats
      const pendingCountSubmitted = orders.filter((o) => o.payment_status === 'submitted').length;
      const completedCount = orders.filter(
        (o) => o.payment_status === 'paid' || o.fulfillment_status === 'confirmed'
      ).length;
      const allCount = orders.filter(isAllTabOrder).length; // Count orders with payment_status IN ('submitted','paid')

      // Top 3 pending orders for dashboard
      const pendingOrders = orders
        .filter((o) => o.payment_status === 'submitted')
        .slice(0, 3);

      const pendingShippingFull = orders.filter(isPendingShippingActionable);
      const pendingAddonIds = new Set<string>();

      // Event add-on lines awaiting dispatch (host org events)
      if (eventIds.length > 0) {
        let pendingAddonQuery = supabase
          .from('orders')
          .select('id, created_at, payment_status, fulfillment_status, event_id, order_no')
          .in('event_id', eventIds)
          .in('payment_status', ['submitted', 'paid'])
          .gte('created_at', startISO)
          .lte('created_at', endISO);

        const { data: paidEventOrders } = await pendingAddonQuery;
        const paidEventOrderIds = (paidEventOrders || []).map((o: { id: string }) => o.id);

        if (paidEventOrderIds.length > 0) {
          const { data: unshippedAddons } = await supabase
            .from('order_addon_items')
            .select(
              `
              id,
              label,
              variant_label,
              subtotal,
              shipped_at,
              carrier_tracking_number,
              product_id,
              orders!inner(
                id,
                created_at,
                payment_status,
                fulfillment_status,
                event_id,
                order_no
              )
            `
            )
            .in('order_id', paidEventOrderIds)
            .is('shipped_at', null);

          const addonProductIds = [
            ...new Set(
              (unshippedAddons || [])
                .map((a: { product_id: string }) => a.product_id)
                .filter(Boolean)
            ),
          ];
          const addonProductsMap = new Map<string, { title: string; image_url: string | null }>();
          if (addonProductIds.length > 0) {
            const { data: addonProducts } = await supabase
              .from('products')
              .select('id, title, image_url')
              .in('id', addonProductIds);
            (addonProducts || []).forEach((p: { id: string; title: string; image_url: string | null }) => {
              addonProductsMap.set(p.id, { title: p.title, image_url: p.image_url || null });
            });
          }

          for (const line of (unshippedAddons || []) as Array<Record<string, unknown>>) {
            const order = line.orders as Record<string, unknown>;
            const paymentStatus = (order.payment_status as string) || 'unpaid';
            const fulfillmentStatus = (order.fulfillment_status as string | null) ?? null;
            const paymentConfirmed =
              paymentStatus === 'paid' || fulfillmentStatus === 'confirmed';
            if (!paymentConfirmed) continue;

            const productId = line.product_id as string;
            const product = addonProductsMap.get(productId);
            const label = (line.label as string | null) || product?.title || 'Add-on';
            const variant = line.variant_label as string | null;
            const displayName = variant ? `${variant} — ${label}` : label;
            const eventId = order.event_id as string | null;
            const event = eventId ? eventsMap.get(eventId) : null;

            const addonLineId = line.id as string;
            pendingAddonIds.add(addonLineId);

            pendingShippingFull.push({
              id: order.id as string,
              addonItemId: addonLineId,
              created_at: order.created_at as string,
              total_amount: Number(line.subtotal) || 0,
              payment_status: paymentStatus,
              fulfillment_status: fulfillmentStatus,
              receipt_url: null,
              order_no: (order.order_no as string | null) ?? null,
              event_id: eventId,
              order_type: 'event',
              metadata: null,
              shipped_at: null,
              carrier_tracking_number: (line.carrier_tracking_number as string | null) ?? null,
              displayName: event ? `${event.title} — ${displayName}` : displayName,
              previewImageUrl: product?.image_url ?? event?.instagram_preview_image_url ?? null,
            });
          }
        }
      }

      // Partner-visible unshipped add-on lines
      try {
        const partnerTableFetch = await fetchPartnerVisibleProductOrdersForTable(currentOrg.id, {
          startISO,
          endISO,
        });
        const addonProductIds = [
          ...new Set(partnerTableFetch.addonItemRows.map((a) => a.product_id).filter(Boolean)),
        ];
        const partnerAddonProductsMap = new Map<string, { title: string; image_url: string | null }>();
        if (addonProductIds.length > 0) {
          const { data: addonProducts } = await supabase
            .from('products')
            .select('id, title, image_url')
            .in('id', addonProductIds);
          (addonProducts || []).forEach((p: { id: string; title: string; image_url: string | null }) => {
            partnerAddonProductsMap.set(p.id, { title: p.title, image_url: p.image_url || null });
          });
        }

        const partnerEventIds = [
          ...new Set(
            partnerTableFetch.addonItemRows
              .map((a) => (a.orders.event_id as string | null) ?? null)
              .filter(Boolean)
          ),
        ] as string[];
        const partnerEventsMap = new Map<string, { title: string; instagram_preview_image_url: string | null }>();
        if (partnerEventIds.length > 0) {
          const { data: pev } = await supabase
            .from('events')
            .select('id, title, instagram_preview_image_url')
            .in('id', partnerEventIds);
          (pev || []).forEach((e: { id: string; title: string; instagram_preview_image_url: string | null }) => {
            partnerEventsMap.set(e.id, {
              title: e.title,
              instagram_preview_image_url: e.instagram_preview_image_url || null,
            });
          });
        }

        for (const line of partnerTableFetch.addonItemRows) {
          if (line.shipped_at) continue;
          if (pendingAddonIds.has(line.id)) continue;
          const order = line.orders;
          const paymentStatus = (order.payment_status as string) || 'unpaid';
          const fulfillmentStatus = (order.fulfillment_status as string | null) ?? null;
          const paymentConfirmed =
            paymentStatus === 'paid' || fulfillmentStatus === 'confirmed';
          if (!paymentConfirmed) continue;

          const access = partnerTableFetch.addonItemAccessMap.get(line.id);
          if (!access?.canMarkShipped) continue;

          const product = partnerAddonProductsMap.get(line.product_id);
          const label = line.label || product?.title || 'Add-on';
          const displayName = line.variant_label ? `${line.variant_label} — ${label}` : label;
          const eventId = (order.event_id as string | null) ?? null;
          const event = eventId ? partnerEventsMap.get(eventId) : null;

          pendingShippingFull.push({
            id: line.order_id,
            addonItemId: line.id,
            created_at: order.created_at as string,
            total_amount: Number(line.subtotal) || 0,
            payment_status: paymentStatus,
            fulfillment_status: fulfillmentStatus,
            receipt_url: null,
            order_no: (order.order_no as string | null) ?? null,
            event_id: eventId,
            order_type: 'event',
            metadata: null,
            shipped_at: null,
            carrier_tracking_number: line.carrier_tracking_number,
            displayName: event ? `${event.title} — ${displayName}` : displayName,
            previewImageUrl: product?.image_url ?? event?.instagram_preview_image_url ?? null,
            partnerRowAccess: access,
          });
        }
      } catch (err) {
        console.error('Partner add-on pending shipping merge failed:', err);
      }

      pendingShippingFull.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const pendingShippingCount = pendingShippingFull.length;
      const pendingShippingOrders = pendingShippingFull.slice(0, 3);

      return {
        revenueTotal,
        ordersCount: ordersCountSubmittedPaid, // Legacy support
        ordersCountSubmittedPaid,
        pendingCountSubmitted,
        pendingOrders,
        pendingShippingOrders,
        pendingShippingCount,
        allOrders: orders.filter(isAllTabOrder), // Return only orders with payment_status IN ('submitted','paid') for OrdersPage "All" tab
        pendingCount: pendingCountSubmitted, // Legacy support
        completedCount,
        allCount,
      };
    },
    enabled: enabled && !!currentOrg,
  });
}
