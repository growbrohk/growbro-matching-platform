import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShoppingCart } from 'lucide-react';
import { ProductMerchandiseLayout } from '@/components/products/ProductMerchandiseLayout';
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

export interface PosAddToCartItem {
  productId: string;
  variantId?: string;
  name: string;
  variantLabel?: string;
  qty: number;
  unitPrice: number;
  imageUrl?: string | null;
  weightKgPerUnit?: number;
}

type PosInventoryItem = {
  variant_id: string;
  warehouse_id: string;
  quantity: number;
};

type PosCartLine = {
  variantId?: string;
  qty: number;
};

interface PublicProductFormProps {
  product: Product;
  variants: ProductVariant[];
  org: Org;
  orgSlug: string;
  relatedProducts?: RelatedProductSummary[];
  /** URL ?code= — matches product_access_variants for promo pricing */
  codeParam?: string | null;
  /** POS mode: call this instead of public cart */
  onAddToCart?: (item: PosAddToCartItem) => boolean;
  /** Compact layout for POS sheet */
  compact?: boolean;
  /** Hide related products carousel */
  hideRelatedProducts?: boolean;
  /** POS mode: active warehouse for stock checks */
  posWarehouseId?: string | null;
  /** POS mode: inventory rows for the current product */
  posInventoryItems?: PosInventoryItem[];
  /** POS mode: current cart lines for remaining-stock calculation */
  posCartItems?: PosCartLine[];
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
  onAddToCart,
  compact = false,
  hideRelatedProducts = false,
  posWarehouseId = null,
  posInventoryItems = [],
  posCartItems = [],
}: PublicProductFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setOrgId, addItem } = usePublicCart();
  const isPosMode = Boolean(onAddToCart);

  const activeVariants = useMemo(
    () => variants.filter((v) => v.active !== false),
    [variants],
  );

  const [variantRankOrder, setVariantRankOrder] = useState<string[]>([]);
  const [variantValueOrders, setVariantValueOrders] = useState<Record<string, string[]>>({});
  const [productAccessVariants, setProductAccessVariants] = useState<ProductAccessVariant[]>([]);

  useEffect(() => {
    if (isPosMode) return;
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
  }, [product.id, isPosMode]);

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
    if (!isPosMode) {
      setOrgId(org.id);
    }
  }, [org.id, isPosMode, setOrgId]);

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

  const getRemainingStock = (variantId: string | undefined): number => {
    if (!isPosMode || !posWarehouseId || !variantId) return 0;
    const stock = posInventoryItems
      .filter((i) => i.variant_id === variantId && i.warehouse_id === posWarehouseId)
      .reduce((sum, i) => sum + i.quantity, 0);
    const cartQty = posCartItems.find((i) => i.variantId === variantId)?.qty ?? 0;
    return Math.max(0, stock - cartQty);
  };

  const remainingStock = useMemo(
    () => getRemainingStock(effectiveSelectedVariant?.id),
    [
      isPosMode,
      posWarehouseId,
      posInventoryItems,
      posCartItems,
      effectiveSelectedVariant?.id,
    ],
  );

  const canAddToCart = isPosMode
    ? Boolean(posWarehouseId) && remainingStock >= quantityNum
    : true;

  const buildCartPayload = (): PosAddToCartItem | null => {
    const variant = effectiveSelectedVariant;
    if (!variant && activeVariants.length > 0) {
      toast({
        title: 'Cannot add to cart',
        description: 'Please select a variant.',
        variant: 'destructive',
      });
      return null;
    }
    const variantLabel = hasMultipleVariants && variant ? variant.name : undefined;
    const productRow = product as Product & { image_url?: string | null };
    const variantPhoto = variant ? collectVariantPhotoUrl(variant) : null;
    const lineImageUrl =
      mainSrc ?? variantPhoto ?? photos[0] ?? productRow.image_url?.trim() ?? null;
    const pm =
      product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
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
    const unitPrice = variant?.price ?? product.base_price ?? 0;
    return {
      productId: product.id,
      variantId: variant?.id,
      name: product.title,
      variantLabel,
      imageUrl: lineImageUrl,
      unitPrice: isPosMode ? unitPrice : displayPrice,
      qty: quantityNum,
      weightKgPerUnit,
    };
  };

  const handleAddToCart = () => {
    const payload = buildCartPayload();
    if (!payload) return;

    if (onAddToCart) {
      const success = onAddToCart(payload);
      if (success) {
        toast({
          title: 'Added to cart',
          description: `${product.title}${payload.variantLabel ? ` (${payload.variantLabel})` : ''} x${payload.qty}`,
        });
      }
      return;
    }

    addItem({
      productId: payload.productId,
      variantId: payload.variantId,
      name: payload.name,
      variantLabel: payload.variantLabel,
      imageUrl: payload.imageUrl,
      unitPrice: payload.unitPrice,
      productAccessVariantId: matchedPromoVariant?.id ?? null,
      qty: payload.qty,
      weightKgPerUnit: payload.weightKgPerUnit,
    });
    toast({
      title: 'Added to cart',
      description: `${product.title}${payload.variantLabel ? ` (${payload.variantLabel})` : ''} x${payload.qty}`,
    });
  };

  return (
    <div className="space-y-10 md:space-y-14">
      <ProductMerchandiseLayout
        title={product.title}
        priceSlot={
          <>
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
          </>
        }
        photos={photos}
        selectedImageIndex={selectedImageIndex}
        onSelectImageIndex={setSelectedImageIndex}
        description={descriptionText}
        productDetails={productDetails}
        sizeAndFit={sizeFit}
        defaultAllOpen={!compact}
        accordionClassName="border-t border-black/10 pt-2"
        density={compact ? 'compact' : 'pdp'}
      >
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
            max={isPosMode ? Math.max(1, remainingStock) : 99}
            value={quantityNum}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
            className="w-24 rounded-2xl"
          />
          {isPosMode && (
            <p
              className={`text-sm ${remainingStock === 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
            >
              {!posWarehouseId
                ? 'Select a warehouse in Settings to add items'
                : remainingStock === 0
                  ? 'Out of stock in selected warehouse'
                  : `${remainingStock} available in selected warehouse`}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={handleAddToCart}
            disabled={!canAddToCart}
            size="lg"
            className="w-full h-12 rounded-2xl font-bold"
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Add to Cart
          </Button>
        </div>
      </ProductMerchandiseLayout>

      {!hideRelatedProducts && relatedProducts.length > 0 && (
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
