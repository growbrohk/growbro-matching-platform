export function shippingFeeFromMetadata(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  const fee = (metadata as Record<string, unknown>).shipping_fee;
  const n = Number(fee);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function orderCommissionableAmount(
  totalAmount: number,
  metadata: unknown,
  orderItems: Array<{ quantity: number; metadata: unknown }>,
  productCostMap: Map<string, number>,
  basis: 'revenue' | 'profit'
): number {
  const total = Number(totalAmount) || 0;
  if (basis !== 'profit') return total;

  const shipping = shippingFeeFromMetadata(metadata);
  let lineCost = 0;
  for (const item of orderItems) {
    const meta = item.metadata as Record<string, unknown> | null;
    const pid = meta?.product_id as string | undefined;
    if (pid && productCostMap.has(pid)) {
      lineCost += (productCostMap.get(pid) || 0) * (Number(item.quantity) || 0);
    }
  }
  return Math.max(0, total - shipping - lineCost);
}

/** Commissionable amount for a single addon line (no order-level shipping). */
export function addonLineCommissionableAmount(
  subtotal: number,
  productId: string | null,
  quantity: number,
  productCostMap: Map<string, number>,
  basis: 'revenue' | 'profit'
): number {
  const lineTotal = Number(subtotal) || 0;
  if (basis !== 'profit') return lineTotal;
  if (!productId || !productCostMap.has(productId)) return lineTotal;
  const lineCost = (productCostMap.get(productId) || 0) * (Number(quantity) || 0);
  return Math.max(0, lineTotal - lineCost);
}

export function computePartnerCommission(
  commissionable: number,
  commissionRate: number | null
): number {
  const rate = Number(commissionRate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.max(0, commissionable * rate);
}

export function normalizeCommissionBasis(value: string | null | undefined): 'revenue' | 'profit' {
  return value === 'profit' ? 'profit' : 'revenue';
}

/** Sum of unit cost × quantity across order line items with a known product cost. */
export function orderItemsLineCost(
  orderItems: Array<{ quantity: number; metadata?: Record<string, unknown> }>,
  productCostMap: Map<string, number>
): number | null {
  let total = 0;
  let hasCost = false;
  for (const item of orderItems) {
    const pid = item.metadata?.product_id as string | undefined;
    if (pid && productCostMap.has(pid)) {
      total += (productCostMap.get(pid) || 0) * (Number(item.quantity) || 0);
      hasCost = true;
    }
  }
  return hasCost ? total : null;
}

export function addonLineCost(
  productId: string | null,
  quantity: number,
  productCostMap: Map<string, number>
): number | null {
  if (!productId || !productCostMap.has(productId)) return null;
  return (productCostMap.get(productId) || 0) * (Number(quantity) || 0);
}
