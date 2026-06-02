/** Shared price override / discount % logic (ProductForm, EventAddons, POS cart). */

export function parseOptionalPriceOverride(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseOptionalDiscountPercent(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function resolveDiscountedPrice(
  basePrice: number,
  priceOverride: number | null | undefined,
  discountPercent: number | null | undefined
): number {
  const base = Number(basePrice) || 0;
  if (priceOverride != null) return Math.max(0, priceOverride);
  if (discountPercent != null) return Math.max(0, base * (1 - discountPercent / 100));
  return base;
}

export function resolveDiscountedPriceFromStrings(
  basePrice: number,
  priceOverrideStr: string | null | undefined,
  discountPercentStr: string | null | undefined
): number {
  return resolveDiscountedPrice(
    basePrice,
    parseOptionalPriceOverride(priceOverrideStr),
    parseOptionalDiscountPercent(discountPercentStr)
  );
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
