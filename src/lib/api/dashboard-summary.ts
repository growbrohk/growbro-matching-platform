import { supabase } from '@/integrations/supabase/client';
import {
  fetchPartnerVisibleOrdersInRange,
  fetchPartnerVisibleProductOrdersForTable,
  type PartnerOrderRowAccess,
} from '@/lib/collab-order-access';
import { enrichOrdersWithDisplayFields } from '@/lib/api/dashboard-order-enrichment';
import {
  fetchOrderEffectiveRevenueMap,
  getEffectiveOrderAmount,
  isEventOrderCountedAsActive,
  type OrderEffectiveRevenueRow,
} from '@/lib/api/order-effective-revenue';
import {
  getDateRange,
  isPendingShippingActionable,
  type Order,
  type RangeKey,
} from '@/hooks/useOrdersDashboard';

export interface DashboardSummaryData {
  revenueTotal: number;
  ordersCountSubmittedPaid: number;
  pendingCountSubmitted: number;
  pendingShippingCount: number;
  pendingOrders: Order[];
  pendingShippingOrders: Order[];
}

const ORDER_SELECT = `
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
`;

type RawOrderRow = {
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

function toRawOrder(row: Record<string, unknown>, partnerRowAccess?: PartnerOrderRowAccess): RawOrderRow {
  return {
    id: row.id as string,
    created_at: row.created_at as string,
    total_amount: Number(row.total_amount) || 0,
    payment_status: (row.payment_status as string) || 'unpaid',
    fulfillment_status: (row.fulfillment_status as string | null) ?? null,
    receipt_url: (row.receipt_url as string | null) ?? null,
    order_no: (row.order_no as string | null) ?? null,
    event_id: (row.event_id as string | null) ?? null,
    order_type: (row.order_type as 'event' | 'product' | null) ?? 'event',
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    shipped_at: (row.shipped_at as string | null) ?? null,
    carrier_tracking_number: (row.carrier_tracking_number as string | null) ?? null,
    ...(partnerRowAccess ? { partnerRowAccess } : {}),
  };
}

function isAllTabOrder(order: RawOrderRow): boolean {
  return order.payment_status === 'submitted' || order.payment_status === 'paid';
}

function computeStatsFromOrders(
  orders: RawOrderRow[],
  effectiveMap: Map<string, OrderEffectiveRevenueRow>,
) {
  const revenueTotal = orders
    .filter((o) => o.payment_status === 'paid' || o.fulfillment_status === 'confirmed')
    .reduce((sum, o) => sum + getEffectiveOrderAmount(o, effectiveMap), 0);
  const ordersCountSubmittedPaid = orders.filter(
    (o) => isAllTabOrder(o) && isEventOrderCountedAsActive(o, effectiveMap),
  ).length;
  const pendingCountSubmitted = orders.filter((o) => o.payment_status === 'submitted').length;
  const pendingShippingCount = orders.filter((o) => isPendingShippingActionable(o as Order)).length;
  return { revenueTotal, ordersCountSubmittedPaid, pendingCountSubmitted, pendingShippingCount };
}

async function fetchHostPendingTop3(
  orgId: string,
  startISO: string,
  endISO: string,
  eventIds: string[]
): Promise<RawOrderRow[]> {
  const [productRes, eventRes] = await Promise.all([
    supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('order_type', 'product')
      .eq('host_org_id', orgId)
      .eq('payment_status', 'submitted')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: false })
      .limit(3),
    eventIds.length > 0
      ? supabase
          .from('orders')
          .select(ORDER_SELECT)
          .in('event_id', eventIds)
          .eq('payment_status', 'submitted')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const merged = [...(productRes.data || []), ...(eventRes.data || [])]
    .map((row) => toRawOrder(row as Record<string, unknown>))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  return merged;
}

async function fetchHostPendingShippingCandidates(
  orgId: string,
  startISO: string,
  endISO: string,
  eventIds: string[]
): Promise<RawOrderRow[]> {
  const candidates: RawOrderRow[] = [];

  const { data: productOrders } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('order_type', 'product')
    .eq('host_org_id', orgId)
    .in('payment_status', ['paid', 'submitted'])
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .is('shipped_at', null)
    .order('created_at', { ascending: false })
    .limit(5);

  for (const row of productOrders || []) {
    const raw = toRawOrder(row as Record<string, unknown>);
    if (isPendingShippingActionable(raw as Order)) {
      candidates.push(raw);
    }
  }

  if (eventIds.length > 0) {
    const { data: paidEventOrders } = await supabase
      .from('orders')
      .select('id')
      .in('event_id', eventIds)
      .in('payment_status', ['submitted', 'paid'])
      .gte('created_at', startISO)
      .lte('created_at', endISO);

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
        .is('shipped_at', null)
        .limit(5);

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
        (addonProducts || []).forEach(
          (p: { id: string; title: string; image_url: string | null }) => {
            addonProductsMap.set(p.id, { title: p.title, image_url: p.image_url || null });
          }
        );
      }

      const eventTitleMap = new Map<string, string>();
      if (eventIds.length > 0) {
        const { data: evs } = await supabase
          .from('events')
          .select('id, title, instagram_preview_image_url')
          .in('id', eventIds);
        (evs || []).forEach(
          (e: { id: string; title: string; instagram_preview_image_url: string | null }) => {
            eventTitleMap.set(e.id, e.title);
          }
        );
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
        const eventTitle = eventId ? eventTitleMap.get(eventId) : null;

        candidates.push({
          id: order.id as string,
          addonItemId: line.id as string,
          created_at: order.created_at as string,
          total_amount: Number(line.subtotal) || 0,
          payment_status: paymentStatus,
          fulfillment_status: fulfillmentStatus,
          receipt_url: null,
          order_no: (order.order_no as string | null) ?? null,
          event_id: eventId,
          order_type: 'event',
          metadata: {
            displayName: eventTitle ? `${eventTitle} — ${displayName}` : displayName,
            previewImageUrl: product?.image_url ?? null,
          },
          shipped_at: null,
          carrier_tracking_number: (line.carrier_tracking_number as string | null) ?? null,
        });
      }
    }
  }

  return candidates
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);
}

async function orgHasPartnerLinks(orgId: string): Promise<boolean> {
  const { count, error } = await (supabase.from('tracking_links' as any) as any)
    .select('*', { count: 'exact', head: true })
    .eq('affiliate_org_id', orgId)
    .eq('status', 'active');

  if (error) {
    console.error('orgHasPartnerLinks:', error);
    return false;
  }
  return (count || 0) > 0;
}

/**
 * Lightweight dashboard fetch: RPC aggregates + top-3 lists with minimal enrichment.
 */
export async function fetchDashboardSummary(
  orgId: string,
  rangeKey: RangeKey
): Promise<DashboardSummaryData> {
  const { start, end } = getDateRange(rangeKey);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const hostStatsPromise = supabase.rpc('get_dashboard_order_stats', {
    p_org_id: orgId,
    p_start: startISO,
    p_end: endISO,
  });

  const eventIdsPromise = supabase.from('events').select('id').eq('org_id', orgId);

  const partnerLinksPromise = orgHasPartnerLinks(orgId);

  const [{ data: hostStatsRows, error: statsError }, { data: orgEvents }, hasPartnerLinks] =
    await Promise.all([hostStatsPromise, eventIdsPromise, partnerLinksPromise]);

  if (statsError) {
    console.error('get_dashboard_order_stats:', statsError);
    throw statsError;
  }

  const hostStats = hostStatsRows?.[0] ?? {
    revenue_total: 0,
    orders_count_submitted_paid: 0,
    pending_count_submitted: 0,
    pending_shipping_count: 0,
  };

  const eventIds = (orgEvents || []).map((e: { id: string }) => e.id);

  const [hostPendingTop3, hostShippingTop3, partnerBundle] = await Promise.all([
    fetchHostPendingTop3(orgId, startISO, endISO, eventIds),
    fetchHostPendingShippingCandidates(orgId, startISO, endISO, eventIds),
    hasPartnerLinks
      ? Promise.all([
          fetchPartnerVisibleOrdersInRange(orgId, startISO, endISO),
          fetchPartnerVisibleProductOrdersForTable(orgId, { startISO, endISO }),
        ])
      : Promise.resolve(null),
  ]);

  let revenueTotal = Number(hostStats.revenue_total) || 0;
  let ordersCountSubmittedPaid = Number(hostStats.orders_count_submitted_paid) || 0;
  let pendingCountSubmitted = Number(hostStats.pending_count_submitted) || 0;
  let pendingShippingCount = Number(hostStats.pending_shipping_count) || 0;

  const pendingCandidates = [...hostPendingTop3];
  const shippingCandidates = [...hostShippingTop3];
  const seenOrderIds = new Set(hostPendingTop3.map((o) => o.id));
  const seenShippingKeys = new Set(
    hostShippingTop3.map((o) => (o.addonItemId ? `addon-${o.addonItemId}` : o.id))
  );

  if (partnerBundle) {
    const [{ orderRows, accessMap }, partnerTable] = partnerBundle;

    const partnerRaw = (orderRows as Record<string, unknown>[]).map((row) => {
      const id = row.id as string;
      return toRawOrder(row, accessMap.get(id));
    });

    const partnerEffectiveMap = await fetchOrderEffectiveRevenueMap(partnerRaw.map((o) => o.id));
    const partnerStats = computeStatsFromOrders(partnerRaw, partnerEffectiveMap);
    revenueTotal += partnerStats.revenueTotal;
    ordersCountSubmittedPaid += partnerStats.ordersCountSubmittedPaid;
    pendingCountSubmitted += partnerStats.pendingCountSubmitted;

    for (const row of partnerRaw.filter((o) => o.payment_status === 'submitted')) {
      if (!seenOrderIds.has(row.id)) {
        seenOrderIds.add(row.id);
        pendingCandidates.push(row);
      }
    }

    let partnerShippingExtra = 0;
    for (const line of partnerTable.addonItemRows) {
      if (line.shipped_at) continue;
      const order = line.orders;
      const paymentStatus = (order.payment_status as string) || 'unpaid';
      const fulfillmentStatus = (order.fulfillment_status as string | null) ?? null;
      const paymentConfirmed =
        paymentStatus === 'paid' || fulfillmentStatus === 'confirmed';
      if (!paymentConfirmed) continue;

      const access = partnerTable.addonItemAccessMap.get(line.id);
      if (!access?.canMarkShipped) continue;

      partnerShippingExtra += 1;
      const key = `addon-${line.id}`;
      if (!seenShippingKeys.has(key)) {
        seenShippingKeys.add(key);
        shippingCandidates.push({
          id: line.order_id,
          addonItemId: line.id,
          created_at: order.created_at as string,
          total_amount: Number(line.subtotal) || 0,
          payment_status: paymentStatus,
          fulfillment_status: fulfillmentStatus,
          receipt_url: null,
          order_no: (order.order_no as string | null) ?? null,
          event_id: (order.event_id as string | null) ?? null,
          order_type: 'event',
          metadata: {
            displayName: line.label || 'Add-on',
            previewImageUrl: null,
          },
          shipped_at: null,
          carrier_tracking_number: line.carrier_tracking_number,
          partnerRowAccess: access,
        });
      }
    }

    for (const row of partnerRaw) {
      const raw = row as Order;
      if (!isPendingShippingActionable(raw)) continue;
      partnerShippingExtra += 1;
      const key = raw.addonItemId ? `addon-${raw.addonItemId}` : raw.id;
      if (!seenShippingKeys.has(key)) {
        seenShippingKeys.add(key);
        shippingCandidates.push(row);
      }
    }

    pendingShippingCount += partnerShippingExtra;
  }

  pendingCandidates.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  shippingCandidates.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const pendingTop3 = pendingCandidates.slice(0, 3);
  const shippingTop3 = shippingCandidates.slice(0, 3);

  const [pendingOrders, pendingShippingOrders] = await Promise.all([
    enrichOrdersWithDisplayFields(pendingTop3),
    enrichOrdersWithDisplayFields(shippingTop3),
  ]);

  return {
    revenueTotal,
    ordersCountSubmittedPaid,
    pendingCountSubmitted,
    pendingShippingCount,
    pendingOrders,
    pendingShippingOrders,
  };
}
