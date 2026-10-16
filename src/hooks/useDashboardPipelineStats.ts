import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchRangedPipelineOrderAggregates } from '@/lib/pipelineRangedOrders';
import type { RangeKey } from '@/hooks/useOrdersDashboard';
import { mergeMoneyTotals, primaryMoneyAmount, scaleMoneyTotals } from '@/lib/currency';

export interface DashboardPipelineStats {
  channelsCount: number;
  collabCount: number;
  pipelineRevenueTotal: number;
  pipelineRevenueByCurrency: Record<string, number>;
}

type TrackingLinkRow = {
  id: string;
  type: string;
  commission_rate: number | null;
  commission_basis: string | null;
  host_org_id: string | null;
  affiliate_org_id: string | null;
};

function addShare(
  into: Record<string, number>,
  links: TrackingLinkRow[],
  aggregates: Map<string, { commissionableByCurrency?: Record<string, number> }>,
  kind: 'host' | 'affiliate',
): void {
  for (const link of links) {
    const agg = aggregates.get(link.id);
    if (!agg?.commissionableByCurrency) continue;
    const rate = link.commission_rate != null ? Number(link.commission_rate) : 0;
    const factor = kind === 'host' ? 1 - rate : rate;
    mergeMoneyTotals(into, scaleMoneyTotals(agg.commissionableByCurrency, factor));
  }
}

/**
 * Lightweight pipeline stats for dashboard cards: counts + revenue total only.
 */
export function useDashboardPipelineStats(
  orgId: string,
  rangeKey: RangeKey,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled !== false && !!orgId;

  return useQuery({
    queryKey: ['dashboard-pipeline-stats', orgId, rangeKey],
    queryFn: async (): Promise<DashboardPipelineStats> => {
      if (!orgId) {
        return { channelsCount: 0, collabCount: 0, pipelineRevenueTotal: 0, pipelineRevenueByCurrency: {} };
      }

      const [hostRes, collabRes] = await Promise.all([
        (supabase.from('tracking_links' as any) as any)
          .select('id, type, commission_rate, commission_basis, host_org_id, affiliate_org_id')
          .eq('host_org_id', orgId)
          .eq('status', 'active')
          .in('type', ['tracking', 'affiliate', 'collab']),
        (supabase.from('tracking_links' as any) as any)
          .select('id, type, commission_rate, commission_basis, host_org_id, affiliate_org_id')
          .eq('affiliate_org_id', orgId)
          .eq('status', 'active'),
      ]);

      if (hostRes.error) throw hostRes.error;
      if (collabRes.error) throw collabRes.error;

      const hostLinks = (hostRes.data || []) as TrackingLinkRow[];
      const collabLinks = (collabRes.data || []) as TrackingLinkRow[];

      const channelsCount = hostLinks.length;
      const collabCount = collabLinks.length;

      const hostLinkIds = hostLinks.map((l) => l.id);
      const collabLinkIds = collabLinks.map((l) => l.id);

      const hostBasisMap = new Map<string, 'revenue' | 'profit'>();
      hostLinks.forEach((link) => {
        hostBasisMap.set(
          link.id,
          link.commission_basis === 'profit' ? 'profit' : 'revenue'
        );
      });

      const collabBasisMap = new Map<string, 'revenue' | 'profit'>();
      collabLinks.forEach((link) => {
        collabBasisMap.set(
          link.id,
          link.commission_basis === 'profit' ? 'profit' : 'revenue'
        );
      });

      const [hostAggregates, collabAggregates] = await Promise.all([
        fetchRangedPipelineOrderAggregates(hostLinkIds, rangeKey, hostBasisMap),
        fetchRangedPipelineOrderAggregates(collabLinkIds, rangeKey, collabBasisMap),
      ]);

      const pipelineRevenueByCurrency: Record<string, number> = {};
      addShare(pipelineRevenueByCurrency, hostLinks, hostAggregates, 'host');
      addShare(pipelineRevenueByCurrency, collabLinks, collabAggregates, 'affiliate');
      const pipelineRevenueTotal = primaryMoneyAmount(pipelineRevenueByCurrency);

      return { channelsCount, collabCount, pipelineRevenueTotal, pipelineRevenueByCurrency };
    },
    enabled,
  });
}
