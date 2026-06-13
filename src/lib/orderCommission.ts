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
  basis: 'revenue' | 'profit',
  paymentMethod?: string | null
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
  const paymentFee = computePaymentProcessingFee(paymentMethod, total);
  return Math.max(0, total - shipping - lineCost - paymentFee);
}

/** Commissionable amount for a single addon line (no order-level shipping). */
export function addonLineCommissionableAmount(
  subtotal: number,
  productId: string | null,
  quantity: number,
  productCostMap: Map<string, number>,
  basis: 'revenue' | 'profit',
  paymentMethod?: string | null,
  parentOrderTotal?: number
): number {
  const lineTotal = Number(subtotal) || 0;
  if (basis !== 'profit') return lineTotal;

  const parentTotal = Number(parentOrderTotal) || 0;
  let allocatedFee = 0;
  if (parentTotal > 0) {
    const orderFee = computePaymentProcessingFee(paymentMethod, parentTotal);
    allocatedFee = (lineTotal / parentTotal) * orderFee;
  }

  if (!productId || !productCostMap.has(productId)) {
    return Math.max(0, lineTotal - allocatedFee);
  }
  const lineCost = (productCostMap.get(productId) || 0) * (Number(quantity) || 0);
  return Math.max(0, lineTotal - lineCost - allocatedFee);
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

export const STRIPE_FEE_RATE = 0.034;
export const STRIPE_FEE_FIXED = 2.35;

export type StripeFeeBearer = 'host' | 'user';

export function computeStripeProcessingFee(orderAmount: number): number {
  const total = Number(orderAmount) || 0;
  return Math.round((total * STRIPE_FEE_RATE + STRIPE_FEE_FIXED) * 100) / 100;
}

export function computeStripeCheckoutTotal(
  subtotal: number,
  bearer: StripeFeeBearer | null | undefined
): { subtotal: number; serviceFee: number; grandTotal: number } {
  const base = Number(subtotal) || 0;
  const serviceFee = bearer === 'user' ? computeStripeProcessingFee(base) : 0;
  const grandTotal = Math.round((base + serviceFee) * 100) / 100;
  return { subtotal: base, serviceFee, grandTotal };
}

export function formatStripeFeeLabel(): string {
  return `3.4% + HK$${STRIPE_FEE_FIXED.toFixed(2)}`;
}

export function computePaymentProcessingFee(
  paymentMethod: string | null | undefined,
  orderAmount: number
): number {
  if (paymentMethod?.toLowerCase() === 'stripe') {
    return computeStripeProcessingFee(orderAmount);
  }
  return 0;
}

function formatPaymentMoney(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded % 1 === 0) {
    return `$${rounded.toLocaleString()}`;
  }
  return `$${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatProductOrderPaymentLabel(
  paymentMethod: string | null,
  paymentStatus: string,
  orderAmount: number
): string {
  const method = paymentMethod?.toLowerCase() ?? '';
  if (method === 'payme') return 'PayMe';
  if (method === 'stripe') {
    const fee = computePaymentProcessingFee(paymentMethod, orderAmount);
    return `Stripe · ${formatPaymentMoney(fee)}`;
  }
  if (method === 'fps') return 'FPS';
  if (method === 'free') return 'Free';
  if (paymentStatus === 'submitted') return 'Submitted';
  if (paymentStatus === 'paid') return 'Paid';
  return paymentStatus || '—';
}
