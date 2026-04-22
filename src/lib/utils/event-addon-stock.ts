import type { EventAddonForCheckout } from '@/lib/api/event-addons';

/** List (catalog) vs effective price; isDiscounted true when sale is below list (not markup). */
export function getAddonDisplayPrices(
  addon: EventAddonForCheckout,
  variantId: string | undefined
): { list: number; effective: number; isDiscounted: boolean } {
  if (addon.variants.length === 0) {
    const list = addon.base_list_price ?? addon.base_price ?? 0;
    const effective = addon.base_price ?? 0;
    const l = Number(list) || 0;
    const e = Number(effective) || 0;
    return { list: l, effective: e, isDiscounted: l > e };
  }
  const v = variantId
    ? addon.variants.find((x) => x.id === variantId)
    : addon.variants[0];
  if (!v) {
    return { list: 0, effective: 0, isDiscounted: false };
  }
  const list = v.list_price ?? v.price;
  const effective = v.price;
  return { list, effective, isDiscounted: list > effective };
}

export function addonEnforcesStock(addon: EventAddonForCheckout): boolean {
  return addon.show_remaining_stock === true;
}

export function resolvedVariantId(
  addon: EventAddonForCheckout,
  sel: { variantId?: string; qty: number }
): string | undefined {
  if (addon.variants.length < 1) return undefined;
  return sel.variantId ?? addon.variants[0].id;
}

/** When not enforcing stock, returns null. Otherwise 0+ from API. */
export function stockRemainingForVariant(
  addon: EventAddonForCheckout,
  variantId: string | undefined
): number | null {
  if (!addonEnforcesStock(addon)) return null;
  const vid = variantId ?? addon.variants[0]?.id;
  if (!vid) return 0;
  const row = addon.variants.find((v) => v.id === vid);
  return row?.stock_remaining ?? 0;
}

export function maxQtyPrimary(
  addon: EventAddonForCheckout,
  sel: { variantId?: string; qty: number }
): number {
  const s = stockRemainingForVariant(addon, resolvedVariantId(addon, sel));
  if (s === null) return 9999;
  return Math.max(0, s);
}

export function maxQtyPerTicketAttendee(
  addon: EventAddonForCheckout,
  sel: { variantId?: string; qty: number },
  attendeeIndex: number,
  byAttendee: Record<number, Record<string, { variantId?: string; qty: number }>>
): number {
  const s = stockRemainingForVariant(addon, resolvedVariantId(addon, sel));
  if (s === null) return 9999;
  const vid = resolvedVariantId(addon, sel);
  if (!vid) return 0;
  let others = 0;
  for (const [k, selections] of Object.entries(byAttendee)) {
    const idx = parseInt(k, 10);
    if (Number.isNaN(idx) || idx === attendeeIndex) continue;
    const o = selections[addon.product_id];
    if (!o || o.qty <= 0) continue;
    if (resolvedVariantId(addon, o) === vid) others += o.qty;
  }
  return Math.max(0, s - others);
}

export function computeAddonStockOrderError(
  eventAddons: EventAddonForCheckout[],
  mode: 'primary' | 'per_ticket',
  addonSelections: Record<string, { variantId?: string; qty: number }>,
  addonSelectionsByAttendee: Record<number, Record<string, { variantId?: string; qty: number }>>
): string | null {
  const totals = new Map<string, number>();
  const stockByVariant = new Map<string, number>();

  const addLine = (addon: EventAddonForCheckout, sel: { variantId?: string; qty: number }) => {
    if (!addon.show_remaining_stock || sel.qty <= 0) return;
    const vid = resolvedVariantId(addon, sel);
    if (!vid) return;
    const v = addon.variants.find((x) => x.id === vid);
    const cap = v?.stock_remaining ?? 0;
    totals.set(vid, (totals.get(vid) ?? 0) + sel.qty);
    stockByVariant.set(vid, cap);
  };

  if (mode === 'per_ticket') {
    for (const selections of Object.values(addonSelectionsByAttendee)) {
      for (const addon of eventAddons) {
        const sel = selections[addon.product_id];
        if (sel) addLine(addon, sel);
      }
    }
  } else {
    for (const addon of eventAddons) {
      const sel = addonSelections[addon.product_id];
      if (sel) addLine(addon, sel);
    }
  }

  for (const [vid, total] of totals) {
    const cap = stockByVariant.get(vid) ?? 0;
    if (total > cap) {
      return 'Add-on quantities exceed available stock. Please adjust before continuing.';
    }
  }
  return null;
}
