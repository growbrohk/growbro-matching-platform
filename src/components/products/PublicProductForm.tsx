import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShoppingCart } from 'lucide-react';
import { ProductImageLightbox } from '@/components/products/ProductImageLightbox';
import ProductInfoAccordion from '@/components/products/ProductInfoAccordion';
import { useToast } from '@/hooks/use-toast';
import { usePublicCart } from '@/contexts/PublicCartContext';
import {
  relatedProductCardImageUrl,
  type RelatedProductSummary,
  getProductAccessVariants,
  type ProductAccessVariant,
} from '@/lib/api/products';
import { getVariantConfig } from '@/lib/api/variant-config';
import type { Product, ProductVariant } from '@/lib/types';
import { collectProductPhotoUrls, collectVariantPhotoUrl } from '@/lib/utils/product-media';
import HierarchicalVariantSelectGroup from '@/components/products/HierarchicalVariantSelectGroup';

interface Org {
  id: string;
  name: string;
  slug?: string | null;
}

interface PublicProductFormProps {
  product: Product;
  variants: ProductVariant[];
  org: Org;
  orgSlug: string;
  relatedProducts?: RelatedProductSummary[];
  /** URL ?code= — matches product_access_variants for promo pricing */
  codeParam?: string | null;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PublicProductForm({
  product,
  variants,
  org,
  orgSlug,
  relatedProducts = [],
  codeParam = null,
}: PublicProductFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setOrgId, addItem } = usePublicCart();

  const activeVariants = useMemo(
    () => variants.filter((v) => v.active !== false),
    [variants],
  );

  const [variantRankOrder, setVariantRankOrder] = useState<string[]>([]);
  const [variantValueOrders, setVariantValueOrders] = useState<Record<string, string[]>>({});
  const [productAccessVariants, setProductAccessVariants] = useState<ProductAccessVariant[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getProductAccessVariants(product.id);
        if (!cancelled) setProductAccessVariants(list);
      } catch {
        if (!cancelled) setProductAccessVariants([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await getVariantConfig(org.id);
        if (!cancelled) {
          setVariantRankOrder([c.rank1, c.rank2].filter(Boolean));
          setVariantValueOrders(c.value_orders || {});
        }
      } catch {
        if (!cancelled) {
          setVariantRankOrder([]);
          setVariantValueOrders({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    const first = activeVariants[0];
    return first?.id ?? null;
  });

  useEffect(() => {
    const first = activeVariants[0];
    setSelectedVariantId((prev) => {
      if (first && !activeVariants.some((v) => v.id === prev)) {
        return first.id;
      }
      if (!first) return null;
      return prev ?? first.id;
    });
  }, [product.id, activeVariants]);

  const effectiveSelectedVariant = useMemo(() => {
    if (activeVariants.length === 0) return undefined;
    return activeVariants.find((v) => v.id === selectedVariantId) ?? activeVariants[0];
  }, [activeVariants, selectedVariantId]);

  const hierarchicalVariantRows = useMemo(
    () =>
      activeVariants.map((v) => ({
        id: v.id,
        name: v.name,
        price: v.price,
      })),
    [activeVariants],
  );

  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setOrgId(org.id);
  }, [org.id, setOrgId]);

  const photos = useMemo(
    () => collectProductPhotoUrls(product as Product & { image_url?: string | null }),
    [product],
  );

  const meta = product.metadata || {};
  const productDetails =
    typeof meta.product_details === 'string' ? meta.product_details.trim() : '';
  const sizeFit = typeof meta.size_and_fit === 'string' ? meta.size_and_fit.trim() : '';
  const descriptionText = (product.description || '').trim();

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageLightbox, setImageLightbox] = useState({ open: false, url: '' as string });

  useEffect(() => {
    if (photos.length === 0) {
      setSelectedImageIndex(0);
      return;
    }
    setSelectedImageIndex((i) => (i >= photos.length ? 0 : i));
  }, [photos.length]);

  const mainSrc = photos[selectedImageIndex] ?? photos[0] ?? null;

  const matchedPromoVariant = useMemo((): ProductAccessVariant | null => {
    if (!codeParam) return null;
    const active = productAccessVariants.filter((v) => v.is_active !== false);
    const found = active.find(
      (v) => v.visibility_mode === 'code' && v.access_code === codeParam,
    );
    return found ?? null;
  }, [codeParam, productAccessVariants]);

  const baseUnitPrice = effectiveSelectedVariant?.price ?? product.base_price ?? 0;

  const { displayPrice, discountPercentLabel } = useMemo(() => {
    let effective = baseUnitPrice;
    if (matchedPromoVariant) {
      const po = matchedPromoVariant.price_override;
      const dp = matchedPromoVariant.discount_percent;
      if (po != null) {
        effective = Number(po);
      } else if (dp != null) {
        effective = baseUnitPrice * (1 - Number(dp) / 100);
      }
    }
    const discountPct =
      matchedPromoVariant && effective < baseUnitPrice
        ? Math.round((1 - effective / baseUnitPrice) * 100)
        : null;
    return { displayPrice: effective, discountPercentLabel: discountPct };
  }, [baseUnitPrice, matchedPromoVariant]);

  const hasMultipleVariants = activeVariants.length > 1;

  const quantityNum = Math.max(1, Math.min(99, quantity));

  const handleAddToCart = () => {
    const variant = effectiveSelectedVariant;
    if (!variant) {
      toast({
        title: 'Cannot add to cart',
        description: 'Please select a variant.',
        variant: 'destructive',
      });
      return;
    }
    const variantLabel = hasMultipleVariants ? variant.name : undefined;
    const productRow = product as Product & { image_url?: string | null };
    const variantPhoto = collectVariantPhotoUrl(variant);
    const lineImageUrl =
      mainSrc ?? variantPhoto ?? photos[0] ?? productRow.image_url?.trim() ?? null;
    const pm = product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
      ? (product.metadata as Record<string, unknown>)
      : {};
    const rawW = pm.shipping_weight_kg;
    let weightKgPerUnit: number | undefined;
    if (typeof rawW === 'number' && Number.isFinite(rawW) && rawW >= 0) {
      weightKgPerUnit = rawW;
    } else if (typeof rawW === 'string' && rawW.trim() !== '') {
      const n = Number(rawW.trim());
      if (Number.isFinite(n) && n >= 0) weightKgPerUnit = n;
    }
    addItem({
      productId: product.id,
      variantId: variant.id,
      name: product.title,
      variantLabel,
      imageUrl: lineImageUrl,
      unitPrice: displayPrice,
      productAccessVariantId: matchedPromoVariant?.id ?? null,
      qty: quantityNum,
      weightKgPerUnit,
    });
    toast({
      title: 'Added to cart',
      description: `${product.title}${variantLabel ? ` (${variantLabel})` : ''} x${quantityNum}`,
    });
  };

  return (
    <div className="space-y-10 md:space-y-14">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        {/* Gallery: main image only; thumbs live in the buy box above Size / variant */}
        <div className="w-full">
          <div
            className="aspect-square w-full rounded-2xl overflow-hidden bg-muted flex items-center justify-center min-w-0"
            style={{ borderColor: 'rgba(14,122,58,0.14)', borderWidth: 1 }}
          >
            {mainSrc ? (
              <button
                type="button"
                className="w-full h-full block cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                onClick={() => setImageLightbox({ open: true, url: mainSrc })}
                aria-label={`View full size: ${product.title}`}
              >
                <img
                  src={mainSrc}
                  alt={product.title}
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <span className="text-sm text-muted-foreground">No image</span>
            )}
          </div>
        </div>

        {/* Buy box */}
        <div className="space-y-6 lg:sticky lg:top-24">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold mb-2"
              style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
            >
              {product.title}
            </h1>
            <div className="flex flex-wrap items-baseline gap-2">
              {matchedPromoVariant && discountPercentLabel != null && discountPercentLabel > 0 && baseUnitPrice > displayPrice && (
                <span className="text-lg line-through text-muted-foreground">
                  {baseUnitPrice > 0 ? formatPrice(baseUnitPrice) : ''}
                </span>
              )}
              <p className="text-xl md:text-2xl font-semibold" style={{ color: '#0E7A3A' }}>
                {displayPrice > 0 ? formatPrice(displayPrice) : 'Free'}
              </p>
              {matchedPromoVariant && discountPercentLabel != null && discountPercentLabel > 0 && (
                <span className="text-sm font-medium text-emerald-700">{discountPercentLabel}% off</span>
              )}
            </div>
            {codeParam && !matchedPromoVariant && product.type === 'physical' && (
              <p className="text-sm text-muted-foreground mt-1">This code does not apply to this product.</p>
            )}
          </div>

          {photos.length > 1 && (
            <div className="flex flex-row gap-2 overflow-x-auto pb-1 -mx-1 px-1 max-h-[5.5rem]">
              {photos.map((p, i) => (
                <button
                  key={`${p}-${i}`}
                  type="button"
                  onClick={() => {
                    setSelectedImageIndex(i);
                    setImageLightbox({ open: true, url: p });
                  }}
                  className={`
                    flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors cursor-zoom-in
                    ${
                      selectedImageIndex === i
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-transparent hover:border-muted-foreground/30'
                    }
                  `}
                  aria-label={`View image ${i + 1} of ${product.title}`}
                >
                  <img src={p} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {hasMultipleVariants && (
            <HierarchicalVariantSelectGroup
              instanceKey={product.id}
              variants={hierarchicalVariantRows}
              selectedVariantId={selectedVariantId}
              onVariantChange={setSelectedVariantId}
              variantRankOrder={variantRankOrder}
              variantValueOrders={variantValueOrders}
              autoSelectFirst
              flatItemSuffix={(v) =>
                v.price != null && v.price > 0 ? ` - ${formatPrice(Number(v.price))}` : null
              }
            />
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: '#0F1F17' }}>
              Quantity
            </label>
            <Input
              type="number"
              min={1}
              max={99}
              value={quantityNum}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
              className="w-24 rounded-2xl"
            />
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={handleAddToCart}
              size="lg"
              className="w-full h-12 rounded-2xl font-bold"
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Cart
            </Button>
          </div>
        </div>
      </div>

      <ProductInfoAccordion
        description={descriptionText}
        productDetails={productDetails}
        sizeAndFit={sizeFit}
        defaultAllOpen
        className="border-t border-black/10 pt-2"
        aria-label="Product information"
      />

      <ProductImageLightbox
        open={imageLightbox.open}
        onOpenChange={(o) => setImageLightbox((s) => ({ ...s, open: o }))}
        url={imageLightbox.url}
        title={product.title}
      />

      {relatedProducts.length > 0 && (
        <section aria-label="You may also like">
          <h2
            className="text-lg md:text-xl font-semibold mb-4 md:mb-6"
            style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
          >
            You may also like
          </h2>
          <div className="flex gap-4 lg:gap-6 overflow-x-auto pb-4 -mx-1 px-1 scrollbar-hide">
            {relatedProducts.map((p) => {
              const img = relatedProductCardImageUrl(p);
              const price = p.base_price != null ? Number(p.base_price) : 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/${orgSlug}/products/${p.id}`)}
                  className="flex-shrink-0 w-36 md:w-40 lg:w-48 rounded-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity text-left"
                >
                  <div className="aspect-square w-full bg-muted">
                    {img ? (
                      <img
                        src={img}
                        alt={p.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-xs text-muted-foreground px-2 text-center">
                          {p.title}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 lg:p-4 bg-background">
                    <p
                      className="font-medium text-sm lg:text-base truncate"
                      style={{ color: '#0F1F17' }}
                    >
                      {p.title}
                    </p>
                    {price > 0 && (
                      <p
                        className="text-sm lg:text-base font-semibold mt-0.5"
                        style={{ color: '#0E7A3A' }}
                      >
                        {formatPrice(price)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
