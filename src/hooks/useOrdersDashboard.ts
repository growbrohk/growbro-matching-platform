import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  displayName: string;
  previewImageUrl: string | null;
}

export interface OrdersDashboardData {
  revenueTotal: number;
  ordersCount: number; // Legacy - same as ordersCountSubmittedPaid
  ordersCountSubmittedPaid: number; // Count orders where payment_status IN ('submitted','paid') within selected range
  pendingCountSubmitted: number; // Count orders where payment_status='submitted' within selected range
  pendingOrders: Order[];
  allOrders: Order[]; // All orders for OrdersPage filtering
  pendingCount: number; // Legacy - same as pendingCountSubmitted
  completedCount: number;
  allCount: number;
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
 * Get date range for a given range key
 */
function getDateRange(rangeKey: RangeKey): { start: Date; end: Date } {
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
export function useOrdersDashboard(rangeKey: RangeKey = '30d') {
  const { currentOrg } = useAuth();
  const { start, end } = getDateRange(rangeKey);

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
          metadata
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
            metadata
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

        return {
          ...order,
          displayName,
          previewImageUrl,
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

      return {
        revenueTotal,
        ordersCount: ordersCountSubmittedPaid, // Legacy support
        ordersCountSubmittedPaid,
        pendingCountSubmitted,
        pendingOrders,
        allOrders: orders.filter(isAllTabOrder), // Return only orders with payment_status IN ('submitted','paid') for OrdersPage "All" tab
        pendingCount: pendingCountSubmitted, // Legacy support
        completedCount,
        allCount,
      };
    },
    enabled: !!currentOrg,
  });
}
