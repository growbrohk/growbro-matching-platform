import { supabase } from '@/integrations/supabase/client';

export interface PartnerOrderRowAccess {
  isPartnerRow: true;
  canViewOrderDetails: boolean;
  canConfirmOrder: boolean;
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
}

function emptyAccess(): PartnerOrderRowAccess {
  return { isPartnerRow: true, canViewOrderDetails: false, canConfirmOrder: false };
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
  }
  map.set(orderId, cur);
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
  host_org_id
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
      'id, type, host_org_id, event_id, product_id, collab_sales_scope, collab_partner_role, collab_can_view_order_details, status'
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
