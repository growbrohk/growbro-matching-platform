/**
 * Public product checkout page - Cart review + contact info + create order
 * Route: /:orgSlug/checkout
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Minus, Plus, Trash2, ShoppingCart, Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePublicCart } from '@/contexts/PublicCartContext';
import { ContactInfoCard } from '@/components/booking/ContactInfoCard';
import { createProductOrder } from '@/lib/api/product-checkout';
import { getOrgBySlugWithProfile } from '@/lib/api/orgs';
import type { ContactInfo } from '@/lib/types/booking';

const BRAND = {
  green: '#0E7A3A',
  beigeSoft: '#FBF8F4',
  dark: '#0F1F17',
};

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function PublicCheckoutPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { orgId, setOrgId, cart, updateItemQty, removeItem, totalQty, total, clearCart } = usePublicCart();
  const [org, setOrg] = useState<{ id: string; name: string; slug: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BRAND.beigeSoft }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND.green }} />
      </div>
    );
  }

  if (!org) return null;

  if (cart.length === 0 && !loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: BRAND.beigeSoft }}>
        <div className="container mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => navigate(`/${orgSlug}`)}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="text-center py-16">
            <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50" style={{ color: BRAND.green }} />
            <h2 className="text-xl font-semibold mb-2" style={{ color: BRAND.dark }}>
              Your cart is empty
            </h2>
            <p className="text-muted-foreground mb-6">
              Add some products to get started
            </p>
            <Button
              onClick={() => navigate(`/${orgSlug}`)}
              style={{ backgroundColor: BRAND.green, color: 'white' }}
            >
              Continue shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: BRAND.beigeSoft }}>
      <div className="container mx-auto px-4 py-6">
        <Button
          variant="ghost"
          onClick={() => navigate(`/${orgSlug}`)}
          className="mb-6 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to {org.name}
        </Button>

        <h1 className="text-2xl font-bold mb-6" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
          Checkout
        </h1>

        {/* Cart items */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-4" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
              Order summary ({totalQty} {totalQty === 1 ? 'item' : 'items'})
            </h2>
            <div className="space-y-4">
              {cart.map((item, index) => (
                <div
                  key={`${item.productId}-${item.variantId || 'nv'}-${index}`}
                  className="flex items-start justify-between gap-4 py-3 border-b last:border-0"
                  style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium" style={{ color: BRAND.dark }}>
                      {item.name}
                    </div>
                    {item.variantLabel && (
                      <div className="text-sm text-muted-foreground">{item.variantLabel}</div>
                    )}
                    <div className="text-sm font-semibold mt-1" style={{ color: BRAND.green }}>
                      {formatPrice(item.unitPrice)} each
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateItemQty(index, -1)}
                        disabled={isSubmitting}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.qty}</span>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeItem(index)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-lg font-semibold pt-4 mt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <span style={{ color: BRAND.dark }}>Total</span>
              <span style={{ color: BRAND.green }}>{formatPrice(total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Contact info */}
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
          />
        </div>
      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 border-t p-4 safe-area-bottom"
        style={{ backgroundColor: BRAND.beigeSoft, borderColor: 'rgba(14,122,58,0.14)' }}
      >
        <div className="container mx-auto">
          <Button
            className="w-full text-white h-12 text-base font-semibold"
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
