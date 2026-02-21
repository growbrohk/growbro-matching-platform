import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import type { ProductVariant, InventoryItem } from '@/pages/dashboard/products/Products';
import type { CartItem } from './Cart';
import { getVariantOptionValue } from '@/lib/utils/variant-parser';

interface VariantPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  variants: ProductVariant[];
  rank1: string;
  rank2: string;
  onSelect: (variant: ProductVariant) => void;
  activeWarehouseId: string | null;
  inventoryItems: InventoryItem[];
  cart: CartItem[];
}

export function VariantPicker({ 
  open, 
  onOpenChange, 
  productName, 
  variants, 
  rank1, 
  rank2, 
  onSelect,
  activeWarehouseId,
  inventoryItems,
  cart,
}: VariantPickerProps) {
  const { toast } = useToast();
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

  // Get stock for a variant in the active warehouse
  const getVariantStock = (variantId: string): number => {
    if (!activeWarehouseId) return 0;
    const item = inventoryItems.find(
      i => i.variant_id === variantId && i.warehouse_id === activeWarehouseId
    );
    return item?.quantity ?? 0;
  };

  // Get current cart quantity for a variant
  const getCartQuantity = (variantId: string): number => {
    const cartItem = cart.find(item => item.variantId === variantId);
    return cartItem?.qty ?? 0;
  };

  // Get remaining stock (available stock minus what's already in cart)
  const getRemainingStock = (variantId: string): number => {
    const stock = getVariantStock(variantId);
    const cartQty = getCartQuantity(variantId);
    return Math.max(0, stock - cartQty);
  };

  const handleVariantClick = (variant: ProductVariant) => {
    if (!activeWarehouseId) {
      toast({
        title: 'Warehouse Required',
        description: 'Please select a warehouse in Settings',
        variant: 'destructive',
      });
      return;
    }

    const remainingStock = getRemainingStock(variant.id);
    if (remainingStock === 0) {
      toast({
        title: 'Out of Stock',
        description: 'This variant is out of stock in the selected warehouse',
        variant: 'destructive',
      });
      return;
    }

    setSelectedVariant(variant);
  };

  const handleConfirm = () => {
    if (!selectedVariant) return;

    if (!activeWarehouseId) {
      toast({
        title: 'Warehouse Required',
        description: 'Please select a warehouse in Settings',
        variant: 'destructive',
      });
      return;
    }

    const remainingStock = getRemainingStock(selectedVariant.id);
    if (remainingStock === 0) {
      toast({
        title: 'Out of Stock',
        description: 'This variant is out of stock in the selected warehouse',
        variant: 'destructive',
      });
      return;
    }

    onSelect(selectedVariant);
    setSelectedVariant(null);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>Select Variant</SheetTitle>
          <SheetDescription>{productName}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {!activeWarehouseId ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Please select a warehouse in Settings</p>
            </div>
          ) : (
            <div className="space-y-1.5 sm:space-y-2">
              {variants.map((variant) => {
                const isSelected = selectedVariant?.id === variant.id;
                const price = variant.price || 0;
                const label = formatVariantLabel(variant);
                const stock = getVariantStock(variant.id);
                const remainingStock = getRemainingStock(variant.id);
                const isOutOfStock = remainingStock === 0;
                const isDisabled = isOutOfStock;

                return (
                  <button
                    key={variant.id}
                    onClick={() => handleVariantClick(variant)}
                    disabled={isDisabled}
                    className={`w-full p-2.5 sm:p-4 rounded-lg border text-left transition-colors ${
                      isDisabled
                        ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                        : isSelected
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    style={
                      isDisabled
                        ? {}
                        : isSelected
                        ? { borderColor: '#0E7A3A', backgroundColor: 'rgba(14,122,58,0.1)' }
                        : {}
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm sm:text-base truncate" style={{ color: isDisabled ? '#9CA3AF' : '#0F1F17' }}>
                          {label}
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 mt-0.5 sm:mt-1">
                          {variant.sku && (
                            <div className="text-xs sm:text-sm text-muted-foreground truncate whitespace-nowrap">
                              SKU: {variant.sku}
                            </div>
                          )}
                          <div className={`text-xs sm:text-sm whitespace-nowrap ${isOutOfStock ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                            {isOutOfStock ? 'Out of stock' : `Stock: ${remainingStock}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right ml-2 sm:ml-4 flex-shrink-0">
                        <div className="font-semibold text-sm sm:text-base whitespace-nowrap" style={{ color: isDisabled ? '#9CA3AF' : '#0E7A3A' }}>
                          HK${price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <Button
            onClick={handleConfirm}
            disabled={!selectedVariant || !activeWarehouseId || (selectedVariant ? getRemainingStock(selectedVariant.id) === 0 : true)}
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
