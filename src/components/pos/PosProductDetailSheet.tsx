import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PublicProductForm, { type PosAddToCartItem } from '@/components/products/PublicProductForm';
import type { CartItem } from '@/components/pos/Cart';
import type { ProductWithDetails } from '@/pages/dashboard/products/Products';

interface PosProductDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithDetails | null;
  orgId: string;
  orgName: string;
  selectedWarehouseId: string | null;
  cart: CartItem[];
  onAddToCart: (item: PosAddToCartItem) => boolean;
}

export function PosProductDetailSheet({
  open,
  onOpenChange,
  product,
  orgId,
  orgName,
  selectedWarehouseId,
  cart,
  onAddToCart,
}: PosProductDetailSheetProps) {
  if (!product) return null;

  const handleAddToCart = (item: PosAddToCartItem): boolean => {
    const success = onAddToCart(item);
    if (success) {
      onOpenChange(false);
    }
    return success;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>{product.title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 px-1">
          <PublicProductForm
            product={product}
            variants={product.variants}
            org={{ id: orgId, name: orgName }}
            orgSlug=""
            hideRelatedProducts
            compact
            onAddToCart={handleAddToCart}
            posWarehouseId={selectedWarehouseId}
            posInventoryItems={product.inventoryItems}
            posCartItems={cart}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
