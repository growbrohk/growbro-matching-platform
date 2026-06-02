import { useMemo } from 'react';
import { ProductMerchCard } from '@/components/products/ProductMerchCard';
import { collectProductPhotoUrls } from '@/lib/utils/product-media';
import type { ProductWithDetails } from '@/pages/dashboard/products/Products';

interface PosProductGridProps {
  products: ProductWithDetails[];
  onProductClick: (productId: string) => void;
}

function getMinPrice(product: ProductWithDetails): number {
  if (product.variants.length > 0) {
    const prices = product.variants.map((v) => v.price || 0).filter((p) => p > 0);
    if (prices.length > 0) return Math.min(...prices);
  }
  return product.base_price || 0;
}

export function PosProductGrid({ products, onProductClick }: PosProductGridProps) {
  const cards = useMemo(
    () =>
      products.map((product) => {
        const photos = collectProductPhotoUrls(product);
        return {
          id: product.id,
          title: product.title,
          imageUrl: photos[0] ?? null,
          price: getMinPrice(product),
        };
      }),
    [products],
  );

  if (products.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12 px-4">
        <p className="text-sm sm:text-base text-muted-foreground">No products match your filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <ProductMerchCard
          key={card.id}
          title={card.title}
          imageUrl={card.imageUrl}
          price={card.price}
          accentColor="#0E7A3A"
          onClick={() => onProductClick(card.id)}
        />
      ))}
    </div>
  );
}
