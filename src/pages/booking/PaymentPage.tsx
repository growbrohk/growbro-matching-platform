/**
 * Page 3: Payment Page
 * 
 * Handles payment for orders with amount_total > 0.
 * Only accessible when:
 * - amount_total > 0
 * - payment_status = 'unpaid'
 * 
 * Supports:
 * - Stripe (card payment) → redirects to success on completion
 * - PayMe (manual with receipt) → redirects to pending
 * - FPS (manual with receipt) → redirects to pending
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { submitManualPayment } from '@/lib/payments/submitManualPayment';
import { formatTicketTypeDateTime, formatEventDate, formatEventTime } from '@/lib/utils/datetime';
import { getValidForDaysLabel } from '@/lib/utils/event-time-slots';
import { getBookingRoute } from '@/lib/utils/booking-route';
import { compressReceiptImage } from '@/lib/images/compressReceiptImage';
import { Loader2 } from 'lucide-react';
import { PaymentMethodSelector, type PaymentMethod } from '@/components/booking/PaymentMethodSelector';
import { supabase } from '@/integrations/supabase/client';
import { computeStripeCheckoutTotal, formatStripeFeeLabel } from '@/lib/orderCommission';

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
};

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<OrderWithEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!orderId) {
      navigate('/');
      return;
    }

    const fetchOrder = async () => {
      try {
        const orderData = await getOrderWithEvent(orderId);
        
        if (!orderData) {
          toast({
            title: 'Order not found',
            description: 'The order you are looking for does not exist.',
            variant: 'destructive',
          });
          navigate('/');
          return;
        }

        setOrder(orderData);

        setLoading(false);

        // Use unified routing logic with loading guard
        // Do NOT redirect until order fetch is finished and order is non-null
        if (redirectedRef.current) {
          return; // Already redirected, prevent multiple redirects
        }

        const route = getBookingRoute(orderData);

        console.debug('[booking-route]', {
          orderId,
          amount_total: orderData.total_amount,
          payment_status: orderData.payment_status,
          fulfillment_status: orderData.fulfillment_status,
          payment_method: orderData.payment_method,
          route,
          currentPage: 'payment',
        });

        // If route is not 'payment', redirect accordingly (one-way)
        if (route !== 'payment') {
          redirectedRef.current = true;
          if (route === 'success') {
            navigate(`/booking/success/${orderId}`, { replace: true });
          } else if (route === 'pending') {
            // Navigate to PendingConfirmationPage (not PendingBookingPage)
            navigate(`/booking/pending/${orderId}`, { replace: true });
          } else {
            // Fallback to success
            navigate(`/booking/success/${orderId}`, { replace: true });
          }
          return;
        }

        // Route is 'payment' - this page is correct, continue rendering
      } catch (error: any) {
        console.error('Error fetching order:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load order details.',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, navigate, toast]);

  const selectMethod = (method: PaymentMethod | null) => {
    if (selectedPaymentMethod !== method) {
      setReceiptFile(null); // Clear receipt file when switching payment methods
    }
    setSelectedPaymentMethod(method);
  };

  const handleReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image (JPEG, PNG, WebP) or PDF file.',
        variant: 'destructive',
      });
      return;
    }

    // Handle PDF files: keep as-is, enforce <= 10MB
    if (file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please upload a PDF file smaller than 10MB.',
          variant: 'destructive',
        });
        return;
      }
      setReceiptFile(file);
      return;
    }

    // Handle image files: compress to WebP
    if (file.type.startsWith('image/')) {
      // Check upload limit: <= 10MB before compression
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please upload an image smaller than 10MB.',
          variant: 'destructive',
        });
        return;
      }

      setIsCompressing(true);
      try {
        // Use 500KB target and 1000px max dimension so phone screenshots pass reliably
        const compressedFile = await compressReceiptImage(file, {
          targetSizeBytes: 500 * 1024,
          maxDimension: 1000,
        });
        
        // Enforce hard cap: post-compression <= 500KB (storage allows 10MB)
        if (compressedFile.size > 500 * 1024) {
          toast({
            title: 'Compression failed',
            description: 'Image is too large even after compression. Please try another image or upload as PDF.',
            variant: 'destructive',
          });
          setIsCompressing(false);
          return;
        }
        
        setReceiptFile(compressedFile);
        
        // Show compression success message
        const originalSizeKB = Math.round(file.size / 1024);
        const compressedSizeKB = Math.round(compressedFile.size / 1024);
        toast({
          title: 'Image compressed',
          description: `Compressed from ${originalSizeKB} KB to ${compressedSizeKB} KB`,
        });
      } catch (error) {
        console.error('Error compressing image:', error);
        toast({
          title: 'Compression failed',
          description: 'Compression failed, please try another image or upload PDF',
          variant: 'destructive',
        });
      } finally {
        setIsCompressing(false);
      }
      return;
    }
  };

  const handleStripePayment = async () => {
    if (!orderId) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout-session', {
        body: { order_id: orderId },
      });

      if (error) {
        throw new Error(error.message || 'Failed to create checkout session');
      }

      const url = data?.url;
      if (!url || typeof url !== 'string') {
        throw new Error('Invalid response from payment service');
      }

      window.location.href = url;
    } catch (error: unknown) {
      console.error('Stripe checkout error:', error);
      toast({
        title: 'Payment error',
        description: error instanceof Error ? error.message : 'Failed to start payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualPaymentSubmit = async () => {
    if (!orderId || !selectedPaymentMethod || !receiptFile || !order) {
      toast({
        title: 'Missing information',
        description: 'Please select a payment method and upload a receipt.',
        variant: 'destructive',
      });
      return;
    }

    // GUARD: Prevent receipt submission for free orders
    // This should never happen due to routing, but add explicit check for safety
    if (order.total_amount <= 0) {
      console.warn('[PaymentPage] Attempted to submit receipt for free order, redirecting to success');
      navigate(`/booking/success/${orderId}`, { replace: true });
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

    // No authentication required - receipt upload is unauthenticated

    setIsSubmitting(true);
    try {
      const paymentLink = selectedPaymentMethod === 'payme' 
        ? order.event.payme_link 
        : order.event.fps_link;

      if (!paymentLink) {
        throw new Error('Payment link not configured');
      }

      await submitManualPayment({
        orderId,
        paymentMethod: selectedPaymentMethod as 'payme' | 'fps',
        receiptFile,
        paymentReferenceLink: paymentLink,
      });

      // Payment submitted successfully:
      // - receipt_url saved
      // - payment_status='submitted' (NOT 'paid')
      // - submitted_at set
      // - payment_method set
      // - fulfillment_status='pending_confirmation' (kept as is)
      // - paid_at is NULL (host must confirm to set it)
      
      // Re-fetch order to get latest payment_status and submitted_at
      const updatedOrder = await getOrderWithEvent(orderId);
      
      if (!updatedOrder) {
        throw new Error('Failed to fetch updated order');
      }

      // Verify payment_status is now 'submitted'
      if (updatedOrder.payment_status !== 'submitted') {
        console.warn('[PaymentPage] Expected payment_status=submitted, got:', updatedOrder.payment_status);
      }

      toast({
        title: 'Payment submitted',
        description: 'Your payment receipt has been submitted. Waiting for host confirmation...',
      });

      // After submit_payment_receipt succeeds:
      // - receipt_url saved
      // - payment_status='submitted' (NOT 'paid')
      // - submitted_at set
      // - payment_method set
      // Navigate to PendingConfirmationPage (replace:true)
      navigate(`/booking/pending/${orderId}`, { replace: true });
    } catch (error: any) {
      console.error('Error submitting payment:', error);
      
      {
        toast({
          title: 'Error',
          description: error.message || 'Failed to submit payment. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCTAClick = () => {
    if (selectedPaymentMethod === 'stripe') {
      handleStripePayment();
    } else if (selectedPaymentMethod === 'payme' || selectedPaymentMethod === 'fps') {
      handleManualPaymentSubmit();
    } else {
      toast({
        title: 'Select payment method',
        description: 'Please select a payment method first.',
        variant: 'destructive',
      });
    }
  };

  const formatPrice = (amount: number, currency: string = 'HKD'): string => {
    return `${currency === 'HKD' ? 'HK$' : currency} ${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: BRAND.beigeSoft }}>
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!order) {
    return null; // Will redirect
  }

  const event = order.event;
  const subtotal = Number(order.total_amount);
  const currency = order.currency || 'HKD';
  const stripeFeeBearer = event.stripe_fee_bearer === 'user' ? 'user' : 'host';
  const stripeCheckout = computeStripeCheckoutTotal(subtotal, stripeFeeBearer);
  const showStripeFee =
    selectedPaymentMethod === 'stripe' && stripeFeeBearer === 'user' && stripeCheckout.serviceFee > 0;
  const displayAmount = showStripeFee ? stripeCheckout.grandTotal : subtotal;

  // Format date/time based on ticket types in order (not both days)
  const formatOrderDateTime = () => {
    const items = order.order_items || [];
    if (items.length === 0) {
      return event.start_at && event.end_at
        ? `${formatEventDate(event.start_at)} ${formatEventTime(event.start_at, event.end_at)}`
        : 'TBA';
    }
    const uniqueValidFor = [...new Set(
      items.map((oi) => oi.ticket_type?.valid_for_days || 'day_1')
    )];
    if (uniqueValidFor.length === 1) {
      return formatTicketTypeDateTime(event, { valid_for_days: uniqueValidFor[0] });
    }
    return uniqueValidFor
      .map((vf) => {
        const formatted = formatTicketTypeDateTime(event, { valid_for_days: vf });
        return `${getValidForDaysLabel(vf)}: ${formatted}`;
      })
      .join('; ');
  };

  // Determine available payment methods
  const availablePaymentMethods: PaymentMethod[] = [];
  if (event.enable_stripe) {
    availablePaymentMethods.push('stripe');
  }
  if (event.enable_payme && event.payme_link) {
    availablePaymentMethods.push('payme');
  }
  if (event.enable_fps && event.fps_link) {
    availablePaymentMethods.push('fps');
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: BRAND.beigeSoft }}>
      {/* Header */}
      <div className="container mx-auto px-4 pt-8 pb-6">
        <h1 className="text-2xl font-bold mb-6" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
          Payment
        </h1>

        {/* Price Display */}
        <div className="mb-6">
          <h2 className="text-5xl font-bold mb-2" style={{ color: BRAND.green, fontFamily: "'Inter Tight', sans-serif" }}>
            {formatPrice(displayAmount, currency)}
          </h2>
          {showStripeFee ? (
            <div className="text-sm space-y-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
              <p>Subtotal {formatPrice(subtotal, currency)} + service fee {formatPrice(stripeCheckout.serviceFee, currency)} ({formatStripeFeeLabel()})</p>
              <p>Total amount</p>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>Total amount</p>
          )}
        </div>

        {/* Event Summary */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="font-semibold text-lg" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
                  {event.title}
                </p>
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  {formatOrderDateTime()}
                </p>
                {event.location_text && (
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    {event.location_text}
                  </p>
                )}
              </div>

              {/* Tickets */}
              {order.order_items && order.order_items.length > 0 && (
                <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Tickets</p>
                  <div className="space-y-1">
                    {order.order_items.map((item, idx) => (
                      <p key={idx} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                        {item.quantity}x {item.ticket_type.name}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Add-ons */}
              {(order.order_addon_items?.length ?? 0) > 0 && (
                <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Add-ons</p>
                  <div className="space-y-1">
                    {(order.order_addon_items || []).map((a) => {
                      const ticketIdx = a.ticket_id
                        ? (order.tickets?.findIndex((t) => t.id === a.ticket_id) ?? -1) + 1
                        : 0;
                      return (
                        <p key={a.id} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                          {a.ticket_id && ticketIdx > 0 ? `Ticket ${ticketIdx}: ` : ''}
                          {a.label}
                          {a.variant_label && ` – ${a.variant_label}`} × {a.quantity}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contact on order (from checkout) */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: BRAND.green }} />
            <h3 className="text-base font-semibold" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
              Contact info
            </h3>
          </div>
          <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
            From checkout — used for receipts and order updates
          </p>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-muted-foreground mb-1">Contact</p>
              <p className="text-sm whitespace-pre-line" style={{ color: 'rgba(15,31,23,0.72)' }}>
                {(() => {
                  const name = [order.buyer_first_name, order.buyer_last_name].filter(Boolean).join(' ').trim();
                  const lines: string[] = [];
                  if (name) lines.push(name);
                  if (order.buyer_email?.trim()) lines.push(order.buyer_email.trim());
                  if (order.buyer_phone?.trim()) lines.push(order.buyer_phone.trim());
                  return lines.length ? lines.join('\n') : '—';
                })()}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="container mx-auto px-4">
        <PaymentMethodSelector
          availableMethods={availablePaymentMethods}
          selectedMethod={selectedPaymentMethod}
          onSelect={selectMethod}
          receiptFile={receiptFile}
          onReceiptChange={handleReceiptChange}
          paymentLinks={{ payme: event.payme_link, fps: event.fps_link }}
          isCompressing={isCompressing}
          stripeFeeBearer={stripeFeeBearer}
          orderSubtotal={subtotal}
          currency={currency}
        />
      </div>

      {/* Sticky CTA button */}
      {availablePaymentMethods.length > 0 && (
        <div 
          className="fixed bottom-0 left-0 right-0 border-t p-4 safe-area-bottom"
          style={{ 
            backgroundColor: BRAND.beigeSoft,
            borderColor: 'rgba(14,122,58,0.14)'
          }}
        >
          <div className="container mx-auto">
            <Button
              type="button"
              className="w-full text-white h-12 text-base font-semibold"
              style={{ 
                backgroundColor: BRAND.green,
                fontFamily: "'Inter Tight', sans-serif"
              }}
              onClick={handleCTAClick}
              disabled={isSubmitting || isCompressing || !selectedPaymentMethod || (selectedPaymentMethod !== 'stripe' && !receiptFile)}
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

