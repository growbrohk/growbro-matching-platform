/**
 * Re-validate booking draft variant IDs against current ticket types.
 * Repairs stale variant references after host edits or soft-deleted variants.
 */

import type { BookingDraft } from '@/lib/types/booking';
import type { TicketType, TicketTypeAccessVariant } from '@/lib/types';

function isVariantActive(v: TicketTypeAccessVariant): boolean {
  return (v as { is_active?: boolean }).is_active !== false;
}

function computeVariantEffectivePrice(
  basePrice: number,
  variant: TicketTypeAccessVariant
): number {
  const priceOverride = variant.price_override;
  const discountPercent = variant.discount_percent;
  if (priceOverride != null) {
    return Number(priceOverride);
  }
  if (discountPercent != null) {
    return basePrice * (1 - Number(discountPercent) / 100);
  }
  return basePrice;
}

function findActiveVariantById(
  ticketType: TicketType,
  variantId: string
): TicketTypeAccessVariant | undefined {
  return (ticketType.access_variants ?? []).find(
    (v) => v.id === variantId && isVariantActive(v)
  );
}

function findFallbackPublicVariant(
  ticketType: TicketType
): TicketTypeAccessVariant | undefined {
  return (ticketType.access_variants ?? []).find(
    (v) => v.visibility_mode === 'public' && isVariantActive(v)
  );
}

export interface RevalidateBookingDraftResult {
  draft: BookingDraft;
  changed: boolean;
  message?: string;
}

/**
 * Ensure each draft line's variant id still exists and is active.
 * Falls back to the public variant, then base ticket price when stale.
 */
export function revalidateBookingDraftVariants(
  draft: BookingDraft,
  ticketTypes: TicketType[]
): RevalidateBookingDraftResult {
  let changed = false;

  const lines = draft.lines.map((line) => {
    const ticketType = ticketTypes.find((tt) => tt.id === line.ticketTypeId);
    if (!ticketType) {
      if (line.ticketTypeAccessVariantId) {
        changed = true;
        return { ...line, ticketTypeAccessVariantId: null };
      }
      return line;
    }

    const basePrice = Number(ticketType.price);

    if (!line.ticketTypeAccessVariantId) {
      if (line.unitPrice !== basePrice) {
        changed = true;
        return { ...line, unitPrice: basePrice };
      }
      return line;
    }

    const currentVariant = findActiveVariantById(ticketType, line.ticketTypeAccessVariantId);
    if (currentVariant) {
      const effectivePrice = computeVariantEffectivePrice(basePrice, currentVariant);
      if (effectivePrice !== line.unitPrice) {
        changed = true;
        return { ...line, unitPrice: effectivePrice };
      }
      return line;
    }

    // Stale variant — try public fallback, else drop variant and use base price
    changed = true;
    const fallback = findFallbackPublicVariant(ticketType);
    if (fallback) {
      return {
        ...line,
        ticketTypeAccessVariantId: fallback.id,
        unitPrice: computeVariantEffectivePrice(basePrice, fallback),
      };
    }

    return {
      ...line,
      ticketTypeAccessVariantId: null,
      unitPrice: basePrice,
    };
  });

  return {
    draft: { ...draft, lines },
    changed,
    message: changed
      ? 'Ticket pricing was updated. Please review your order before continuing.'
      : undefined,
  };
}
