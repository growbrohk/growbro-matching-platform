import { useState, useEffect, useMemo } from 'react';
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
import type { Product, ProductVariant } from '@/lib/types';
import { collectProductPhotoUrls } from '@/lib/utils/product-media';

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
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? variants[0].id : null,
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

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  const displayPrice = selectedVariant?.price ?? product.base_price ?? 0;
  const hasMultipleVariants = variants.length > 1;

  const quantityNum = Math.max(1, Math.min(99, quantity));

  const handleAddToCart = () => {
    const variant = selectedVariant || variants[0];
    if (!variant) {
      toast({
        title: 'Cannot add to cart',
        description: 'Please select a variant.',
        variant: 'destructive',
      });
      return;
    }
    const variantLabel = hasMultipleVariants ? variant.name : undefined;
    addItem({
      productId: product.id,
      variantId: variant.id,
      name: product.title,
      variantLabel,
      imageUrl: mainSrc,
      unitPrice: variant.price ?? product.base_price ?? 0,
      qty: quantityNum,
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
              {hasMultipleVariants && displayPrice > 0 && (
                <span className="text-base font-normal text-muted-foreground ml-1">
                  (per variant)
                </span>
              )}
            </p>
          </div>

          {hasMultipleVariants && (
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
                  {variants
                    .filter((v) => v.active !== false)
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.price != null && v.price > 0 ? ` - ${formatPrice(v.price)}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
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
