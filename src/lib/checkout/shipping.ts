import type { ProductDeliveryMethod } from '@/lib/api/product-checkout';

export const SHIPPING_RATE_DOOR = 25;
export const SHIPPING_RATE_SF = 16;

export function parseShippingWeightKgFromMeta(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
  const raw = (metadata as Record<string, unknown>).shipping_weight_kg;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

export function kgPerUnitForCartLine(
  item: { productId: string; qty: number; weightKgPerUnit?: number },
  weightByProductId: Record<string, number>,
): number {
  if (
    item.weightKgPerUnit != null &&
    Number.isFinite(item.weightKgPerUnit) &&
    item.weightKgPerUnit >= 0
  ) {
    return item.weightKgPerUnit;
  }
  const w = weightByProductId[item.productId];
  if (w != null && Number.isFinite(w) && w >= 0) return w;
  return 0;
}

export function computeShippingTotals(
  deliveryMethod: ProductDeliveryMethod,
  totalShippingKg: number,
): {
  billableShippingKg: number;
  shippingRatePerKg: number;
  shippingFee: number;
  showActualShippingWeight: boolean;
} {
  const billableShippingKg =
    deliveryMethod === 'event_pickup' || totalShippingKg <= 0
      ? 0
      : Math.ceil(Number(totalShippingKg.toFixed(6)));

  const shippingRatePerKg =
    deliveryMethod === 'door'
      ? SHIPPING_RATE_DOOR
      : deliveryMethod === 'sf_locker'
        ? SHIPPING_RATE_SF
        : 0;

  const shippingFee =
    deliveryMethod === 'event_pickup'
      ? 0
      : Math.round(billableShippingKg * shippingRatePerKg * 100) / 100;

  const showActualShippingWeight =
    deliveryMethod !== 'event_pickup' &&
    totalShippingKg > 0 &&
    billableShippingKg > 0 &&
    Number(totalShippingKg.toFixed(4)) !== billableShippingKg;

  return { billableShippingKg, shippingRatePerKg, shippingFee, showActualShippingWeight };
}
