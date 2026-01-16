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
}

export interface OrdersDashboardData {
  revenueTotal: number;
  ordersCount: number;
  pendingOrders: Order[];
  allOrders: Order[]; // All orders for OrdersPage filtering
  pendingCount: number;
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

      // Query orders - need to filter by org_id
      // For event orders: filter via events.org_id using a subquery or RPC
      // For now, query all orders in range and filter client-side by checking events
      // Better approach: use RPC or join, but RLS might handle org filtering
      
      // First, get event IDs for this org
      const { data: orgEvents } = await supabase
        .from('events')
        .select('id')
        .eq('org_id', currentOrg.id);

      const eventIds = (orgEvents || []).map((e: any) => e.id);

      // Query orders for these events
      // If no events exist for org, return empty result
      let ordersQuery = supabase
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
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      // Filter by event_id if we have events
      if (eventIds.length > 0) {
        ordersQuery = ordersQuery.in('event_id', eventIds);
      } else {
        // No events for this org, return empty result
        return {
          revenueTotal: 0,
          ordersCount: 0,
          pendingOrders: [],
          allOrders: [],
          pendingCount: 0,
          completedCount: 0,
          allCount: 0,
        };
      }

      const { data: ordersData, error: ordersError } = await ordersQuery.order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        // If join fails, try direct query (might need RLS or different structure)
        // For now, return empty data
        return {
          revenueTotal: 0,
          ordersCount: 0,
          pendingOrders: [],
          allOrders: [],
          pendingCount: 0,
          completedCount: 0,
          allCount: 0,
        };
      }

      // Orders are already filtered by event_id server-side
      // For product orders: TODO - need to check product.org_id (skip for now)
      const orders = (ordersData || [])
        .filter((order: any) => {
          // Only include event orders for now
          // Product orders would need separate query with product.org_id join
          return order.order_type === 'event' || !order.order_type;
        })
        .map((order: any) => ({
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
        })) as Order[];

      // Calculate revenue: SUM(total_amount) for paid/confirmed orders
      const revenueTotal = orders
        .filter(
          (o) => o.payment_status === 'paid' || o.fulfillment_status === 'confirmed'
        )
        .reduce((sum, o) => sum + o.total_amount, 0);

      // Counts
      const ordersCount = orders.length;
      const pendingCount = orders.filter((o) => o.payment_status === 'submitted').length;
      const completedCount = orders.filter(
        (o) => o.payment_status === 'paid' || o.fulfillment_status === 'confirmed'
      ).length;
      const allCount = orders.length;

      // Top 3 pending orders for dashboard
      const pendingOrders = orders
        .filter((o) => o.payment_status === 'submitted')
        .slice(0, 3);

      return {
        revenueTotal,
        ordersCount,
        pendingOrders,
        allOrders: orders, // Return all orders for OrdersPage
        pendingCount,
        completedCount,
        allCount,
      };
    },
    enabled: !!currentOrg,
  });
}
