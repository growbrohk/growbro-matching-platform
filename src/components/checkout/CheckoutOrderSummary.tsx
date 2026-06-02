import type { ProductDeliveryMethod } from '@/lib/api/product-checkout';

const PANEL_BORDER = 'rgba(14,122,58,0.14)';
const BRAND_DARK = '#0F1F17';
const BRAND_GREEN = '#0E7A3A';

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export interface CheckoutOrderSummaryProps {
  subtotal: number;
  deliveryMethod: ProductDeliveryMethod;
  shippingFee: number;
  billableShippingKg: number;
  shippingRatePerKg: number;
  totalShippingKg: number;
  showActualShippingWeight: boolean;
  discountTotal?: number;
  catalogSubtotal?: number;
  title?: string;
  compact?: boolean;
}

export function CheckoutOrderSummary({
  subtotal,
  deliveryMethod,
  shippingFee,
  billableShippingKg,
  shippingRatePerKg,
  totalShippingKg,
  showActualShippingWeight,
  discountTotal = 0,
  catalogSubtotal,
  title = 'Order summary',
  compact = false,
}: CheckoutOrderSummaryProps) {
  const grandTotal = subtotal + shippingFee;

  return (
    <div
      className={compact ? 'space-y-2 text-sm' : 'rounded-2xl border bg-background p-5 md:p-6 mb-6'}
      style={compact ? undefined : { borderColor: PANEL_BORDER }}
    >
      {!compact && (
        <h3
          className="text-base font-semibold mb-4"
          style={{ fontFamily: "'Inter Tight', sans-serif", color: BRAND_DARK }}
        >
          {title}
        </h3>
      )}
      <div className="space-y-2 text-sm">
        {catalogSubtotal != null && discountTotal > 0 && (
          <>
            <div className="flex justify-between tabular-nums">
              <span style={{ color: 'rgba(15,31,23,0.72)' }}>Catalog subtotal</span>
              <span style={{ color: BRAND_DARK }}>{formatPrice(catalogSubtotal)}</span>
            </div>
            <div className="flex justify-between tabular-nums">
              <span style={{ color: 'rgba(15,31,23,0.72)' }}>Discount</span>
              <span style={{ color: BRAND_DARK }}>-{formatPrice(discountTotal)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between tabular-nums">
          <span style={{ color: 'rgba(15,31,23,0.72)' }}>Subtotal</span>
          <span style={{ color: BRAND_DARK }}>{formatPrice(subtotal)}</span>
        </div>
        {deliveryMethod !== 'event_pickup' && (
          <div className="flex justify-between gap-4 tabular-nums">
            <span className="text-right min-w-0" style={{ color: 'rgba(15,31,23,0.72)' }}>
              {billableShippingKg > 0 ? (
                <>
                  Shipping: {billableShippingKg} kg billed × HK${shippingRatePerKg}/kg
                  {showActualShippingWeight && (
                    <span className="block text-xs mt-0.5 font-normal">
                      Actual weight: {Number(totalShippingKg.toFixed(3))} kg
                    </span>
                  )}
                </>
              ) : (
                <>Shipping (— × HK${shippingRatePerKg}/kg)</>
              )}
            </span>
            <span className="shrink-0" style={{ color: BRAND_DARK }}>
              {formatPrice(shippingFee)}
            </span>
          </div>
        )}
        {deliveryMethod === 'event_pickup' && (
          <div className="flex justify-between tabular-nums">
            <span style={{ color: 'rgba(15,31,23,0.72)' }}>Shipping</span>
            <span style={{ color: BRAND_DARK }}>{formatPrice(0)}</span>
          </div>
        )}
        <div
          className="flex justify-between text-base font-semibold pt-3 border-t mt-2 tabular-nums"
          style={{ borderColor: PANEL_BORDER }}
        >
          <span style={{ color: BRAND_DARK, fontFamily: "'Inter Tight', sans-serif" }}>Total</span>
          <span style={{ color: BRAND_GREEN, fontFamily: "'Inter Tight', sans-serif" }}>
            {formatPrice(grandTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
