import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ShoppingCart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePublicCart } from '@/contexts/PublicCartContext';
import { relatedProductCardImageUrl, type RelatedProductSummary } from '@/lib/api/products';
import { getVariantConfig } from '@/lib/api/variant-config';
import type { Product, ProductVariant } from '@/lib/types';
import { collectProductPhotoUrls, collectVariantPhotoUrl } from '@/lib/utils/product-media';
import {
  getVariantHierarchy,
  getVariantOptionValue,
  orderVariantValuesForDisplay,
} from '@/lib/utils/variant-parser';

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

  const hierarchy = useMemo(
    () => getVariantHierarchy(activeVariants.map((v) => v.name), variantRankOrder),
    [activeVariants, variantRankOrder],
  );
  const useHierarchicalPicker = hierarchy.length >= 1;

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    const first = activeVariants[0];
    return first?.id ?? null;
  });
  const [optionSelections, setOptionSelections] = useState<Record<string, string>>({});
  const pickerInitKeyRef = useRef('');

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

  useEffect(() => {
    pickerInitKeyRef.current = '';
  }, [product.id]);

  useEffect(() => {
    if (!useHierarchicalPicker || activeVariants.length === 0) return;
    const key = `${product.id}|${hierarchy.join('\0')}|${activeVariants.map((v) => v.id).join(',')}|${JSON.stringify(variantValueOrders)}`;
    if (pickerInitKeyRef.current === key) return;
    pickerInitKeyRef.current = key;

    const base = activeVariants[0];
    const next: Record<string, string> = {};
    for (const h of hierarchy) {
      const val = getVariantOptionValue(base.name, h);
      if (val) next[h] = val;
    }
    for (let i = 1; i < hierarchy.length; i++) {
      const pool = activeVariants.filter((v) => {
        for (let j = 0; j < i; j++) {
          const keyOpt = hierarchy[j];
          const want = next[keyOpt];
          if (!want) return false;
          if (getVariantOptionValue(v.name, keyOpt) !== want) return false;
        }
        return true;
      });
      const optKey = hierarchy[i];
      const rawVals = [
        ...new Set(
          pool
            .map((v) => getVariantOptionValue(v.name, optKey))
            .filter((x): x is string => Boolean(x)),
        ),
      ];
      const vals = orderVariantValuesForDisplay(rawVals, optKey, variantValueOrders[optKey]);
      if (!next[optKey] || !vals.includes(next[optKey])) {
        next[optKey] = vals[0] ?? '';
      }
    }
    setOptionSelections(next);
  }, [product.id, useHierarchicalPicker, activeVariants, hierarchy, variantValueOrders]);

  const handleOptionChange = useCallback(
    (depth: number, value: string) => {
      setOptionSelections((prev) => {
        const next = { ...prev, [hierarchy[depth]]: value };
        for (let i = depth + 1; i < hierarchy.length; i++) {
          const pool = activeVariants.filter((v) => {
            for (let j = 0; j < i; j++) {
              const key = hierarchy[j];
              const want = next[key];
              if (!want) return false;
              if (getVariantOptionValue(v.name, key) !== want) return false;
            }
            return true;
          });
          const optKey = hierarchy[i];
          const rawVals = [
            ...new Set(
              pool
                .map((v) => getVariantOptionValue(v.name, optKey))
                .filter((x): x is string => Boolean(x)),
            ),
          ];
          const vals = orderVariantValuesForDisplay(rawVals, optKey, variantValueOrders[optKey]);
          next[optKey] = vals[0] ?? '';
        }
        return next;
      });
    },
    [hierarchy, activeVariants, variantValueOrders],
  );

  const effectiveSelectedVariant = useMemo(() => {
    if (activeVariants.length === 0) return undefined;
    if (useHierarchicalPicker) {
      const matches = activeVariants.filter((v) =>
        hierarchy.every((h) => {
          const sel = optionSelections[h];
          return sel && getVariantOptionValue(v.name, h) === sel;
        }),
      );
      return matches[0];
    }
    return activeVariants.find((v) => v.id === selectedVariantId) ?? activeVariants[0];
  }, [activeVariants, useHierarchicalPicker, hierarchy, optionSelections, selectedVariantId]);

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

  const accordionSections = useMemo(() => {
    const sections: { id: string; title: string; body: string }[] = [];
    if (descriptionText) {
      sections.push({ id: 'description', title: 'Description', body: descriptionText });
    }
    if (productDetails) {
      sections.push({
        id: 'product-details',
        title: 'Product Details',
        body: productDetails,
      });
    }
    if (sizeFit) {
      sections.push({ id: 'size-fit', title: 'Size & Fit', body: sizeFit });
    }
    return sections;
  }, [descriptionText, productDetails, sizeFit]);

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    if (photos.length === 0) {
      setSelectedImageIndex(0);
      return;
    }
    setSelectedImageIndex((i) => (i >= photos.length ? 0 : i));
  }, [photos.length]);

  const mainSrc = photos[selectedImageIndex] ?? photos[0] ?? null;

  const displayPrice = effectiveSelectedVariant?.price ?? product.base_price ?? 0;
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
      unitPrice: variant.price ?? product.base_price ?? 0,
      qty: quantityNum,
      weightKgPerUnit,
    });
    toast({
      title: 'Added to cart',
      description: `${product.title}${variantLabel ? ` (${variantLabel})` : ''} x${quantityNum}`,
    });
  };

  const openAccordionDefaults = accordionSections.map((s) => s.id);

  return (
    <div className="space-y-10 md:space-y-14">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        {/* Gallery */}
        <div className="w-full">
          <div className="flex flex-col-reverse lg:flex-row gap-4 lg:gap-5">
            {photos.length > 1 && (
              <div
                className="
                  flex flex-row lg:flex-col gap-2 lg:gap-3
                  overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto lg:max-h-[min(85vh,640px)]
                  w-full lg:w-[76px] shrink-0 lg:shrink-0
                  pb-1 lg:pb-0
                  -mx-1 px-1 lg:mx-0 lg:px-0
                "
              >
                {photos.map((p, i) => (
                  <button
                    key={`${p}-${i}`}
                    type="button"
                    onClick={() => setSelectedImageIndex(i)}
                    className={`
                      flex-shrink-0 w-16 h-16 lg:w-[76px] lg:h-[76px] rounded-xl overflow-hidden border-2 transition-colors
                      ${
                        selectedImageIndex === i
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-transparent hover:border-muted-foreground/30'
                      }
                    `}
                  >
                    <img src={p} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div
              className="aspect-square w-full rounded-2xl overflow-hidden bg-muted flex items-center justify-center min-w-0 flex-1"
              style={{ borderColor: 'rgba(14,122,58,0.14)', borderWidth: 1 }}
            >
              {mainSrc ? (
                <img
                  src={mainSrc}
                  alt={product.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm text-muted-foreground">No image</span>
              )}
            </div>
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
            <p className="text-xl md:text-2xl font-semibold" style={{ color: '#0E7A3A' }}>
              {displayPrice > 0 ? formatPrice(displayPrice) : 'Free'}
            </p>
          </div>

          {hasMultipleVariants &&
            (useHierarchicalPicker ? (
              <div className="space-y-4">
                {hierarchy.map((optionName, depth) => {
                  const filtered = activeVariants.filter((v) => {
                    for (let j = 0; j < depth; j++) {
                      const key = hierarchy[j];
                      const sel = optionSelections[key];
                      if (!sel) return false;
                      if (getVariantOptionValue(v.name, key) !== sel) return false;
                    }
                    return true;
                  });
                  const rawChoices = [
                    ...new Set(
                      filtered
                        .map((v) => getVariantOptionValue(v.name, optionName))
                        .filter((x): x is string => Boolean(x)),
                    ),
                  ];
                  const choices = orderVariantValuesForDisplay(
                    rawChoices,
                    optionName,
                    variantValueOrders[optionName],
                  );
                  const current = optionSelections[optionName] ?? choices[0] ?? '';

                  return (
                    <div key={optionName} className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        style={{ color: '#0F1F17' }}
                      >
                        {optionName}
                      </label>
                      {choices.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No options</p>
                      ) : (
                        <Select
                          value={current}
                          onValueChange={(v) => handleOptionChange(depth, v)}
                        >
                          <SelectTrigger className="w-full rounded-2xl">
                            <SelectValue placeholder={`Select ${optionName}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {choices.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                  Variant
                </label>
                <Select
                  value={selectedVariantId || ''}
                  onValueChange={(v) => setSelectedVariantId(v)}
                >
                  <SelectTrigger className="w-full rounded-2xl">
                    <SelectValue placeholder="Select variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVariants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.price != null && v.price > 0 ? ` - ${formatPrice(v.price)}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

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

      {accordionSections.length > 0 && (
        <section
          className="border-t pt-2"
          style={{ borderColor: 'rgba(0,0,0,0.1)' }}
          aria-label="Product information"
        >
          <Accordion
            type="multiple"
            defaultValue={openAccordionDefaults}
            className="w-full"
          >
            {accordionSections.map((s) => (
              <AccordionItem key={s.id} value={s.id} className="border-muted">
                <AccordionTrigger
                  className="text-base hover:no-underline py-4"
                  style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
                >
                  {s.title}
                </AccordionTrigger>
                <AccordionContent>
                  <div
                    className="prose prose-sm max-w-none whitespace-pre-wrap pb-2"
                    style={{ color: 'rgba(15,31,23,0.85)' }}
                  >
                    {s.body}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}

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
