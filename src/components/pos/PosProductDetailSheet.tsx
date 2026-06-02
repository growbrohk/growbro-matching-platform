import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import PublicProductForm, { type PosAddToCartItem } from '@/components/products/PublicProductForm';
import type { ProductWithDetails } from '@/pages/dashboard/products/Products';

interface PosProductDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithDetails | null;
  orgId: string;
  orgName: string;
  onAddToCart: (item: PosAddToCartItem) => void;
}

export function PosProductDetailSheet({
  open,
  onOpenChange,
  product,
  orgId,
  orgName,
  onAddToCart,
}: PosProductDetailSheetProps) {
  if (!product) return null;

  const handleAddToCart = (item: PosAddToCartItem) => {
    onAddToCart(item);
    onOpenChange(false);
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
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
