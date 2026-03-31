import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getEvent } from '@/lib/api/events';
import { getProduct } from '@/lib/api/products';
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

