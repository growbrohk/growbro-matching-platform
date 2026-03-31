import { supabase } from '@/integrations/supabase/client';
import { getDateRange, type RangeKey } from '@/hooks/useOrdersDashboard';

const LINK_ID_CHUNK = 80;
const PAGE_SIZE = 1000;

export type PipelineOrderAggregate = { ordersCount: number; grossRevenue: number };

/**
 * Paid pipeline orders in the same window as the dashboard, matching pipeline_order_metrics eligibility:
 * payment_status = 'paid', tracking_link set, not refunded.
 */
export async function fetchRangedPipelineOrderAggregates(
  linkIds: string[],
  rangeKey: RangeKey
): Promise<Map<string, PipelineOrderAggregate>> {
  const result = new Map<string, PipelineOrderAggregate>();
  if (linkIds.length === 0) return result;

  const { start, end } = getDateRange(rangeKey);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  for (let i = 0; i < linkIds.length; i += LINK_ID_CHUNK) {
    const chunk = linkIds.slice(i, i + LINK_ID_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('orders')
        .select('tracking_link_id, total_amount')
        .in('tracking_link_id', chunk)
        .eq('payment_status', 'paid')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .or('status.is.null,status.neq.refunded')
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const rows = data || [];
      for (const row of rows) {
        const id = row.tracking_link_id as string | null;
        if (!id) continue;
        const amt = Number(row.total_amount) || 0;
        const cur = result.get(id) || { ordersCount: 0, grossRevenue: 0 };
        cur.ordersCount += 1;
        cur.grossRevenue += amt;
        result.set(id, cur);
      }

      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return result;
}
