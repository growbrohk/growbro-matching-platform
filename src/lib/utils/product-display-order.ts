export type ProductSortMode = 'manual' | 'random' | 'date' | 'creation';

/** Sort items using brand page manual display order; unknown ids sort after ordered ids. */
export function sortByManualDisplayOrder<T extends { id: string }>(
  items: T[],
  displayOrder: string[],
): T[] {
  if (displayOrder.length === 0) return items;
  const orderMap = new Map(
    displayOrder
      .filter((id) => items.some((item) => item.id === id))
      .map((id, i) => [id, i]),
  );
  return [...items].sort((a, b) => {
    const ai = orderMap.get(a.id) ?? 9999;
    const bi = orderMap.get(b.id) ?? 9999;
    return ai - bi;
  });
}
