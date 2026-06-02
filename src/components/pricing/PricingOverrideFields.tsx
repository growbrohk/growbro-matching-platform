import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PricingOverrideFieldsProps {
  priceOverride: string;
  discountPercent: string;
  onPriceOverrideChange: (value: string) => void;
  onDiscountPercentChange: (value: string) => void;
  currencyLabel?: string;
  disabled?: boolean;
  pricePlaceholder?: string;
  discountPlaceholder?: string;
}

/** New price + Discount % pair used in ProductForm, event add-ons, and POS cart. */
export function PricingOverrideFields({
  priceOverride,
  discountPercent,
  onPriceOverrideChange,
  onDiscountPercentChange,
  currencyLabel = '$',
  disabled = false,
  pricePlaceholder = 'Override price',
  discountPlaceholder = 'e.g. 20',
}: PricingOverrideFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs font-medium">New price ({currencyLabel})</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={priceOverride}
          onChange={(e) => onPriceOverrideChange(e.target.value)}
          placeholder={pricePlaceholder}
          className="mt-1"
          disabled={disabled}
        />
      </div>
      <div>
        <Label className="text-xs font-medium">Discount %</Label>
        <Input
          type="number"
          min="0"
          max="100"
          step="1"
          value={discountPercent}
          onChange={(e) => onDiscountPercentChange(e.target.value)}
          placeholder={discountPlaceholder}
          className="mt-1"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
