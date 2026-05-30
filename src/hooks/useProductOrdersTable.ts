import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getDateRange, type RangeKey } from '@/hooks/useOrdersDashboard';
import { fetchPartnerVisibleProductOrdersForTable } from '@/lib/collab-order-access';
import { addonLineCost, orderItemsLineCost, shippingFeeFromMetadata } from '@/lib/orderCommission';
import {
  buildHostProductPartnerLinkIndex,
  buildLinksById,
  computeAddonLinePartnerCommissions,
  computeProductOrderPartnerCommissions,
  filterCommissionLinesForLinkIds,
  type HostPartnerLink,
  type PartnerCommissionLine,
} from '@/lib/productOrderPartnerCommission';

export type { PartnerCommissionLine };

export type ProductOrdersRangeKey = RangeKey | 'all';

export type ProductOrderSource = 'product' | 'event_addon';

export type ProductOrderViewContext = 'host' | 'partner';

export interface ProductOrderTableRow {
  rowId: string;
  orderId: string;
  source: ProductOrderSource;
  viewContext: ProductOrderViewContext;
  /** When false (partner row), buyer PII and cost are hidden in the table. */
  canViewOrderDetails: boolean;
  createdAt: string;
  orderNo: string | null;
  buyerName: string;
  phone: string | null;
  email: string | null;
  productLabel: string;
  eventTitle: string | null;
  quantity: number;
  amount: number;
  /** Unit product cost × qty; null when cost is not set on product(s). */
  cost: number | null;
  /** Order shipping fee from metadata; null when none or not applicable (e.g. add-on line). */
  shipping: number | null;
  paymentStatus: string;
  fulfillmentStatus: string | null;
  shippedAt: string | null;
  displayStatus: string;
  partnerCommissions: PartnerCommissionLine[];
}

function buildBuyerName(first: string | null, last: string | null): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || '—';
}

function deriveDisplayStatus(
  paymentStatus: string,
  shippedAt: string | null,
  fulfillmentStatus: string | null
): string {
  if (shippedAt) return 'Sent';
  if (paymentStatus === 'submitted') return 'Pending';
  if (paymentStatus === 'paid') {
    if (fulfillmentStatus === 'confirmed' || fulfillmentStatus === 'completed') return 'Paid';
    return 'Paid';
  }
  return paymentStatus || '—';
}

function buildProductLabel(
  orderItems: Array<{ quantity: number; metadata?: Record<string, unknown> }>,
  productsMap: Map<string, { title: string }>
): { label: string; quantity: number } {
  if (orderItems.length === 0) {
    return { label: 'Product Order', quantity: 1 };
  }
  const firstItem = orderItems[0];
  const meta = firstItem.metadata || {};
  const productName =
    (meta.product_name as string) ||
    (meta.product_id && productsMap.get(meta.product_id as string)?.title) ||
    'Product Order';
  const label =
    orderItems.length > 1 ? `${productName} +${orderItems.length - 1} more` : productName;
  const quantity = orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  return { label, quantity: quantity || 1 };
}

function formatAddonLabel(label: string | null, variantLabel: string | null): string {
  const base = label || 'Add-on';
  if (variantLabel) return `${variantLabel} — ${base}`;
  return base;
}

function shippingFromOrderMetadata(metadata: unknown): number | null {
  const fee = shippingFeeFromMetadata(metadata);
  return fee > 0 ? fee : null;
}

function maskPartnerPii<T extends string | null>(value: T): T {
  return (value ? '—' : value) as T;
}

const ORDER_SELECT = `
  id,
  created_at,
  order_no,
  buyer_first_name,
  buyer_last_name,
  buyer_email,
  buyer_phone,
  total_amount,
  payment_status,
  fulfillment_status,
  shipped_at,
  tracking_link_id,
  metadata
`;

export function useProductOrdersTable(
  rangeKey: ProductOrdersRangeKey = '30d',
  options?: { enabled?: boolean }
) {
  const { currentOrg } = useAuth();
  const enabled = options?.enabled !== false;

  return useQuery({
    queryKey: ['product-orders-table', currentOrg?.id, rangeKey],
    queryFn: async (): Promise<ProductOrderTableRow[]> => {
      if (!currentOrg) return [];

      const applyDateFilter = rangeKey !== 'all';
      const startISO = applyDateFilter ? getDateRange(rangeKey).start.toISOString() : null;
      const endISO = applyDateFilter ? getDateRange(rangeKey).end.toISOString() : null;

      let productOrdersQuery = supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('order_type', 'product')
        .eq('host_org_id', currentOrg.id)
        .in('payment_status', ['submitted', 'paid']);

      if (applyDateFilter && startISO && endISO) {
        productOrdersQuery = productOrdersQuery
          .gte('created_at', startISO)
          .lte('created_at', endISO);
      }

      const [
        { data: productOrdersData, error: productError },
        { data: hostLinks, error: linksError },
        partnerFetch,
      ] = await Promise.all([
        productOrdersQuery.order('created_at', { ascending: false }),
        supabase
          .from('tracking_links')
          .select(
            'id, affiliate_org_id, commission_rate, commission_basis, type, collab_sales_scope, product_id, status'
          )
          .eq('host_org_id', currentOrg.id)
          .eq('status', 'active')
          .in('type', ['affiliate', 'collab']),
        fetchPartnerVisibleProductOrdersForTable(currentOrg.id, {
          startISO,
          endISO,
        }),
      ]);

      if (productError) throw productError;
      if (linksError) throw linksError;

      const linkList = (hostLinks || []) as HostPartnerLink[];
      const linksById = buildLinksById(linkList);
      const allForResourceByProduct = buildHostProductPartnerLinkIndex(linkList);

      const partnerLinkList = partnerFetch.partnerLinks as HostPartnerLink[];
      const partnerLinksById = buildLinksById(partnerLinkList);
      const partnerAllForResourceByProduct = buildHostProductPartnerLinkIndex(partnerLinkList);
      const ownPartnerLinkIds = partnerFetch.partnerLinkIds;

      const affiliateOrgIds = [
        ...new Set([
          ...linkList.map((l) => l.affiliate_org_id).filter(Boolean),
          ...partnerLinkList.map((l) => l.affiliate_org_id).filter(Boolean),
        ]),
      ] as string[];
      const orgNameMap = new Map<string, string>();
      if (affiliateOrgIds.length > 0) {
        const { data: orgsData } = await supabase
          .from('orgs')
          .select('id, name')
          .in('id', affiliateOrgIds);
        (orgsData || []).forEach((o: { id: string; name: string }) => {
          orgNameMap.set(o.id, o.name);
        });
      }
      orgNameMap.set(currentOrg.id, currentOrg.name);

      const { data: orgEvents } = await supabase
        .from('events')
        .select('id, title')
        .eq('org_id', currentOrg.id);

      const eventIds = (orgEvents || []).map((e: { id: string }) => e.id);
      const eventTitleMap = new Map(
        (orgEvents || []).map((e: { id: string; title: string }) => [e.id, e.title])
      );

      let addonItemsRaw: Array<{
        id: string;
        order_id: string;
        quantity: number;
        subtotal: number;
        label: string | null;
        variant_label: string | null;
        product_id: string | null;
        orders: Record<string, unknown>;
      }> = [];

      if (eventIds.length > 0) {
        let eventOrdersQuery = supabase
          .from('orders')
          .select('id')
          .in('event_id', eventIds)
          .in('payment_status', ['submitted', 'paid']);

        if (applyDateFilter && startISO && endISO) {
          eventOrdersQuery = eventOrdersQuery
            .gte('created_at', startISO)
            .lte('created_at', endISO);
        }

        const { data: eventOrders, error: eventOrdersError } = await eventOrdersQuery;

        if (eventOrdersError) throw eventOrdersError;

        const eventOrderIds = (eventOrders || []).map((o: { id: string }) => o.id);

        if (eventOrderIds.length > 0) {
          const { data: addonData, error: addonError } = await supabase
            .from('order_addon_items')
            .select(
              `
              id,
              order_id,
              quantity,
              subtotal,
              label,
              variant_label,
              product_id,
              orders!inner(
                id,
                created_at,
                order_no,
                buyer_first_name,
                buyer_last_name,
                buyer_email,
                buyer_phone,
                payment_status,
                fulfillment_status,
                shipped_at,
                event_id,
                tracking_link_id,
                metadata
              )
            `
            )
            .in('order_id', eventOrderIds);

          if (addonError) throw addonError;
          addonItemsRaw = (addonData || []) as typeof addonItemsRaw;
        }
      }

      const hostProductOrderIds = (productOrdersData || []).map((o: { id: string }) => o.id);
      const partnerProductOrderIds = partnerFetch.orderRows.map((o) => o.id as string);
      const allProductOrderIds = [
        ...new Set([...hostProductOrderIds, ...partnerProductOrderIds]),
      ];

      const orderItemsMap = new Map<
        string,
        Array<{ quantity: number; metadata?: Record<string, unknown> }>
      >();

      if (allProductOrderIds.length > 0) {
        const { data: orderItemsData } = await supabase
          .from('order_items')
          .select('order_id, quantity, metadata')
          .in('order_id', allProductOrderIds);

        (orderItemsData || []).forEach(
          (item: { order_id: string; quantity: number; metadata?: Record<string, unknown> }) => {
            if (!orderItemsMap.has(item.order_id)) {
              orderItemsMap.set(item.order_id, []);
            }
            orderItemsMap.get(item.order_id)!.push({
              quantity: item.quantity,
              metadata: item.metadata,
            });
          }
        );
      }

      const productIds = new Set<string>();
      orderItemsMap.forEach((items) => {
        items.forEach((item) => {
          const pid = item.metadata?.product_id as string | undefined;
          if (pid) productIds.add(pid);
        });
      });
      addonItemsRaw.forEach((item) => {
        if (item.product_id) productIds.add(item.product_id);
      });
      linkList.forEach((link) => {
        if (link.product_id) productIds.add(link.product_id);
      });
      partnerLinkList.forEach((link) => {
        if (link.product_id) productIds.add(link.product_id);
      });

      const productsMap = new Map<string, { title: string }>();
      const productCostMap = new Map<string, number>();
      if (productIds.size > 0) {
        const { data: productsData } = await supabase
          .from('products')
          .select('id, title, cost')
          .in('id', Array.from(productIds));

        (productsData || []).forEach((p: { id: string; title: string; cost: number | null }) => {
          productsMap.set(p.id, { title: p.title });
          if (p.cost != null) productCostMap.set(p.id, Number(p.cost));
        });
      }

      const hostCommissionContext = {
        linksById,
        allForResourceByProduct,
        productCostMap,
        orgNameMap,
      };

      const partnerCommissionContext = {
        linksById: partnerLinksById,
        allForResourceByProduct: partnerAllForResourceByProduct,
        productCostMap,
        orgNameMap,
      };

      const hostOrderIdSet = new Set(hostProductOrderIds);

      const productRows: ProductOrderTableRow[] = (productOrdersData || []).map(
        (order: Record<string, unknown>) => {
          const id = order.id as string;
          const paymentStatus = (order.payment_status as string) || 'unpaid';
          const fulfillmentStatus = (order.fulfillment_status as string | null) ?? null;
          const shippedAt = (order.shipped_at as string | null) ?? null;
          const orderItems = orderItemsMap.get(id) || [];
          const { label, quantity } = buildProductLabel(orderItems, productsMap);

          const partnerCommissions = computeProductOrderPartnerCommissions({
            trackingLinkId: (order.tracking_link_id as string | null) ?? null,
            totalAmount: Number(order.total_amount) || 0,
            metadata: order.metadata,
            orderItems,
            ...hostCommissionContext,
          });

          return {
            rowId: `product-${id}`,
            orderId: id,
            source: 'product' as const,
            viewContext: 'host' as const,
            canViewOrderDetails: true,
            createdAt: order.created_at as string,
            orderNo: (order.order_no as string | null) ?? null,
            buyerName: buildBuyerName(
              order.buyer_first_name as string | null,
              order.buyer_last_name as string | null
            ),
            phone: (order.buyer_phone as string | null) ?? null,
            email: (order.buyer_email as string | null) ?? null,
            productLabel: label,
            eventTitle: null,
            quantity,
            amount: Number(order.total_amount) || 0,
            cost: orderItemsLineCost(orderItems, productCostMap),
            shipping: shippingFromOrderMetadata(order.metadata),
            paymentStatus,
            fulfillmentStatus,
            shippedAt,
            displayStatus: deriveDisplayStatus(paymentStatus, shippedAt, fulfillmentStatus),
            partnerCommissions,
          };
        }
      );

      const partnerProductRows: ProductOrderTableRow[] = partnerFetch.orderRows
        .filter((order) => !hostOrderIdSet.has(order.id as string))
        .map((order) => {
          const id = order.id as string;
          const paymentStatus = (order.payment_status as string) || 'unpaid';
          const fulfillmentStatus = (order.fulfillment_status as string | null) ?? null;
          const shippedAt = (order.shipped_at as string | null) ?? null;
          const orderItems = orderItemsMap.get(id) || [];
          const { label, quantity } = buildProductLabel(orderItems, productsMap);
          const access = partnerFetch.accessMap.get(id);
          const canViewOrderDetails = access?.canViewOrderDetails === true;

          const allCommissions = computeProductOrderPartnerCommissions({
            trackingLinkId: (order.tracking_link_id as string | null) ?? null,
            totalAmount: Number(order.total_amount) || 0,
            metadata: order.metadata,
            orderItems,
            ...partnerCommissionContext,
          });
          const partnerCommissions = filterCommissionLinesForLinkIds(
            allCommissions,
            ownPartnerLinkIds
          );

          const buyerFirst = order.buyer_first_name as string | null;
          const buyerLast = order.buyer_last_name as string | null;
          const buyerPhone = order.buyer_phone as string | null;
          const buyerEmail = order.buyer_email as string | null;

          return {
            rowId: `product-partner-${id}`,
            orderId: id,
            source: 'product' as const,
            viewContext: 'partner' as const,
            canViewOrderDetails,
            createdAt: order.created_at as string,
            orderNo: (order.order_no as string | null) ?? null,
            buyerName: canViewOrderDetails
              ? buildBuyerName(buyerFirst, buyerLast)
              : maskPartnerPii(buildBuyerName(buyerFirst, buyerLast)),
            phone: canViewOrderDetails ? buyerPhone : maskPartnerPii(buyerPhone),
            email: canViewOrderDetails ? buyerEmail : maskPartnerPii(buyerEmail),
            productLabel: label,
            eventTitle: null,
            quantity,
            amount: Number(order.total_amount) || 0,
            cost: canViewOrderDetails ? orderItemsLineCost(orderItems, productCostMap) : null,
            shipping: canViewOrderDetails ? shippingFromOrderMetadata(order.metadata) : null,
            paymentStatus,
            fulfillmentStatus,
            shippedAt,
            displayStatus: deriveDisplayStatus(paymentStatus, shippedAt, fulfillmentStatus),
            partnerCommissions,
          };
        });

      const addonRows: ProductOrderTableRow[] = addonItemsRaw.map((item) => {
        const order = item.orders as Record<string, unknown>;
        const orderId = order.id as string;
        const eventId = order.event_id as string | null;
        const paymentStatus = (order.payment_status as string) || 'unpaid';
        const fulfillmentStatus = (order.fulfillment_status as string | null) ?? null;
        const shippedAt = (order.shipped_at as string | null) ?? null;

        const partnerCommissions = computeAddonLinePartnerCommissions({
          parentTrackingLinkId: (order.tracking_link_id as string | null) ?? null,
          addonProductId: item.product_id,
          subtotal: Number(item.subtotal) || 0,
          quantity: item.quantity,
          ...hostCommissionContext,
        });

        return {
          rowId: `addon-${item.id}`,
          orderId,
          source: 'event_addon' as const,
          viewContext: 'host' as const,
          canViewOrderDetails: true,
          createdAt: order.created_at as string,
          orderNo: (order.order_no as string | null) ?? null,
          buyerName: buildBuyerName(
            order.buyer_first_name as string | null,
            order.buyer_last_name as string | null
          ),
          phone: (order.buyer_phone as string | null) ?? null,
          email: (order.buyer_email as string | null) ?? null,
          productLabel: formatAddonLabel(item.label, item.variant_label),
          eventTitle: eventId ? eventTitleMap.get(eventId) ?? null : null,
          quantity: item.quantity,
          amount: Number(item.subtotal) || 0,
          cost: addonLineCost(item.product_id, item.quantity, productCostMap),
          shipping: null,
          paymentStatus,
          fulfillmentStatus,
          shippedAt,
          displayStatus: deriveDisplayStatus(paymentStatus, shippedAt, fulfillmentStatus),
          partnerCommissions,
        };
      });

      const merged = [...productRows, ...partnerProductRows, ...addonRows];
      merged.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return merged;
    },
    enabled: enabled && !!currentOrg,
  });
}
