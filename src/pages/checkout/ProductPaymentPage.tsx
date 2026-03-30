/**
 * Product payment page - Stripe, PayMe, FPS
 * Route: /:orgSlug/checkout/payment/:orderId
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import BrandPublicHeader from '@/components/brand-public/BrandPublicHeader';
import { getOrgBySlugWithProfile, type OrgWithProfile } from '@/lib/api/orgs';
import { getOrderWithOrgAndProducts } from '@/lib/api/product-checkout';
import { submitManualPayment } from '@/lib/payments/submitManualPayment';
import { getProductCheckoutRoute } from '@/lib/utils/product-checkout-route';
import { compressReceiptImage } from '@/lib/images/compressReceiptImage';
import { ContactInfoCard } from '@/components/booking/ContactInfoCard';
import { PaymentMethodSelector, type PaymentMethod } from '@/components/booking/PaymentMethodSelector';
import { supabase } from '@/integrations/supabase/client';
import type { ContactInfo } from '@/lib/types/booking';
import type { OrderWithOrgAndProducts } from '@/lib/api/product-checkout';

const BRAND = {
  green: '#0E7A3A',
  beigeSoft: '#FBF8F4',
  dark: '#0F1F17',
};

const PANEL_BORDER = 'rgba(14,122,58,0.14)';

function formatPrice(amount: number, currency = 'HKD'): string {
  return `${currency === 'HKD' ? 'HK$' : currency} ${amount.toFixed(2)}`;
}

export default function ProductPaymentPage() {
  const { orgSlug, orderId } = useParams<{ orgSlug: string; orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<OrderWithOrgAndProducts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const redirectedRef = useRef(false);
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [profileOrg, setProfileOrg] = useState<OrgWithProfile | null>(null);

  useEffect(() => {
    if (!orderId || !orgSlug) {
      navigate('/');
      return;
    }

    const fetchOrder = async () => {
      try {
        const orderData = await getOrderWithOrgAndProducts(orderId);
        if (!orderData) {
          toast({
            title: 'Order not found',
            description: 'The order you are looking for does not exist.',
            variant: 'destructive',
          });
          navigate(`/${orgSlug}`);
          return;
        }

        setData(orderData);
        setContactInfo({
          firstName: orderData.order.buyer_first_name || '',
          lastName: orderData.order.buyer_last_name || '',
          email: orderData.order.buyer_email || '',
          phone: orderData.order.buyer_phone || '',
        });
        try {
          const orgProfile = await getOrgBySlugWithProfile(orgSlug);
          setProfileOrg(orgProfile);
        } catch {
          setProfileOrg(null);
        }
        setLoading(false);

        if (redirectedRef.current) return;

        const route = getProductCheckoutRoute(orderData.order);
        if (route !== 'payment') {
          redirectedRef.current = true;
          if (route === 'success') {
            navigate(`/${orgSlug}/checkout/success/${orderId}`, { replace: true });
          } else if (route === 'pending') {
            navigate(`/${orgSlug}/checkout/pending/${orderId}`, { replace: true });
          } else {
            navigate(`/${orgSlug}/checkout/success/${orderId}`, { replace: true });
          }
        }
      } catch (err: any) {
        console.error('Error fetching order:', err);
        toast({
          title: 'Error',
          description: err?.message || 'Failed to load order.',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, orgSlug, navigate, toast]);

  const selectMethod = (method: PaymentMethod) => {
    if (selectedPaymentMethod !== method) setReceiptFile(null);
    setSelectedPaymentMethod(method);
  };

  const handleReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image (JPEG, PNG, WebP) or PDF file.',
        variant: 'destructive',
      });
      return;
    }

    if (file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'PDF must be under 10MB.', variant: 'destructive' });
        return;
      }
      setReceiptFile(file);
      return;
    }

    if (file.type.startsWith('image/')) {
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'File too large', description: 'Image must be under 10MB.', variant: 'destructive' });
        return;
      }
      setIsCompressing(true);
      try {
        const compressedFile = await compressReceiptImage(file, {
          targetSizeBytes: 500 * 1024,
          maxDimension: 1000,
        });
        if (compressedFile.size > 500 * 1024) {
          toast({
            title: 'Compression failed',
            description: 'Image too large. Try another or upload as PDF.',
            variant: 'destructive',
          });
        } else {
          setReceiptFile(compressedFile);
        }
      } catch {
        toast({
          title: 'Compression failed',
          description: 'Please try another image or upload PDF',
          variant: 'destructive',
        });
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleStripePayment = async () => {
    if (!orderId) return;
    setIsSubmitting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('create-stripe-checkout-session', {
        body: { order_id: orderId },
      });
      if (error) throw new Error(error.message || 'Failed to create checkout session');
      const url = res?.url;
      if (!url || typeof url !== 'string') throw new Error('Invalid response');
      window.location.href = url;
    } catch (err: unknown) {
      toast({
        title: 'Payment error',
        description: err instanceof Error ? err.message : 'Failed to start payment.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualPaymentSubmit = async () => {
    if (!orderId || !selectedPaymentMethod || !receiptFile || !data) {
      toast({
        title: 'Missing information',
        description: 'Please select a payment method and upload a receipt.',
        variant: 'destructive',
      });
      return;
    }
    if (data.order.total_amount <= 0) {
      navigate(`/${orgSlug}/checkout/success/${orderId}`, { replace: true });
      return;
    }
    if (selectedPaymentMethod !== 'payme' && selectedPaymentMethod !== 'fps') {
      toast({
        title: 'Invalid payment method',
        description: 'Please select PayMe or FPS for manual payment.',
        variant: 'destructive',
      });
      return;
    }

    const paymentLink = selectedPaymentMethod === 'payme' ? data.org.payme_link : data.org.fps_link;
    if (!paymentLink) {
      toast({
        title: 'Configuration error',
        description: 'Payment link not configured.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitManualPayment({
        orderId,
        paymentMethod: selectedPaymentMethod,
        receiptFile,
        paymentReferenceLink: paymentLink,
      });
      toast({
        title: 'Payment submitted',
        description: 'Waiting for seller confirmation...',
      });
      navigate(`/${orgSlug}/checkout/pending/${orderId}`, { replace: true });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to submit payment.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContactInfoUpdate = async (info: ContactInfo) => {
    if (!orderId) return;
    try {
      const { error } = await supabase.rpc('update_order_contact_info' as any, {
        p_order_id: orderId,
        p_buyer_first_name: info.firstName || null,
        p_buyer_last_name: info.lastName || null,
        p_buyer_email: info.email?.trim() ? info.email.trim().toLowerCase() : null,
        p_buyer_phone: info.phone || null,
      });
      if (error) throw error;
      setContactInfo(info);
      const updated = await getOrderWithOrgAndProducts(orderId);
      if (updated) setData(updated);
      toast({ title: 'Contact info updated' });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to update contact info.',
        variant: 'destructive',
      });
    }
  };

  const handleCTAClick = () => {
    if (selectedPaymentMethod === 'stripe') handleStripePayment();
    else if (selectedPaymentMethod === 'payme' || selectedPaymentMethod === 'fps') handleManualPaymentSubmit();
    else {
      toast({
        title: 'Select payment method',
        description: 'Please select a payment method first.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND.green }} />
      </div>
    );
  }

  if (!data) return null;

  const { order, org, order_items } = data;
  const totalAmount = Number(order.total_amount);
  const currency = order.currency || 'HKD';

  const availablePaymentMethods: PaymentMethod[] = [];
  if (org.enable_stripe) availablePaymentMethods.push('stripe');
  if (org.enable_payme && org.payme_link) availablePaymentMethods.push('payme');
  if (org.enable_fps && org.fps_link) availablePaymentMethods.push('fps');

  // Free order - redirect to success
  if (totalAmount <= 0) {
    navigate(`/${orgSlug}/checkout/success/${orderId}`, { replace: true });
    return null;
  }

  const headerOrg = profileOrg ?? {
    id: org.id,
    name: org.name,
    slug: org.slug,
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <BrandPublicHeader
        org={headerOrg}
        profile={profileOrg?.profile ?? null}
        showBackLink={true}
        isOwner={false}
      />

      <div className="w-full max-w-7xl mx-auto px-4 py-8 md:py-12">
        <h1 className="text-2xl md:text-3xl font-bold mb-6" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
          Payment
        </h1>

        <div className="mb-6">
          <h2 className="text-5xl font-bold mb-2" style={{ color: BRAND.green, fontFamily: "'Inter Tight', sans-serif" }}>
            {formatPrice(totalAmount, currency)}
          </h2>
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>Total amount</p>
        </div>

        <div
          className="rounded-2xl border bg-background p-5 md:p-6 mb-6"
          style={{ borderColor: PANEL_BORDER }}
        >
          <p className="font-semibold text-lg mb-2" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
            Order from {org.name}
          </p>
          <p className="text-sm text-muted-foreground mb-4">Order #{order.order_no}</p>
          <div className="border-t pt-4" style={{ borderColor: PANEL_BORDER }}>
            <p className="text-sm font-medium text-muted-foreground mb-2">Items</p>
            <div className="space-y-1">
              {order_items.map((item, idx) => (
                <p key={idx} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  {item.quantity}x {item.product_name}
                  {item.variant_label ? ` (${item.variant_label})` : ''}
                </p>
              ))}
            </div>
          </div>
          {(() => {
            const meta = order.metadata as Record<string, unknown> | undefined;
            const dm = meta?.delivery_method;
            if (!dm || typeof dm !== 'string') return null;
            const shippingFee = Number(meta?.shipping_fee ?? 0);
            const kg = meta?.shipping_weight_kg;
            const kgLabel = kg != null && kg !== '' ? String(kg) : null;
            const billableKg = meta?.shipping_billable_kg;
            const billableLabel =
              billableKg != null && billableKg !== '' && dm !== 'event_pickup'
                ? String(billableKg)
                : null;
            const rate = meta?.shipping_rate_per_kg;
            const det = meta?.delivery_details as Record<string, unknown> | undefined;
            const methodLabel =
              dm === 'door'
                ? 'Deliver to door'
                : dm === 'sf_locker'
                  ? 'SF Locker'
                  : dm === 'event_pickup'
                    ? 'Pick up at event'
                    : dm;
            return (
              <div className="border-t pt-4 mt-4" style={{ borderColor: PANEL_BORDER }}>
                <p className="text-sm font-medium text-muted-foreground mb-2">Delivery</p>
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  {methodLabel}
                  {billableLabel != null
                    ? ` · ${billableLabel} kg billed`
                    : kgLabel != null && dm !== 'event_pickup'
                      ? ` · ${kgLabel} kg`
                      : ''}
                  {rate != null && Number(rate) > 0 ? ` @ HK$${Number(rate)}/kg` : ''}
                </p>
                {billableLabel != null &&
                  kgLabel != null &&
                  dm !== 'event_pickup' &&
                  Number(kg) !== Number(billableKg) && (
                    <p className="text-xs mt-1" style={{ color: 'rgba(15,31,23,0.55)' }}>
                      Actual weight: {kgLabel} kg
                    </p>
                  )}
                {shippingFee > 0 && (
                  <p className="text-sm mt-1 tabular-nums" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Shipping: {formatPrice(shippingFee, currency)}
                  </p>
                )}
                {dm === 'door' && det && (
                  <p className="text-sm mt-2 whitespace-pre-line" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    {[det.country, det.building, det.street, det.region, det.district]
                      .filter((x) => typeof x === 'string' && x.trim())
                      .join(', ')}
                  </p>
                )}
                {dm === 'sf_locker' && det && (
                  <p className="text-sm mt-2 whitespace-pre-line" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    {typeof det.sf_locker_address === 'string' ? det.sf_locker_address : ''}
                    {typeof det.sf_locker_code === 'string' && det.sf_locker_code
                      ? ` (Code: ${det.sf_locker_code})`
                      : ''}
                  </p>
                )}
                {dm === 'event_pickup' && (
                  <p className="text-sm mt-2" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Please DM IG to arrange pick up.
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: BRAND.green }} />
            <h3 className="text-base font-semibold" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
              Contact info
            </h3>
          </div>
          <ContactInfoCard
            contactInfo={contactInfo}
            onUpdate={handleContactInfoUpdate}
            title="Contact info"
            description="For payment receipts and order updates"
            showPhone={true}
            requiredFields={{ firstName: true, lastName: true, email: false, phone: false }}
            alwaysExpanded
          />
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4">
        <PaymentMethodSelector
          availableMethods={availablePaymentMethods}
          selectedMethod={selectedPaymentMethod}
          onSelect={selectMethod}
          receiptFile={receiptFile}
          onReceiptChange={handleReceiptChange}
          paymentLinks={{ payme: org.payme_link, fps: org.fps_link }}
          isCompressing={isCompressing}
        />
      </div>

      {availablePaymentMethods.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 border-t p-4 safe-area-bottom"
          style={{ backgroundColor: BRAND.beigeSoft, borderColor: PANEL_BORDER }}
        >
          <div className="max-w-7xl mx-auto px-4">
            <Button
              className="w-full text-white h-12 text-base font-bold rounded-2xl"
              style={{ backgroundColor: BRAND.green, fontFamily: "'Inter Tight', sans-serif" }}
              onClick={handleCTAClick}
              disabled={
                isSubmitting ||
                isCompressing ||
                !selectedPaymentMethod ||
                (selectedPaymentMethod !== 'stripe' && !receiptFile)
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : selectedPaymentMethod === 'stripe' ? (
                'Pay now'
              ) : selectedPaymentMethod === 'payme' || selectedPaymentMethod === 'fps' ? (
                "I've Paid"
              ) : (
                'Select payment method'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
