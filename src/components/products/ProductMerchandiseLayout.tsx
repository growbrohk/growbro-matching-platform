import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import ProductInfoAccordion from '@/components/products/ProductInfoAccordion';

export type ProductMerchandiseLayoutDensity = 'pdp' | 'compact';

export interface ProductMerchandiseLayoutProps {
  title: string;
  /** e.g. "Required" badge next to the title. */
  titleEndSlot?: ReactNode;
  priceSlot: ReactNode;
  /** Gallery URLs (controlled). Parent should derive `mainSrc` for cart, etc. */
  photos: string[];
  selectedImageIndex: number;
  onSelectImageIndex: (index: number) => void;
  /** Variant selector, quantity, CTA, badges — rendered below thumbs in the right column. */
  children: ReactNode;
  description?: string;
  productDetails?: string;
  sizeAndFit?: string;
  defaultAllOpen: boolean;
  /** Passed to the accordion section wrapper (e.g. PDP vs checkout spacing). */
  accordionClassName?: string;
  'aria-label'?: string;
  /** `compact` = smaller title, no sticky buy column; for nested checkout cards. */
  density?: ProductMerchandiseLayoutDensity;
}

/**
 * Shared PDP-style merchandise shell: 2-col grid, main image, thumbs, title + price slot,
 * children (variants / qty), then ProductInfoAccordion. No cart, no data fetching.
 */
export function ProductMerchandiseLayout({
  title,
  titleEndSlot,
  priceSlot,
  photos,
  selectedImageIndex,
  onSelectImageIndex,
  children,
  description = '',
  productDetails = '',
  sizeAndFit = '',
  defaultAllOpen,
  accordionClassName,
  'aria-label': ariaLabel = 'Product information',
  density = 'pdp',
}: ProductMerchandiseLayoutProps) {
  const mainSrc = photos[selectedImageIndex] ?? photos[0] ?? null;
  const isCompact = density === 'compact';

  return (
    <div className="space-y-10 md:space-y-14">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        <div className="w-full">
          <div
            className="aspect-square w-full rounded-2xl overflow-hidden bg-muted flex items-center justify-center min-w-0"
            style={{ borderColor: 'rgba(14,122,58,0.14)', borderWidth: 1 }}
          >
            {mainSrc ? (
              <img src={mainSrc} alt={title} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm text-muted-foreground">No image</span>
            )}
          </div>
        </div>

        <div
          className={cn(
            'space-y-6',
            !isCompact && 'lg:sticky lg:top-24',
          )}
        >
          <div>
            <div className="flex min-w-0 items-start justify-between gap-2 mb-2">
              <h1
                className={cn(
                  'font-bold min-w-0',
                  isCompact
                    ? 'text-base'
                    : 'text-2xl md:text-3xl',
                )}
                style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
              >
                {title}
              </h1>
              {titleEndSlot}
            </div>
            {priceSlot}
          </div>

          {photos.length > 1 && (
            <div className="flex flex-row gap-2 overflow-x-auto pb-1 -mx-1 px-1 max-h-[5.5rem]">
              {photos.map((p, i) => (
                <button
                  key={`${p}-${i}`}
                  type="button"
                  onClick={() => onSelectImageIndex(i)}
                  className={cn(
                    'flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
                    selectedImageIndex === i
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-transparent hover:border-muted-foreground/30',
                  )}
                  aria-label={`Select image ${i + 1} of ${title}`}
                  aria-pressed={selectedImageIndex === i}
                >
                  <img src={p} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {children}
        </div>
      </div>

      <ProductInfoAccordion
        description={description}
        productDetails={productDetails}
        sizeAndFit={sizeAndFit}
        defaultAllOpen={defaultAllOpen}
        className={accordionClassName}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export default ProductMerchandiseLayout;
