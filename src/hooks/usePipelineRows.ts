import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchEventTitleMap,
  fetchProductTitleMap,
  fetchTrackingLinkClickCounts,
} from '@/lib/api/pipeline-fetch-helpers';
import { fetchRangedPipelineOrderAggregates } from '@/lib/pipelineRangedOrders';
import type { RangeKey } from '@/hooks/useOrdersDashboard';

export interface PipelineRow {
  tracking_link_id: string;
  label: string;
  slug: string;
  type: 'tracking' | 'affiliate' | 'collab';
  clicks: number;
  orders: number;
  revenue: number;
  destination_url: string;
  destination_type: 'event' | 'product' | 'custom';
  event_id: string | null;
  product_id: string | null;
  event_title: string | null;
  product_title: string | null;
  affiliate_org_id: string | null;
  affiliate_org_name: string | null;
  host_org_id: string | null;
  host_org_name: string | null;
  commission_rate: number | null;
  status: 'active' | 'inactive' | 'pending' | 'payment_pending' | 'paid';
}

export interface UsePipelineRowsOptions {
  mode: 'host' | 'collab';
  orgId: string;
  rangeKey: RangeKey;
}

/**
 * Hook to fetch pipeline rows
 * Filters by host_org_id or affiliate_org_id based on mode
 * Includes event and product titles for grouping
 */
export function usePipelineRows({ mode, orgId, rangeKey }: UsePipelineRowsOptions) {
  return useQuery({
    queryKey: ['pipeline-rows', orgId, mode, rangeKey],
    queryFn: async (): Promise<PipelineRow[]> => {
      if (!orgId) {
        return [];
      }

      // Build query based on mode
      let query = (supabase.from('tracking_links' as any) as any)
        .select(`
          id,
          label,
          slug,
          type,
          status,
          destination_url,
          destination_type,
          event_id,
          product_id,
          affiliate_org_id,
          commission_rate,
          commission_basis,
          host_org_id
        `)
        .eq('status', 'active')
        .in('type', ['tracking', 'affiliate', 'collab']);

      // Apply filter based on mode
      if (mode === 'host') {
        query = query.eq('host_org_id', orgId);
      } else {
        query = query.eq('affiliate_org_id', orgId);
      }

      const { data: links, error: linksError } = await query;

      if (linksError) {
        console.error(`Error fetching pipeline rows (${mode}):`, linksError);
        throw linksError;
      }

      if (!links || links.length === 0) {
        return [];
      }

      // Collect unique event_ids, product_ids, and org IDs
      const eventIds = new Set<string>();
      const productIds = new Set<string>();
      const affiliateOrgIds = new Set<string>();
      const hostOrgIds = new Set<string>();

      links.forEach((link: any) => {
        if (link.event_id) eventIds.add(link.event_id);
        if (link.product_id) productIds.add(link.product_id);
        if (link.affiliate_org_id) affiliateOrgIds.add(link.affiliate_org_id);
        if (link.host_org_id) hostOrgIds.add(link.host_org_id);
      });

      const [eventTitleMap, productTitleMap] = await Promise.all([
        fetchEventTitleMap(Array.from(eventIds)),
        fetchProductTitleMap(Array.from(productIds)),
      ]);

      // Fetch affiliate org names
      const affiliateOrgNameMap = new Map<string, string>();
      if (affiliateOrgIds.size > 0) {
        const { data: orgs, error: orgsError } = await (supabase.from('orgs' as any) as any)
          .select('id, name')
          .in('id', Array.from(affiliateOrgIds));

        if (!orgsError && orgs) {
          orgs.forEach((org: any) => {
            affiliateOrgNameMap.set(org.id, org.name);
          });
        }
      }

      // Fetch host org names
      const hostOrgNameMap = new Map<string, string>();
      if (hostOrgIds.size > 0) {
        const { data: orgs, error: orgsError } = await (supabase.from('orgs' as any) as any)
          .select('id, name')
          .in('id', Array.from(hostOrgIds));

        if (!orgsError && orgs) {
          orgs.forEach((org: any) => {
            hostOrgNameMap.set(org.id, org.name);
          });
        }
      }

      // Fetch clicks, orders, and revenue for each link
      const linkIds = links.map((link: any) => link.id);
      
      const clicksMap = await fetchTrackingLinkClickCounts(linkIds);

      const linkBasisMap = new Map<string, 'revenue' | 'profit'>();
      links.forEach((link: { id: string; commission_basis?: string | null }) => {
        linkBasisMap.set(
          link.id,
          link.commission_basis === 'profit' ? 'profit' : 'revenue'
        );
      });

      const aggregates = await fetchRangedPipelineOrderAggregates(linkIds, rangeKey, linkBasisMap);

      const ordersMap = new Map<string, number>();
      const revenueMap = new Map<string, number>();
      links.forEach((link: any) => {
        const agg = aggregates.get(link.id) || {
          ordersCount: 0,
          grossRevenue: 0,
          commissionableRevenue: 0,
        };
        const rate = link.commission_rate != null ? Number(link.commission_rate) : 0;
        const base = agg.commissionableRevenue;
        const hostRevenue = base * (1 - rate);
        const affiliateRevenue = base * rate;
        ordersMap.set(link.id, agg.ordersCount);
        revenueMap.set(
          link.id,
          mode === 'host' ? hostRevenue : affiliateRevenue
        );
      });

      // Build pipeline rows
      const pipelineRows: PipelineRow[] = links.map((link: any) => ({
        tracking_link_id: link.id,
        label: link.label || link.slug,
        slug: link.slug,
        type: link.type,
        clicks: clicksMap.get(link.id) || 0,
        orders: ordersMap.get(link.id) || 0,
        revenue: revenueMap.get(link.id) || 0,
        destination_url: link.destination_url,
        destination_type: link.destination_type,
        event_id: link.event_id,
        product_id: link.product_id,
        event_title: link.event_id ? eventTitleMap.get(link.event_id) || null : null,
        product_title: link.product_id ? productTitleMap.get(link.product_id) || null : null,
        affiliate_org_id: link.affiliate_org_id,
        affiliate_org_name: link.affiliate_org_id ? affiliateOrgNameMap.get(link.affiliate_org_id) || null : null,
        host_org_id: link.host_org_id,
        host_org_name: link.host_org_id ? hostOrgNameMap.get(link.host_org_id) || null : null,
        commission_rate: link.commission_rate,
        status: link.status,
      }));

      return pipelineRows;
    },
    enabled: !!orgId,
  });
}

