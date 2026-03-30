/**
 * Public product checkout page - Cart review + contact info + create order
 * Route: /:orgSlug/checkout
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Minus, Plus, ShoppingCart, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePublicCart } from '@/contexts/PublicCartContext';
import { ContactInfoCard } from '@/components/booking/ContactInfoCard';
import BrandPublicHeader from '@/components/brand-public/BrandPublicHeader';
import { createProductOrder } from '@/lib/api/product-checkout';
import {
  getPhysicalProductSummariesForOrg,
  relatedProductCardImageUrl,
  type RelatedProductSummary,
} from '@/lib/api/products';
import { getOrgBySlugWithProfile, type OrgWithProfile } from '@/lib/api/orgs';
import type { ContactInfo } from '@/lib/types/booking';

const BRAND = {
  green: '#0E7A3A',
  beigeSoft: '#FBF8F4',
  dark: '#0F1F17',
};

const PANEL_BORDER = 'rgba(14,122,58,0.14)';

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatCarouselPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function YouMayAlsoLikeCarousel({
  products,
  orgSlug,
}: {
  products: RelatedProductSummary[];
  orgSlug: string;
}) {
  const navigate = useNavigate();
  if (products.length === 0) return null;

  return (
    <section aria-label="You may also like" className="mt-10 md:mt-14">
      <h2
        className="text-lg md:text-xl font-semibold mb-4 md:mb-6"
        style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}
      >
        You may also like
      </h2>
      <div className="flex gap-4 lg:gap-6 overflow-x-auto pb-4 -mx-1 px-1 scrollbar-hide">
        {products.map((p) => {
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
                  <img src={img} alt={p.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-xs text-muted-foreground px-2 text-center">{p.title}</span>
                  </div>
                )}
              </div>
              <div className="p-3 lg:p-4 bg-background">
                <p className="font-medium text-sm lg:text-base truncate" style={{ color: BRAND.dark }}>
                  {p.title}
                </p>
                {price > 0 && (
                  <p className="text-sm lg:text-base font-semibold mt-0.5" style={{ color: BRAND.green }}>
                    {formatCarouselPrice(price)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function PublicCheckoutPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setOrgId, cart, updateItemQty, removeItem, totalQty, total, clearCart } = usePublicCart();
  const [org, setOrg] = useState<OrgWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedProducts, setRelatedProducts] = useState<RelatedProductSummary[]>([]);
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cartProductKey = useMemo(() => cart.map((c) => c.productId).sort().join(','), [cart]);

  useEffect(() => {
    if (!orgSlug) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const orgData = await getOrgBySlugWithProfile(orgSlug);
        if (!orgData) {
          navigate('/');
          return;
        }
        setOrg(orgData);
        setOrgId(orgData.id);
      } catch {
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orgSlug, navigate, setOrgId]);

  useEffect(() => {
    if (!org?.id) return;
    const profile = org.profile as { products_filter?: string } | null | undefined;
    const inSaleOnly = profile?.products_filter === 'in_sale_only';
    const excludeIds = cart.map((c) => c.productId);
    let cancelled = false;
    (async () => {
      try {
        const related = await getPhysicalProductSummariesForOrg(org.id, {
          inSaleOnly,
          limit: 12,
          excludeIds,
        });
        if (!cancelled) setRelatedProducts(related);
      } catch (e) {
        console.error('Error loading related products:', e);
        if (!cancelled) setRelatedProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org?.id, org?.profile, cartProductKey]);

  const handleContactUpdate = (info: ContactInfo) => {
    setContactInfo(info);
  };

  const handleProceedToPayment = async () => {
    if (!org?.id || cart.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add items to your cart',
        variant: 'destructive',
      });
      return;
    }

    if (!contactInfo.firstName?.trim() || !contactInfo.lastName?.trim()) {
      toast({
        title: 'Contact info required',
        description: 'Please enter your first and last name',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const items = cart.map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId || null,
        qty: item.qty,
        unit_price: item.unitPrice,
        product_name: item.name,
        variant_label: item.variantLabel || null,
      }));

      const orderId = await createProductOrder(org.id, items, {
        first_name: contactInfo.firstName.trim(),
        last_name: contactInfo.lastName.trim(),
        email: contactInfo.email?.trim() || null,
        phone: contactInfo.phone?.trim() || null,
      });

      clearCart();
      navigate(`/${orgSlug}/checkout/payment/${orderId}`);
    } catch (err: any) {
      console.error('Create order error:', err);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to create order. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND.green }} />
      </div>
    );
  }

  if (!org || !orgSlug) return null;

  if (cart.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <BrandPublicHeader org={org} profile={org.profile} showBackLink={true} isOwner={false} />
        <div className="w-full max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="text-center py-16">
            <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50" style={{ color: BRAND.green }} />
            <h1
              className="text-2xl md:text-3xl font-bold mb-2"
              style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}
            >
              Bag
            </h1>
            <p className="text-muted-foreground mb-6" style={{ color: 'rgba(15,31,23,0.72)' }}>
              There are no items in your bag.
            </p>
            <Button
              onClick={() => navigate(`/${orgSlug}`)}
              className="rounded-2xl h-12 px-8 font-bold"
              style={{ backgroundColor: BRAND.green, color: 'white' }}
            >
              Continue shopping
            </Button>
          </div>
          <YouMayAlsoLikeCarousel products={relatedProducts} orgSlug={orgSlug} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      <BrandPublicHeader org={org} profile={org.profile} showBackLink={true} isOwner={false} />

      <div className="w-full max-w-7xl mx-auto px-4 py-8 md:py-12">
        <h1
          className="text-2xl md:text-3xl font-bold mb-2"
          style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}
        >
          Bag
        </h1>

        <div
          className="rounded-2xl border bg-background p-5 md:p-6 mb-6"
          style={{ borderColor: PANEL_BORDER }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
            <h2
              className="text-base font-semibold"
              style={{ fontFamily: "'Inter Tight', sans-serif", color: BRAND.dark }}
            >
              My bag
            </h2>
            <p className="text-sm tabular-nums" style={{ color: 'rgba(15,31,23,0.72)' }}>
              {totalQty} {totalQty === 1 ? 'item' : 'items'} | {formatPrice(total)}
            </p>
          </div>
          <div className="divide-y divide-[rgba(14,122,58,0.14)]">
            {cart.map((item, index) => (
              <div key={`${item.productId}-${item.variantId || 'nv'}-${index}`} className="py-4 first:pt-0">
                <div className="flex gap-3 md:gap-4">
                  <div
                    className="w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center border"
                    style={{ borderColor: PANEL_BORDER }}
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingCart className="h-8 w-8 text-muted-foreground/35" aria-hidden />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-medium" style={{ color: BRAND.dark }}>
                          {item.name}
                        </div>
                        {item.variantLabel && (
                          <div className="text-sm text-muted-foreground mt-0.5">{item.variantLabel}</div>
                        )}
                        <div className="text-sm font-semibold mt-1" style={{ color: BRAND.green }}>
                          {formatPrice(item.unitPrice)} each
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(index)}
                        disabled={isSubmitting}
                        aria-label="Remove item"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                      <div
                        className="flex items-center gap-1 rounded-xl border px-2 py-1"
                        style={{ borderColor: PANEL_BORDER }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateItemQty(index, -1)}
                          disabled={isSubmitting}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm text-muted-foreground px-1">
                          Qty <span className="font-medium text-foreground">{item.qty}</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateItemQty(index, 1)}
                          disabled={isSubmitting}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}
                      >
                        {formatPrice(item.unitPrice * item.qty)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div
            className="flex justify-between text-lg font-semibold pt-4 mt-2 border-t"
            style={{ borderColor: PANEL_BORDER }}
          >
            <span style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>Total</span>
            <span style={{ color: BRAND.green, fontFamily: "'Inter Tight', sans-serif" }}>
              {formatPrice(total)}
            </span>
          </div>
        </div>

        <YouMayAlsoLikeCarousel products={relatedProducts} orgSlug={orgSlug} />

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: BRAND.green }} />
            <h3 className="text-base font-semibold" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
              Contact info
            </h3>
          </div>
          <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
            We'll use this for order updates and delivery
          </p>
          <ContactInfoCard
            contactInfo={contactInfo}
            onUpdate={handleContactUpdate}
            title="Contact info"
            description="Required for order confirmation"
            showPhone={true}
            requiredFields={{ firstName: true, lastName: true, email: false, phone: false }}
            alwaysExpanded
          />
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 border-t p-4 safe-area-bottom"
        style={{ backgroundColor: BRAND.beigeSoft, borderColor: PANEL_BORDER }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <Button
            className="w-full text-white h-12 text-base font-bold rounded-2xl"
            style={{ backgroundColor: BRAND.green, fontFamily: "'Inter Tight', sans-serif" }}
            onClick={handleProceedToPayment}
            disabled={isSubmitting || cart.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Proceed to payment – ${formatPrice(total)}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
