import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const DEFAULT_ACCENT = '#E85D04';

interface ProductItem {
  id: string;
  title: string;
  imageUrl: string | null;
  orgSlug?: string | null;
  price?: number;
}

interface BrandPublicProductsProps {
  orgSlug: string | null;
  products: ProductItem[];
  loading?: boolean;
  isEditMode?: boolean;
  accentColor?: string | null;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function BrandPublicProducts({
  orgSlug,
  products,
  loading,
  isEditMode,
  accentColor = DEFAULT_ACCENT,
}: BrandPublicProductsProps) {
  const navigate = useNavigate();
  const accent = accentColor || DEFAULT_ACCENT;

  const handleProductClick = (p: ProductItem) => {
    if (orgSlug) {
      navigate(`/${orgSlug}/products/${p.id}`);
    }
  };

  if (loading) {
    return (
      <section className="w-full px-4 py-4 md:py-6 lg:py-8 bg-muted/20">
        <div className="max-w-6xl lg:max-w-7xl mx-auto">
          <div className="inline-block px-4 py-2 lg:px-6 lg:py-3 mb-6 lg:mb-8" style={{ backgroundColor: accent }}>
            <h2 className="text-xl lg:text-2xl font-bold text-white">merch</h2>
          </div>
          <div className="flex gap-4 lg:gap-6 overflow-x-auto pb-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-square w-36 md:w-40 lg:w-48 flex-shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (products.length === 0 && !isEditMode) return null;

  return (
    <section className="w-full px-4 py-4 md:py-6 lg:py-8">
      <div className="max-w-6xl lg:max-w-7xl mx-auto">
        <div className="inline-block px-4 py-2 lg:px-6 lg:py-3 mb-6 lg:mb-8" style={{ backgroundColor: accent }}>
          <h2 className="text-xl lg:text-2xl font-bold text-white">merch</h2>
        </div>
        <div className="flex gap-4 lg:gap-6 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => handleProductClick(product)}
              className="flex-shrink-0 w-36 md:w-40 lg:w-48 rounded-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity text-left"
            >
              <div className="aspect-square w-full">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <span className="text-xs text-muted-foreground px-2 text-center">{product.title}</span>
                  </div>
                )}
              </div>
              <div className="p-3 lg:p-4">
                <p className="font-medium text-sm lg:text-base truncate" style={{ color: '#0F1F17' }}>
                  {product.title}
                </p>
                {product.price != null && product.price > 0 && (
                  <p className="text-sm lg:text-base font-semibold mt-0.5" style={{ color: accent }}>
                    {formatPrice(product.price)}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
