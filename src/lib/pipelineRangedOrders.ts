import { supabase } from '@/integrations/supabase/client';
import { getDateRange, type RangeKey } from '@/hooks/useOrdersDashboard';
import { orderCommissionableAmount } from '@/lib/orderCommission';

const LINK_ID_CHUNK = 80;
const PAGE_SIZE = 1000;

export type PipelineOrderAggregate = {
  ordersCount: number;
  grossRevenue: number;
  commissionableRevenue: number;
};

function emptyAggregate(): PipelineOrderAggregate {
  return { ordersCount: 0, grossRevenue: 0, commissionableRevenue: 0 };
}

/**
 * Paid pipeline orders in the same window as the dashboard.
 * commissionableRevenue uses per-link commission_basis (profit deducts unit cost, shipping & payment fee).
 */
export async function fetchRangedPipelineOrderAggregates(
  linkIds: string[],
  rangeKey: RangeKey,
  linkBasisMap?: Map<string, 'revenue' | 'profit'>
): Promise<Map<string, PipelineOrderAggregate>> {
  const result = new Map<string, PipelineOrderAggregate>();
  if (linkIds.length === 0) return result;

  linkIds.forEach((id) => result.set(id, emptyAggregate()));

  const { start, end } = getDateRange(rangeKey);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  for (let i = 0; i < linkIds.length; i += LINK_ID_CHUNK) {
    const chunk = linkIds.slice(i, i + LINK_ID_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('orders')
        .select('id, tracking_link_id, total_amount, metadata, payment_method')
        .in('tracking_link_id', chunk)
        .eq('payment_status', 'paid')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .or('status.is.null,status.neq.refunded')
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const rows = data || [];
      if (rows.length === 0) break;

      const orderIds = rows.map((r) => r.id as string);
      const itemsByOrder = new Map<string, Array<{ quantity: number; metadata: unknown }>>();

      for (let j = 0; j < orderIds.length; j += LINK_ID_CHUNK) {
        const idChunk = orderIds.slice(j, j + LINK_ID_CHUNK);
        const { data: items, error: itemsErr } = await supabase
          .from('order_items')
          .select('order_id, quantity, metadata')
          .in('order_id', idChunk);
        if (itemsErr) throw itemsErr;
        (items || []).forEach((item) => {
          const oid = item.order_id as string;
          if (!itemsByOrder.has(oid)) itemsByOrder.set(oid, []);
          itemsByOrder.get(oid)!.push({
            quantity: Number(item.quantity) || 0,
            metadata: item.metadata,
          });
        });
      }

      const productIds = new Set<string>();
      itemsByOrder.forEach((items) => {
        items.forEach((it) => {
          const meta = it.metadata as Record<string, unknown> | null;
          const pid = meta?.product_id as string | undefined;
          if (pid) productIds.add(pid);
        });
      });

      const productCostMap = new Map<string, number>();
      if (productIds.size > 0) {
        const { data: products, error: prodErr } = await supabase
          .from('products')
          .select('id, cost')
          .in('id', Array.from(productIds));
        if (prodErr) throw prodErr;
        (products || []).forEach((p) => {
          if (p.cost != null) productCostMap.set(p.id, Number(p.cost));
        });
      }

      for (const row of rows) {
        const linkId = row.tracking_link_id as string | null;
        if (!linkId) continue;
        const basis = linkBasisMap?.get(linkId) === 'profit' ? 'profit' : 'revenue';
        const total = Number(row.total_amount) || 0;
        const items = itemsByOrder.get(row.id as string) || [];
        const commissionable = orderCommissionableAmount(
          total,
          row.metadata,
          items,
          productCostMap,
          basis,
          row.payment_method as string | null
        );

        const cur = result.get(linkId) || emptyAggregate();
        cur.ordersCount += 1;
        cur.grossRevenue += total;
        cur.commissionableRevenue += commissionable;
        result.set(linkId, cur);
      }

      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return result;
}
