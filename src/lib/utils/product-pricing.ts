export function getEffectiveVariantPrice(
  variant: { price: number | null },
  basePrice: number | null,
  pendingPrice?: number,
): number {
  if (pendingPrice !== undefined) return pendingPrice;
  return variant.price ?? basePrice ?? 0;
}

export function getMinProductPrice(
  product: { base_price: number | null; variants: { id: string; price: number | null }[] },
  pendingEdits?: Record<string, { price?: number }>,
): number {
  if (product.variants.length === 0) return product.base_price ?? 0;

  const prices = product.variants
    .map((v) =>
      getEffectiveVariantPrice(v, product.base_price, pendingEdits?.[v.id]?.price),
    )
    .filter((p) => p > 0);

  return prices.length > 0 ? Math.min(...prices) : (product.base_price ?? 0);
}
