import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_LIST_LIMIT } from '@/lib/constants/query-limits';
import { applyAbortSignal, mapChunked } from '@/lib/supabase-chunked-in';

/** Bulk-fetch product IDs per order from order_items metadata (replaces per-order N+1). */
async function fetchOrderProductIdsMap(
  orderIds: string[],
  signal?: AbortSignal
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (orderIds.length === 0) return result;

  const items = await mapChunked(orderIds, async (chunk) => {
    const { data, error } = await applyAbortSignal(
      supabase.from('order_items').select('order_id, metadata').in('order_id', chunk),
      signal
    );
    if (error) throw error;
    return data || [];
  });

  for (const item of items) {
    const oid = item.order_id as string;
    const pid = (item.metadata as { product_id?: string } | undefined)?.product_id;
    if (!pid) continue;
    if (!result.has(oid)) result.set(oid, new Set());
    result.get(oid)!.add(pid);
  }
  return result;
}

type RawAddonLine = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  subtotal: number;
  label: string | null;
  variant_label: string | null;
  shipped_at: string | null;
  carrier_tracking_number: string | null;
};

/** Bulk-fetch add-on lines for many orders and products at once. */
async function fetchAddonLinesByOrderIdsAndProducts(
  orderIds: string[],
  productIds: string[],
  signal?: AbortSignal
): Promise<Map<string, RawAddonLine[]>> {
  const result = new Map<string, RawAddonLine[]>();
  if (orderIds.length === 0 || productIds.length === 0) return result;

  const lines = await mapChunked(orderIds, async (chunk) => {
    const { data, error } = await applyAbortSignal(
      supabase
        .from('order_addon_items')
        .select(
          'id, order_id, product_id, quantity, subtotal, label, variant_label, shipped_at, carrier_tracking_number'
        )
        .in('order_id', chunk)
        .in('product_id', productIds),
      signal
    );
    if (error) throw error;
    return (data || []) as RawAddonLine[];
  });

  for (const line of lines) {
    const oid = line.order_id;
    if (!result.has(oid)) result.set(oid, []);
    result.get(oid)!.push(line);
  }
  return result;
}

async function fetchAddonLinesByOrderIds(
  orderIds: string[],
  productId: string,
  signal?: AbortSignal
): Promise<Map<string, RawAddonLine[]>> {
  return fetchAddonLinesByOrderIdsAndProducts(orderIds, [productId], signal);
}

function groupLinksByHost(links: PartnerPipelineLinkRow[]): Map<string, PartnerPipelineLinkRow[]> {
  const map = new Map<string, PartnerPipelineLinkRow[]>();
  for (const link of links) {
    const hostId = link.host_org_id;
    if (!map.has(hostId)) map.set(hostId, []);
    map.get(hostId)!.push(link);
  }
  return map;
}

function orderHasProduct(
  productIdsByOrder: Map<string, Set<string>>,
  orderId: string,
  productId: string
): boolean {
  return productIdsByOrder.get(orderId)?.has(productId) ?? false;
}

export interface PartnerOrderRowAccess {
  isPartnerRow: true;
  canViewOrderDetails: boolean;
  canConfirmOrder: boolean;
  canMarkShipped: boolean;
}

export type PartnerAccessMap = Map<string, PartnerOrderRowAccess>;

export interface PartnerPipelineLinkRow {
  id: string;
  type: string;
  host_org_id: string;
  event_id: string | null;
  product_id: string | null;
  collab_sales_scope: string | null;
  collab_partner_role: string | null;
  collab_can_view_order_details: boolean | null;
  collab_can_mark_shipped: boolean | null;
  status?: string;
  affiliate_org_id?: string;
  commission_rate?: number | null;
  commission_basis?: string | null;
}

function emptyAccess(): PartnerOrderRowAccess {
  return {
    isPartnerRow: true,
    canViewOrderDetails: false,
    canConfirmOrder: false,
    canMarkShipped: false,
  };
}

function mergeAccess(map: PartnerAccessMap, orderId: string, link: PartnerPipelineLinkRow) {
  const cur = map.get(orderId) ?? emptyAccess();
  if (link.type === 'collab') {
    if (link.collab_can_view_order_details === true) {
      cur.canViewOrderDetails = true;
    }
    if (link.collab_partner_role === 'editor') {
      cur.canConfirmOrder = true;
    }
    if (link.collab_partner_role === 'editor' && link.collab_can_mark_shipped === true) {
      cur.canMarkShipped = true;
    }
  }
  map.set(orderId, cur);
}

function mergeAddonAccess(
  map: Map<string, PartnerOrderRowAccess>,
  addonItemId: string,
  link: PartnerPipelineLinkRow
) {
  const cur = map.get(addonItemId) ?? emptyAccess();
  if (link.type === 'collab') {
    if (link.collab_can_view_order_details === true) {
      cur.canViewOrderDetails = true;
    }
    if (link.collab_partner_role === 'editor') {
      cur.canConfirmOrder = true;
    }
    if (link.collab_partner_role === 'editor' && link.collab_can_mark_shipped === true) {
      cur.canMarkShipped = true;
    }
  }
  map.set(addonItemId, cur);
}

function linkIsAttributedOnly(link: PartnerPipelineLinkRow): boolean {
  return link.type === 'affiliate' || link.collab_sales_scope === 'attributed';
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
  tracking_link_id,
  host_org_id,
  shipped_at,
  carrier_tracking_number
`;

export async function fetchPartnerVisibleOrdersInRange(
  orgId: string,
  startISO: string,
  endISO: string
): Promise<{ orderRows: Record<string, unknown>[]; accessMap: PartnerAccessMap }> {
  const accessMap: PartnerAccessMap = new Map();

  const { data: links, error } = await supabase
    .from('tracking_links' as never)
    .select(
      'id, type, host_org_id, event_id, product_id, collab_sales_scope, collab_partner_role, collab_can_view_order_details, collab_can_mark_shipped, status'
    )
    .eq('affiliate_org_id', orgId)
    .in('type', ['affiliate', 'collab'])
    .eq('status', 'active');

  if (error) {
    console.error('fetchPartnerVisibleOrdersInRange: tracking_links', error);
    return { orderRows: [], accessMap };
  }

  const linkList = (links || []) as PartnerPipelineLinkRow[];
  if (linkList.length === 0) {
    return { orderRows: [], accessMap };
  }

  const attributedLinkIds = linkList.filter(linkIsAttributedOnly).map((l) => l.id);
  const orderMap = new Map<string, Record<string, unknown>>();

  if (attributedLinkIds.length > 0) {
    const { data: attrOrders, error: oErr } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .in('tracking_link_id', attributedLinkIds)
      .gte('created_at', startISO)
      .lte('created_at', endISO);

    if (oErr) {
      console.error('fetchPartnerVisibleOrdersInRange: attributed orders', oErr);
    } else {
      for (const row of (attrOrders || []) as Record<string, unknown>[]) {
        const oid = row.id as string;
        const tid = row.tracking_link_id as string | null;
        if (!tid) continue;
        const link = linkList.find((l) => l.id === tid);
        if (!link) continue;
        orderMap.set(oid, row);
        mergeAccess(accessMap, oid, link);
      }
    }
  }

  for (const link of linkList.filter((l) => l.type === 'collab' && l.collab_sales_scope === 'all_for_resource')) {
    if (link.event_id) {
      const { data: evOrders, error: eErr } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('event_id', link.event_id)
        .gte('created_at', startISO)
        .lte('created_at', endISO);
      if (eErr) {
        console.error('fetchPartnerVisibleOrdersInRange: event orders', eErr);
        continue;
      }
      for (const row of (evOrders || []) as Record<string, unknown>[]) {
        const id = row.id as string;
        orderMap.set(id, row);
        mergeAccess(accessMap, id, link);
      }
    }

    if (link.product_id) {
      const { data: prodOrders, error: pErr } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('host_org_id', link.host_org_id)
        .eq('order_type', 'product')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false })
        .limit(DEFAULT_LIST_LIMIT);
      if (pErr) {
        console.error('fetchPartnerVisibleOrdersInRange: product orders', pErr);
        continue;
      }
      const pid = link.product_id;
      const prodOrderRows = (prodOrders || []) as Record<string, unknown>[];
      const prodOrderIds = prodOrderRows.map((row) => row.id as string);
      const productIdsByOrder = await fetchOrderProductIdsMap(prodOrderIds);
      for (const row of prodOrderRows) {
        const oid = row.id as string;
        if (!orderHasProduct(productIdsByOrder, oid, pid)) continue;
        orderMap.set(oid, row);
        mergeAccess(accessMap, oid, link);
      }
    }
  }

  return { orderRows: Array.from(orderMap.values()), accessMap };
}

const PRODUCT_ORDERS_TABLE_SELECT = `
  id,
  created_at,
  order_no,
  buyer_first_name,
  buyer_last_name,
  buyer_email,
  buyer_phone,
  total_amount,
  payment_status,
  payment_method,
  fulfillment_status,
  shipped_at,
  tracking_link_id,
  metadata,
  host_org_id,
  order_type
`;

export interface PartnerProductOrdersTableFetch {
  orderRows: Record<string, unknown>[];
  accessMap: PartnerAccessMap;
  partnerLinkIds: Set<string>;
  partnerLinks: HostPartnerLinkForTable[];
  /** Event add-on lines visible to partner (Catalog → Products → Orders). */
  addonItemRows: AddonItemTableRow[];
  /** Per add-on line access keyed by order_addon_items.id */
  addonItemAccessMap: Map<string, PartnerOrderRowAccess>;
}

export type AddonItemTableRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  subtotal: number;
  label: string | null;
  variant_label: string | null;
  shipped_at: string | null;
  carrier_tracking_number: string | null;
  orders: Record<string, unknown>;
};

export type HostPartnerLinkForTable = {
  id: string;
  affiliate_org_id: string;
  commission_rate: number | null;
  commission_basis: string | null;
  type: string;
  collab_sales_scope: string | null;
  product_id: string | null;
  status: string;
};

/**
 * Product orders visible to an affiliate/collab partner org (Catalog → Products → Orders).
 * Same scope rules as fetchPartnerVisibleOrdersInRange; includes buyer fields for the table.
 */
export async function fetchPartnerVisibleProductOrdersForTable(
  orgId: string,
  opts: { startISO?: string | null; endISO?: string | null; signal?: AbortSignal } = {}
): Promise<PartnerProductOrdersTableFetch> {
  const accessMap: PartnerAccessMap = new Map();
  const partnerLinkIds = new Set<string>();
  const { startISO, endISO, signal } = opts;
  const applyDateFilter = Boolean(startISO && endISO);

  const { data: links, error } = await applyAbortSignal(
    supabase
      .from('tracking_links' as never)
      .select(
        'id, type, host_org_id, event_id, product_id, collab_sales_scope, collab_partner_role, collab_can_view_order_details, collab_can_mark_shipped, status, affiliate_org_id, commission_rate, commission_basis'
      )
      .eq('affiliate_org_id', orgId)
      .in('type', ['affiliate', 'collab'])
      .eq('status', 'active'),
    signal
  );

  if (error) {
    console.error('fetchPartnerVisibleProductOrdersForTable: tracking_links', error);
    return {
      orderRows: [],
      accessMap,
      partnerLinkIds,
      partnerLinks: [],
      addonItemRows: [],
      addonItemAccessMap: new Map(),
    };
  }

  const linkList = (links || []) as PartnerPipelineLinkRow[];
  linkList.forEach((l) => partnerLinkIds.add(l.id));

  const partnerLinks: HostPartnerLinkForTable[] = linkList.map((l) => ({
    id: l.id,
    affiliate_org_id: l.affiliate_org_id ?? orgId,
    commission_rate: l.commission_rate ?? null,
    commission_basis: l.commission_basis ?? null,
    type: l.type,
    collab_sales_scope: l.collab_sales_scope,
    product_id: l.product_id,
    status: l.status ?? 'active',
  }));

  if (linkList.length === 0) {
    return {
      orderRows: [],
      accessMap,
      partnerLinkIds,
      partnerLinks: [],
      addonItemRows: [],
      addonItemAccessMap: new Map(),
    };
  }

  const orderMap = new Map<string, Record<string, unknown>>();
  const addonItemMap = new Map<string, AddonItemTableRow>();
  const addonItemAccessMap = new Map<string, PartnerOrderRowAccess>();

  const applyOrderFilters = (query: ReturnType<typeof supabase.from>) => {
    let q = query
      .eq('order_type', 'product')
      .in('payment_status', ['submitted', 'paid']);
    if (applyDateFilter) {
      q = q.gte('created_at', startISO!).lte('created_at', endISO!);
    }
    return q;
  };

  const attributedLinkIds = linkList.filter(linkIsAttributedOnly).map((l) => l.id);

  if (attributedLinkIds.length > 0) {
    let attrQuery = supabase
      .from('orders')
      .select(PRODUCT_ORDERS_TABLE_SELECT)
      .in('tracking_link_id', attributedLinkIds);

    attrQuery = applyOrderFilters(attrQuery) as typeof attrQuery;

    const { data: attrOrders, error: oErr } = await applyAbortSignal(attrQuery, signal);
    if (oErr) {
      console.error('fetchPartnerVisibleProductOrdersForTable: attributed orders', oErr);
    } else {
      for (const row of (attrOrders || []) as Record<string, unknown>[]) {
        const oid = row.id as string;
        const tid = row.tracking_link_id as string | null;
        if (!tid) continue;
        const link = linkList.find((l) => l.id === tid);
        if (!link) continue;
        orderMap.set(oid, row);
        mergeAccess(accessMap, oid, link);
      }
    }
  }

  const allForResourceProductLinks = linkList.filter(
    (l) => l.type === 'collab' && l.collab_sales_scope === 'all_for_resource' && l.product_id
  );

  await Promise.all(
    Array.from(groupLinksByHost(allForResourceProductLinks).entries()).map(
      async ([hostOrgId, hostLinks]) => {
        let prodQuery = supabase
          .from('orders')
          .select(PRODUCT_ORDERS_TABLE_SELECT)
          .eq('host_org_id', hostOrgId)
          .order('created_at', { ascending: false })
          .limit(DEFAULT_LIST_LIMIT);

        prodQuery = applyOrderFilters(prodQuery) as typeof prodQuery;

        const { data: prodOrders, error: pErr } = await applyAbortSignal(prodQuery, signal);
        if (pErr) {
          console.error('fetchPartnerVisibleProductOrdersForTable: product orders', pErr);
          throw pErr;
        }

        const prodOrderRows = (prodOrders || []) as Record<string, unknown>[];
        const prodOrderIds = prodOrderRows.map((row) => row.id as string);
        const productIdsByOrder = await fetchOrderProductIdsMap(prodOrderIds, signal);

        for (const link of hostLinks) {
          const pid = link.product_id!;
          for (const row of prodOrderRows) {
            const oid = row.id as string;
            if (!orderHasProduct(productIdsByOrder, oid, pid)) continue;
            orderMap.set(oid, row);
            mergeAccess(accessMap, oid, link);
          }
        }
      }
    )
  );

  const productLinksWithId = linkList.filter((l) => l.product_id);
  if (productLinksWithId.length > 0) {
    const applyEventOrderFilters = (query: ReturnType<typeof supabase.from>) => {
      let q = query.eq('order_type', 'event').in('payment_status', ['submitted', 'paid']);
      if (applyDateFilter) {
        q = q.gte('created_at', startISO!).lte('created_at', endISO!);
      }
      return q;
    };

    const attributedProductLinks = productLinksWithId.filter(linkIsAttributedOnly);

    await Promise.all(
      attributedProductLinks.map(async (link) => {
        const pid = link.product_id!;

        let attrQuery = supabase
          .from('orders')
          .select(
            'id, created_at, order_no, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, total_amount, payment_status, payment_method, fulfillment_status, tracking_link_id, event_id, metadata'
          )
          .eq('tracking_link_id', link.id);

        attrQuery = applyEventOrderFilters(attrQuery) as typeof attrQuery;

        const { data: attrEventOrders, error: aeErr } = await applyAbortSignal(attrQuery, signal);
        if (aeErr) {
          console.error('fetchPartnerVisibleProductOrdersForTable: attributed event orders', aeErr);
          throw aeErr;
        }

        const attrEventOrderRows = (attrEventOrders || []) as Record<string, unknown>[];
        const attrEventOrderIds = attrEventOrderRows.map((row) => row.id as string);
        const addonLinesByOrder = await fetchAddonLinesByOrderIds(attrEventOrderIds, pid, signal);

        for (const row of attrEventOrderRows) {
          const oid = row.id as string;
          const addonLines = addonLinesByOrder.get(oid) ?? [];

          for (const line of addonLines) {
            const lineId = line.id;
            addonItemMap.set(lineId, {
              id: lineId,
              order_id: oid,
              product_id: pid,
              quantity: line.quantity,
              subtotal: Number(line.subtotal) || 0,
              label: line.label,
              variant_label: line.variant_label,
              shipped_at: line.shipped_at,
              carrier_tracking_number: line.carrier_tracking_number,
              orders: row,
            });
            mergeAddonAccess(addonItemAccessMap, lineId, link);
          }
        }
      })
    );

    const allForResourceAddonLinks = productLinksWithId.filter(
      (l) => l.type === 'collab' && l.collab_sales_scope === 'all_for_resource'
    );

    await Promise.all(
      Array.from(groupLinksByHost(allForResourceAddonLinks).entries()).map(
        async ([hostOrgId, hostLinks]) => {
          let evOrdersQuery = supabase
            .from('orders')
            .select(
              'id, created_at, order_no, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, total_amount, payment_status, payment_method, fulfillment_status, tracking_link_id, event_id, metadata, host_org_id'
            )
            .eq('host_org_id', hostOrgId)
            .order('created_at', { ascending: false })
            .limit(DEFAULT_LIST_LIMIT);

          evOrdersQuery = applyEventOrderFilters(evOrdersQuery) as typeof evOrdersQuery;

          const { data: evOrders, error: evErr } = await applyAbortSignal(evOrdersQuery, signal);
          if (evErr) {
            console.error('fetchPartnerVisibleProductOrdersForTable: event orders for addon', evErr);
            throw evErr;
          }

          const evOrderRows = (evOrders || []) as Record<string, unknown>[];
          const evOrderIds = evOrderRows.map((row) => row.id as string);
          const productIds = [
            ...new Set(hostLinks.map((l) => l.product_id).filter(Boolean)),
          ] as string[];
          const addonLinesByOrder = await fetchAddonLinesByOrderIdsAndProducts(
            evOrderIds,
            productIds,
            signal
          );

          for (const link of hostLinks) {
            const pid = link.product_id!;
            for (const row of evOrderRows) {
              const oid = row.id as string;
              const addonLines = (addonLinesByOrder.get(oid) ?? []).filter(
                (line) => line.product_id === pid
              );

              for (const line of addonLines) {
                const lineId = line.id;
                addonItemMap.set(lineId, {
                  id: lineId,
                  order_id: oid,
                  product_id: pid,
                  quantity: line.quantity,
                  subtotal: Number(line.subtotal) || 0,
                  label: line.label,
                  variant_label: line.variant_label,
                  shipped_at: line.shipped_at,
                  carrier_tracking_number: line.carrier_tracking_number,
                  orders: row,
                });
                mergeAddonAccess(addonItemAccessMap, lineId, link);
              }
            }
          }
        }
      )
    );
  }

  return {
    orderRows: Array.from(orderMap.values()),
    accessMap,
    partnerLinkIds,
    partnerLinks,
    addonItemRows: Array.from(addonItemMap.values()),
    addonItemAccessMap,
  };
}

export async function collabPartnerCanViewOrderDetails(orderId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('collab_can_access_order' as never, {
    p_order_id: orderId,
    p_min_role: 'viewer',
    p_require_details: true,
  } as never);
  if (error) {
    console.error('collabPartnerCanViewOrderDetails', error);
    return false;
  }
  return data === true;
}

export async function collabPartnerCanMarkOrderShipped(orderId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('collab_can_mark_order_shipped' as never, {
    p_order_id: orderId,
  } as never);
  if (error) {
    console.error('collabPartnerCanMarkOrderShipped', error);
    return false;
  }
  return data === true;
}

export async function collabPartnerCanMarkAddonItemShipped(addonItemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('collab_can_mark_addon_item_shipped' as never, {
    p_addon_item_id: addonItemId,
  } as never);
  if (error) {
    console.error('collabPartnerCanMarkAddonItemShipped', error);
    return false;
  }
  return data === true;
}
