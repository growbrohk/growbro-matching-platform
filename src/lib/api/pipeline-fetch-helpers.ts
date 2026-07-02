import { supabase } from '@/integrations/supabase/client';

/** Batch-fetch event titles for pipeline display. */
export async function fetchEventTitleMap(eventIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (eventIds.length === 0) return map;

  const { data, error } = await supabase
    .from('events')
    .select('id, title')
    .in('id', eventIds);

  if (error) {
    console.error('Error fetching event titles:', error);
    return map;
  }

  (data || []).forEach((row: { id: string; title: string }) => {
    map.set(row.id, row.title);
  });
  return map;
}

/** Batch-fetch product titles for pipeline display. */
export async function fetchProductTitleMap(productIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (productIds.length === 0) return map;

  const { data, error } = await supabase
    .from('products')
    .select('id, title')
    .in('id', productIds);

  if (error) {
    console.error('Error fetching product titles:', error);
    return map;
  }

  (data || []).forEach((row: { id: string; title: string }) => {
    map.set(row.id, row.title);
  });
  return map;
}

/** Aggregate click counts per tracking link (falls back to row scan if RPC unavailable). */
export async function fetchTrackingLinkClickCounts(linkIds: string[]): Promise<Map<string, number>> {
  const clicksMap = new Map<string, number>();
  if (linkIds.length === 0) return clicksMap;

  const { data, error } = await (supabase.rpc as any)('get_tracking_link_click_counts', {
    p_link_ids: linkIds,
  });

  if (!error && data) {
    (data as Array<{ tracking_link_id: string; click_count: number }>).forEach((row) => {
      clicksMap.set(row.tracking_link_id, Number(row.click_count) || 0);
    });
    return clicksMap;
  }

  if (error) {
    console.warn('get_tracking_link_click_counts RPC unavailable, falling back to row scan:', error);
  }

  const { data: clicksData } = await (supabase.from('tracking_clicks' as any) as any)
    .select('tracking_link_id')
    .in('tracking_link_id', linkIds);

  (clicksData || []).forEach((click: { tracking_link_id: string }) => {
    clicksMap.set(click.tracking_link_id, (clicksMap.get(click.tracking_link_id) || 0) + 1);
  });

  return clicksMap;
}
