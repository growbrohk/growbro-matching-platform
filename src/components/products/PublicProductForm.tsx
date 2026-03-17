import { useState } from 'react';
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
import { MessageSquare } from 'lucide-react';
import type { Product, ProductVariant } from '@/lib/types';

interface Org {
  id: string;
  name: string;
  slug?: string | null;
}

interface PublicProductFormProps {
  product: Product;
  variants: ProductVariant[];
  org: Org;
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
}: PublicProductFormProps) {
  const navigate = useNavigate();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? variants[0].id : null
  );
  const [quantity, setQuantity] = useState(1);

  // Get images - prefer image_url (photo upload/URL), fallback to metadata
  const imageUrl = (product as any).image_url;
  const photos: string[] = imageUrl
    ? [imageUrl]
    : product.metadata?.photos && Array.isArray(product.metadata.photos)
      ? product.metadata.photos
      : product.metadata?.image
        ? [product.metadata.image]
        : [];
  const mainImage = photos[0] || null;
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  const displayPrice =
    selectedVariant?.price ?? product.base_price ?? 0;
  const hasMultipleVariants = variants.length > 1;

  const handleContactBrand = () => {
    navigate(`/messages/new?toOrg=${org.id}`);
  };

  const quantityNum = Math.max(1, Math.min(99, quantity));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
      {/* Image gallery */}
      <div className="space-y-4">
        <div
          className="aspect-square w-full rounded-2xl overflow-hidden bg-muted flex items-center justify-center"
          style={{ borderColor: 'rgba(14,122,58,0.14)', borderWidth: 1 }}
        >
          {(mainImage || photos[0]) ? (
            <img
              src={photos[selectedImageIndex] || mainImage || photos[0]}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm text-muted-foreground">No image</span>
          )}
        </div>
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {photos.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedImageIndex(i)}
                className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                  selectedImageIndex === i
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-transparent hover:border-muted-foreground/30'
                }`}
              >
                <img
                  src={p}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="space-y-6">
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

        {/* Variant selector */}
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

        {/* Quantity */}
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

        {/* CTA - Contact for enquiry (MVP) */}
        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={handleContactBrand}
            size="lg"
            className="w-full h-12 rounded-2xl font-bold"
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Contact for enquiry
          </Button>
          <p className="text-sm text-muted-foreground">
            Message the brand directly to enquire or purchase this product.
          </p>
        </div>
      </div>

      {/* Description - below on mobile, or in a second row */}
      {product.description && (
        <div className="md:col-span-2 pt-8 border-t" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: '#0F1F17' }}>
            Description
          </h2>
          <div
            className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap"
            style={{ color: 'rgba(15,31,23,0.8)' }}
          >
            {product.description}
          </div>
        </div>
      )}
    </div>
  );
}
