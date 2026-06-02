import { supabase } from '@/integrations/supabase/client';

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
        .lte('created_at', endISO);
      if (pErr) {
        console.error('fetchPartnerVisibleOrdersInRange: product orders', pErr);
        continue;
      }
      const pid = link.product_id;
      for (const row of (prodOrders || []) as Record<string, unknown>[]) {
        const oid = row.id as string;
        const { data: line } = await supabase
          .from('order_items')
          .select('metadata')
          .eq('order_id', oid)
          .limit(8);
        const hasProduct = (line || []).some(
          (it: { metadata?: { product_id?: string } }) => (it.metadata?.product_id as string | undefined) === pid
        );
        if (!hasProduct) continue;
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
  opts: { startISO?: string | null; endISO?: string | null } = {}
): Promise<PartnerProductOrdersTableFetch> {
  const accessMap: PartnerAccessMap = new Map();
  const partnerLinkIds = new Set<string>();
  const { startISO, endISO } = opts;
  const applyDateFilter = Boolean(startISO && endISO);

  const { data: links, error } = await supabase
    .from('tracking_links' as never)
    .select(
      'id, type, host_org_id, event_id, product_id, collab_sales_scope, collab_partner_role, collab_can_view_order_details, collab_can_mark_shipped, status, affiliate_org_id, commission_rate, commission_basis'
    )
    .eq('affiliate_org_id', orgId)
    .in('type', ['affiliate', 'collab'])
    .eq('status', 'active');

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

    const { data: attrOrders, error: oErr } = await attrQuery;
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

  for (const link of linkList.filter(
    (l) => l.type === 'collab' && l.collab_sales_scope === 'all_for_resource' && l.product_id
  )) {
    let prodQuery = supabase
      .from('orders')
      .select(PRODUCT_ORDERS_TABLE_SELECT)
      .eq('host_org_id', link.host_org_id);

    prodQuery = applyOrderFilters(prodQuery) as typeof prodQuery;

    const { data: prodOrders, error: pErr } = await prodQuery;
    if (pErr) {
      console.error('fetchPartnerVisibleProductOrdersForTable: product orders', pErr);
      continue;
    }

    const pid = link.product_id!;
    for (const row of (prodOrders || []) as Record<string, unknown>[]) {
      const oid = row.id as string;
      const { data: line } = await supabase
        .from('order_items')
        .select('metadata')
        .eq('order_id', oid)
        .limit(8);
      const hasProduct = (line || []).some(
        (it: { metadata?: { product_id?: string } }) =>
          (it.metadata?.product_id as string | undefined) === pid
      );
      if (!hasProduct) continue;
      orderMap.set(oid, row);
      mergeAccess(accessMap, oid, link);
    }
  }

  const productLinksWithId = linkList.filter((l) => l.product_id);
  if (productLinksWithId.length > 0) {
    const applyEventOrderFilters = (query: ReturnType<typeof supabase.from>) => {
      let q = query.eq('order_type', 'event').in('payment_status', ['submitted', 'paid']);
      if (applyDateFilter) {
        q = q.gte('created_at', startISO!).lte('created_at', endISO!);
      }
      return q;
    };

    for (const link of productLinksWithId) {
      const pid = link.product_id!;

      if (linkIsAttributedOnly(link)) {
        let attrQuery = supabase
          .from('orders')
          .select(
            'id, created_at, order_no, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, total_amount, payment_status, payment_method, fulfillment_status, tracking_link_id, event_id, metadata'
          )
          .eq('tracking_link_id', link.id);

        attrQuery = applyEventOrderFilters(attrQuery) as typeof attrQuery;

        const { data: attrEventOrders, error: aeErr } = await attrQuery;
        if (aeErr) {
          console.error('fetchPartnerVisibleProductOrdersForTable: attributed event orders', aeErr);
          continue;
        }

        for (const row of (attrEventOrders || []) as Record<string, unknown>[]) {
          const oid = row.id as string;
          const { data: addonLines } = await supabase
            .from('order_addon_items')
            .select(
              'id, order_id, product_id, quantity, subtotal, label, variant_label, shipped_at, carrier_tracking_number'
            )
            .eq('order_id', oid)
            .eq('product_id', pid);

          for (const line of (addonLines || []) as Record<string, unknown>[]) {
            const lineId = line.id as string;
            addonItemMap.set(lineId, {
              id: lineId,
              order_id: oid,
              product_id: pid,
              quantity: line.quantity as number,
              subtotal: Number(line.subtotal) || 0,
              label: (line.label as string | null) ?? null,
              variant_label: (line.variant_label as string | null) ?? null,
              shipped_at: (line.shipped_at as string | null) ?? null,
              carrier_tracking_number: (line.carrier_tracking_number as string | null) ?? null,
              orders: row,
            });
            mergeAddonAccess(addonItemAccessMap, lineId, link);
          }
        }
      }

      if (link.type === 'collab' && link.collab_sales_scope === 'all_for_resource') {
        let evOrdersQuery = supabase
          .from('orders')
          .select(
            'id, created_at, order_no, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, total_amount, payment_status, payment_method, fulfillment_status, tracking_link_id, event_id, metadata, host_org_id'
          )
          .eq('host_org_id', link.host_org_id);

        evOrdersQuery = applyEventOrderFilters(evOrdersQuery) as typeof evOrdersQuery;

        const { data: evOrders, error: evErr } = await evOrdersQuery;
        if (evErr) {
          console.error('fetchPartnerVisibleProductOrdersForTable: event orders for addon', evErr);
          continue;
        }

        for (const row of (evOrders || []) as Record<string, unknown>[]) {
          const oid = row.id as string;
          const { data: addonLines } = await supabase
            .from('order_addon_items')
            .select(
              'id, order_id, product_id, quantity, subtotal, label, variant_label, shipped_at, carrier_tracking_number'
            )
            .eq('order_id', oid)
            .eq('product_id', pid);

          for (const line of (addonLines || []) as Record<string, unknown>[]) {
            const lineId = line.id as string;
            addonItemMap.set(lineId, {
              id: lineId,
              order_id: oid,
              product_id: pid,
              quantity: line.quantity as number,
              subtotal: Number(line.subtotal) || 0,
              label: (line.label as string | null) ?? null,
              variant_label: (line.variant_label as string | null) ?? null,
              shipped_at: (line.shipped_at as string | null) ?? null,
              carrier_tracking_number: (line.carrier_tracking_number as string | null) ?? null,
              orders: row,
            });
            mergeAddonAccess(addonItemAccessMap, lineId, link);
          }
        }
      }
    }
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
