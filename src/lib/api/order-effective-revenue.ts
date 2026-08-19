import { supabase } from '@/integrations/supabase/client';

export type OrderEffectiveRevenueRow = {
  order_id: string;
  effective_amount: number;
  active_tickets_count: number | null;
};

export async function fetchOrderEffectiveRevenueMap(
  orderIds: string[],
): Promise<Map<string, OrderEffectiveRevenueRow>> {
  const map = new Map<string, OrderEffectiveRevenueRow>();
  if (orderIds.length === 0) return map;

  const { data, error } = await supabase
    .from('order_effective_revenue')
    .select('order_id, effective_amount, active_tickets_count')
    .in('order_id', orderIds);

  if (error) {
    console.error('fetchOrderEffectiveRevenueMap:', error);
    throw error;
  }

  for (const row of data || []) {
    map.set(row.order_id as string, {
      order_id: row.order_id as string,
      effective_amount: Number(row.effective_amount) || 0,
      active_tickets_count:
        row.active_tickets_count == null ? null : Number(row.active_tickets_count),
    });
  }

  return map;
}

export function getEffectiveOrderAmount(
  order: { id: string; total_amount: number; order_type?: string | null; event_id?: string | null },
  effectiveMap: Map<string, OrderEffectiveRevenueRow>,
): number {
  const row = effectiveMap.get(order.id);
  if (row) return row.effective_amount;
  return Number(order.total_amount) || 0;
}

export function isEventOrderCountedAsActive(
  order: { id: string; order_type?: string | null; event_id?: string | null },
  effectiveMap: Map<string, OrderEffectiveRevenueRow>,
): boolean {
  if (order.order_type === 'product' || !order.event_id) return true;
  const row = effectiveMap.get(order.id);
  if (!row) return true;
  return (row.active_tickets_count ?? 0) > 0;
}
