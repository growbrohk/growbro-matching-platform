import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getEvent } from '@/lib/api/events';
import { getProduct } from '@/lib/api/products';

export interface PipelineRow {
  tracking_link_id: string;
  label: string;
  slug: string;
  type: 'tracking' | 'affiliate';
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
  commission_rate: number | null;
  status: 'active' | 'inactive' | 'pending';
}

/**
 * Hook to fetch pipeline rows for the host org
 * Filters by host_org_id = currentOrg.id and status = 'active'
 * Includes event and product titles for grouping
 */
export function usePipelineRows() {
  const { currentOrg } = useAuth();

  return useQuery({
    queryKey: ['pipeline-rows', currentOrg?.id],
    queryFn: async (): Promise<PipelineRow[]> => {
      if (!currentOrg) {
        return [];
      }

      // Fetch tracking links where current org is the host
      const { data: links, error: linksError } = await (supabase.from('tracking_links' as any) as any)
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
        .eq('host_org_id', currentOrg.id)
        .eq('status', 'active')
        .in('type', ['tracking', 'affiliate']);

      if (linksError) {
        console.error('Error fetching pipeline rows:', linksError);
        throw linksError;
      }

      if (!links || links.length === 0) {
        return [];
      }

      // Collect unique event_ids and product_ids
      const eventIds = new Set<string>();
      const productIds = new Set<string>();
      const affiliateOrgIds = new Set<string>();

      links.forEach((link: any) => {
        if (link.event_id) eventIds.add(link.event_id);
        if (link.product_id) productIds.add(link.product_id);
        if (link.affiliate_org_id) affiliateOrgIds.add(link.affiliate_org_id);
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

      // Get orders and revenue
      const { data: ordersData } = await (supabase.from('orders' as any) as any)
        .select('tracking_link_id, total_amount')
        .in('tracking_link_id', linkIds)
        .eq('payment_status', 'paid');

      const ordersMap = new Map<string, number>();
      const revenueMap = new Map<string, number>();
      (ordersData || []).forEach((order: any) => {
        const linkId = order.tracking_link_id;
        ordersMap.set(linkId, (ordersMap.get(linkId) || 0) + 1);
        revenueMap.set(linkId, (revenueMap.get(linkId) || 0) + (order.total_amount || 0));
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
        commission_rate: link.commission_rate,
        status: link.status,
      }));

      return pipelineRows;
    },
    enabled: !!currentOrg,
  });
}
