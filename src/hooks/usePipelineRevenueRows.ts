import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getEvent } from '@/lib/api/events';
import { getProduct } from '@/lib/api/products';
import { fetchRangedPipelineOrderAggregates } from '@/lib/pipelineRangedOrders';
import type { RangeKey } from '@/hooks/useOrdersDashboard';
import { PipelineRow } from './usePipelineRows';

export interface UsePipelineRevenueRowsOptions {
  mode: 'host' | 'collab';
  orgId: string;
  rangeKey: RangeKey;
  status?: 'active' | 'payment_pending' | 'paid' | 'inactive';
}

/**
 * Hook to fetch pipeline rows with revenue > 0
 * Filters by host_org_id or affiliate_org_id based on mode
 * Filters by revenue > 0 (role-specific: host_revenue or affiliate_revenue)
 * Filters by status if provided
 * Includes event and product titles
 */
export function usePipelineRevenueRows({ mode, orgId, rangeKey, status }: UsePipelineRevenueRowsOptions) {
  return useQuery({
    queryKey: ['pipeline-revenue-rows', orgId, mode, rangeKey, status],
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
          host_org_id
        `)
        .in('type', ['tracking', 'affiliate']);

      // Apply filter based on mode
      if (mode === 'host') {
        query = query.eq('host_org_id', orgId);
      } else {
        query = query.eq('affiliate_org_id', orgId);
      }

      // Apply status filter if provided
      if (status) {
        query = query.eq('status', status);
      }

      const { data: links, error: linksError } = await query;

      if (linksError) {
        console.error(`Error fetching pipeline revenue rows (${mode}):`, linksError);
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

      // Fetch event titles
      const eventTitleMap = new Map<string, string>();
      await Promise.all(
        Array.from(eventIds).map(async (eventId) => {
          try {
            const event = await getEvent(eventId);
            if (event) {
              eventTitleMap.set(eventId, event.title);
            }
          } catch (err) {
            console.error(`Error fetching event ${eventId}:`, err);
          }
        })
      );

      // Fetch product titles
      const productTitleMap = new Map<string, string>();
      await Promise.all(
        Array.from(productIds).map(async (productId) => {
          try {
            const product = await getProduct(productId);
            if (product) {
              productTitleMap.set(productId, product.title);
            }
          } catch (err) {
            console.error(`Error fetching product ${productId}:`, err);
          }
        })
      );

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
      
      // Get clicks count
      const { data: clicksData } = await (supabase.from('tracking_clicks' as any) as any)
        .select('tracking_link_id')
        .in('tracking_link_id', linkIds);

      const clicksMap = new Map<string, number>();
      (clicksData || []).forEach((click: any) => {
        clicksMap.set(click.tracking_link_id, (clicksMap.get(click.tracking_link_id) || 0) + 1);
      });

      const aggregates = await fetchRangedPipelineOrderAggregates(linkIds, rangeKey);

      const ordersMap = new Map<string, number>();
      const revenueMap = new Map<string, number>();
      links.forEach((link: any) => {
        const agg = aggregates.get(link.id) || { ordersCount: 0, grossRevenue: 0 };
        const rate = link.commission_rate != null ? Number(link.commission_rate) : 0;
        const hostRevenue = agg.grossRevenue * (1 - rate);
        const affiliateRevenue = agg.grossRevenue * rate;
        ordersMap.set(link.id, agg.ordersCount);
        revenueMap.set(
          link.id,
          mode === 'host' ? hostRevenue : affiliateRevenue
        );
      });

      // Build pipeline rows and filter by revenue > 0
      const pipelineRows: PipelineRow[] = links
        .map((link: any) => ({
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
        }))
        .filter((row: PipelineRow) => row.revenue > 0) // Only show rows with revenue > 0
        .sort((a: PipelineRow, b: PipelineRow) => b.revenue - a.revenue); // Sort by revenue desc

      return pipelineRows;
    },
    enabled: !!orgId,
  });
}
