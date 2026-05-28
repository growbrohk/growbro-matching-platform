import {
  addonLineCommissionableAmount,
  computePartnerCommission,
  normalizeCommissionBasis,
  orderCommissionableAmount,
} from '@/lib/orderCommission';

export type HostPartnerLink = {
  id: string;
  affiliate_org_id: string;
  commission_rate: number | null;
  commission_basis: string | null;
  type: string;
  collab_sales_scope: string | null;
  product_id: string | null;
};

export type PartnerCommissionLine = {
  linkId: string;
  partnerOrgName: string;
  commissionRate: number | null;
  commissionBasis: 'revenue' | 'profit';
  commissionAmount: number;
};

export function buildHostProductPartnerLinkIndex(
  links: HostPartnerLink[]
): Map<string, HostPartnerLink[]> {
  const byProduct = new Map<string, HostPartnerLink[]>();
  for (const link of links) {
    if (
      link.type !== 'collab' ||
      link.collab_sales_scope !== 'all_for_resource' ||
      !link.product_id
    ) {
      continue;
    }
    const list = byProduct.get(link.product_id) ?? [];
    list.push(link);
    byProduct.set(link.product_id, list);
  }
  return byProduct;
}

export function buildLinksById(links: HostPartnerLink[]): Map<string, HostPartnerLink> {
  return new Map(links.map((l) => [l.id, l]));
}

function collectProductIdsFromOrderItems(
  orderItems: Array<{ quantity: number; metadata?: Record<string, unknown> }>
): Set<string> {
  const ids = new Set<string>();
  for (const item of orderItems) {
    const pid = item.metadata?.product_id as string | undefined;
    if (pid) ids.add(pid);
  }
  return ids;
}

function resolveMatchingLinkIds(
  trackingLinkId: string | null,
  productIdsInOrder: Set<string>,
  linksById: Map<string, HostPartnerLink>,
  allForResourceByProduct: Map<string, HostPartnerLink[]>
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const add = (linkId: string) => {
    if (seen.has(linkId)) return;
    if (!linksById.has(linkId)) return;
    seen.add(linkId);
    ordered.push(linkId);
  };

  if (trackingLinkId) {
    add(trackingLinkId);
  }

  for (const pid of productIdsInOrder) {
    const links = allForResourceByProduct.get(pid) ?? [];
    for (const link of links) {
      add(link.id);
    }
  }

  return ordered;
}

function linkToCommissionLine(
  link: HostPartnerLink,
  orgNameMap: Map<string, string>,
  commissionable: number
): PartnerCommissionLine {
  const basis = normalizeCommissionBasis(link.commission_basis);
  return {
    linkId: link.id,
    partnerOrgName: orgNameMap.get(link.affiliate_org_id) || 'Partner',
    commissionRate: link.commission_rate,
    commissionBasis: basis,
    commissionAmount: computePartnerCommission(commissionable, link.commission_rate),
  };
}

export function computeProductOrderPartnerCommissions(params: {
  trackingLinkId: string | null;
  totalAmount: number;
  metadata: unknown;
  orderItems: Array<{ quantity: number; metadata?: Record<string, unknown> }>;
  linksById: Map<string, HostPartnerLink>;
  allForResourceByProduct: Map<string, HostPartnerLink[]>;
  productCostMap: Map<string, number>;
  orgNameMap: Map<string, string>;
}): PartnerCommissionLine[] {
  const productIds = collectProductIdsFromOrderItems(params.orderItems);
  const linkIds = resolveMatchingLinkIds(
    params.trackingLinkId,
    productIds,
    params.linksById,
    params.allForResourceByProduct
  );

  if (linkIds.length === 0) return [];

  const itemsForCalc = params.orderItems.map((it) => ({
    quantity: it.quantity,
    metadata: it.metadata ?? null,
  }));

  const lines: PartnerCommissionLine[] = [];
  for (const linkId of linkIds) {
    const link = params.linksById.get(linkId)!;
    const basis = normalizeCommissionBasis(link.commission_basis);
    const commissionable = orderCommissionableAmount(
      params.totalAmount,
      params.metadata,
      itemsForCalc,
      params.productCostMap,
      basis
    );
    lines.push(linkToCommissionLine(link, params.orgNameMap, commissionable));
  }
  return lines;
}

export function computeAddonLinePartnerCommissions(params: {
  parentTrackingLinkId: string | null;
  addonProductId: string | null;
  subtotal: number;
  quantity: number;
  linksById: Map<string, HostPartnerLink>;
  allForResourceByProduct: Map<string, HostPartnerLink[]>;
  productCostMap: Map<string, number>;
  orgNameMap: Map<string, string>;
}): PartnerCommissionLine[] {
  const productIds = new Set<string>();
  if (params.addonProductId) {
    productIds.add(params.addonProductId);
  }

  const linkIds = resolveMatchingLinkIds(
    params.parentTrackingLinkId,
    productIds,
    params.linksById,
    params.allForResourceByProduct
  );

  if (linkIds.length === 0) return [];

  const lines: PartnerCommissionLine[] = [];
  for (const linkId of linkIds) {
    const link = params.linksById.get(linkId)!;
    const basis = normalizeCommissionBasis(link.commission_basis);
    const commissionable = addonLineCommissionableAmount(
      params.subtotal,
      params.addonProductId,
      params.quantity,
      params.productCostMap,
      basis
    );
    lines.push(linkToCommissionLine(link, params.orgNameMap, commissionable));
  }
  return lines;
}

export function formatCommissionRateLabel(rate: number | null): string {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return '';
  return `${(r * 100).toFixed(1)}%`;
}

export const PARTNER_COLUMN_PREFIX = 'partner:';

export function partnerColumnKey(linkId: string): string {
  return `${PARTNER_COLUMN_PREFIX}${linkId}`;
}

export function linkIdFromPartnerColumnKey(columnKey: string): string | null {
  if (!columnKey.startsWith(PARTNER_COLUMN_PREFIX)) return null;
  const id = columnKey.slice(PARTNER_COLUMN_PREFIX.length);
  return id || null;
}

export function isPartnerColumnKey(columnKey: string): boolean {
  return columnKey.startsWith(PARTNER_COLUMN_PREFIX);
}

export function partnerColumnHeaderLabel(params: {
  partnerOrgName: string;
  commissionRate: number | null;
}): string {
  const rateLabel = formatCommissionRateLabel(params.commissionRate);
  return rateLabel
    ? `${params.partnerOrgName} (${rateLabel})`
    : params.partnerOrgName;
}
