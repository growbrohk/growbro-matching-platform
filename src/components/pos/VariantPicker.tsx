import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import type { ProductVariant } from '@/pages/dashboard/products/Products';
import { getVariantOptionValue } from '@/lib/utils/variant-parser';

interface VariantPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  variants: ProductVariant[];
  rank1: string;
  rank2: string;
  onSelect: (variant: ProductVariant) => void;
}

export function VariantPicker({ open, onOpenChange, productName, variants, rank1, rank2, onSelect }: VariantPickerProps) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  const formatVariantLabel = (variant: ProductVariant): string => {
    return variant.name
      .split('/')
      .map(segment => {
        const colonIndex = segment.indexOf(':');
        if (colonIndex === -1) {
          return segment.trim();
        }
        return segment.substring(colonIndex + 1).trim();
      })
      .join(' / ');
  };

  const handleConfirm = () => {
    if (selectedVariant) {
      onSelect(selectedVariant);
      setSelectedVariant(null);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>Select Variant</SheetTitle>
          <SheetDescription>{productName}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-2">
            {variants.map((variant) => {
              const isSelected = selectedVariant?.id === variant.id;
              const price = variant.price || 0;
              const label = formatVariantLabel(variant);

              return (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant)}
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'border-green-600 bg-green-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  style={isSelected ? { borderColor: '#0E7A3A', backgroundColor: 'rgba(14,122,58,0.1)' } : {}}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium" style={{ color: '#0F1F17' }}>
                        {label}
                      </div>
                      {variant.sku && (
                        <div className="text-sm text-muted-foreground mt-1">
                          SKU: {variant.sku}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold" style={{ color: '#0E7A3A' }}>
                        HK${price.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t pt-4">
          <Button
            onClick={handleConfirm}
            disabled={!selectedVariant}
            className="w-full"
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
          >
            Add to Cart
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
