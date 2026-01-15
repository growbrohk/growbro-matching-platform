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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { submitManualPayment } from '@/lib/payments/submitManualPayment';
import { formatEventDate, formatEventTime } from '@/lib/utils/datetime';
import { getBookingRoute } from '@/lib/utils/booking-route';
import { compressReceiptImage } from '@/lib/images/compressReceiptImage';
import { CreditCard, Smartphone, QrCode, Loader2, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ContactInfoCard } from '@/components/booking/ContactInfoCard';
import type { ContactInfo } from '@/lib/types/booking';
import { supabase } from '@/integrations/supabase/client';

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
};

type PaymentMethod = 'stripe' | 'payme' | 'fps';

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
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

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
        
        // Initialize contact info from order
        setContactInfo({
          firstName: orderData.buyer_first_name || '',
          lastName: orderData.buyer_last_name || '',
          email: orderData.buyer_email || '',
          phone: orderData.buyer_phone || '',
        });
        
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

  const selectMethod = (method: PaymentMethod) => {
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
      setIsCompressing(true);
      try {
        const compressedFile = await compressReceiptImage(file);
        
        // Enforce hard cap: post-compression <= 1MB
        if (compressedFile.size > 1024 * 1024) {
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
    
    // TODO: Implement Stripe checkout session creation
    toast({
      title: 'Stripe payment',
      description: 'Stripe checkout will be implemented soon.',
    });
    
    // Example: Redirect to Stripe checkout
    // const checkoutUrl = await createStripeCheckoutSession(orderId);
    // window.location.href = checkoutUrl;
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

  // Handle contact info update
  const handleContactInfoUpdate = async (info: ContactInfo) => {
    if (!orderId) return;
    
    try {
      // Update order contact info via RPC (no authentication required)
      const { error } = await supabase.rpc('update_order_contact_info' as any, {
        p_order_id: orderId,
        p_buyer_first_name: info.firstName || null,
        p_buyer_last_name: info.lastName || null,
        p_buyer_email: info.email.trim() ? info.email.trim().toLowerCase() : null,
        p_buyer_phone: info.phone || null,
      });

      if (error) {
        console.error('Error updating contact info:', error);
        toast({
          title: 'Error',
          description: 'Failed to update contact info. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      // Update local state
      setContactInfo(info);
      
      // Refresh order to get latest data
      const updatedOrder = await getOrderWithEvent(orderId);
      if (updatedOrder) {
        setOrder(updatedOrder);
      }

      toast({
        title: 'Contact info updated',
        description: 'Your contact information has been saved.',
      });
    } catch (error: any) {
      console.error('Error updating contact info:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update contact info.',
        variant: 'destructive',
      });
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
  const totalAmount = Number(order.total_amount);
  const currency = order.currency || 'HKD';

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
            {formatPrice(totalAmount, currency)}
          </h2>
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>Total amount</p>
        </div>

        {/* Event Summary */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="font-semibold text-lg" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
                {event.title}
              </p>
              <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                {formatEventDate(event.start_at)} {formatEventTime(event.start_at, event.end_at)}
              </p>
              {event.location_text && (
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  {event.location_text}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contact Info Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: BRAND.green }} />
            <h3 className="text-base font-semibold" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
              Contact info
            </h3>
          </div>
          <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Please ensure your contact information is correct for payment receipts and order updates
          </p>
          
          <ContactInfoCard
            contactInfo={contactInfo}
            onUpdate={handleContactInfoUpdate}
            title="Contact info"
            description="This information will be used for payment receipts and order updates"
            showPhone={true}
            requiredFields={{
              firstName: true,
              lastName: true,
              email: false, // Email optional for incognito users
              phone: false, // Phone optional on payment page
            }}
          />
        </div>
      </div>

      {/* Payment Methods */}
      <div className="container mx-auto px-4">
        {availablePaymentMethods.length > 0 ? (
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-semibold mb-4" style={{ fontFamily: "'Inter Tight', sans-serif" }}>Payment methods</h2>
              <RadioGroup
                value={selectedPaymentMethod || ''}
                onValueChange={(value) => {
                  selectMethod(value as PaymentMethod);
                }}
              >
                <div className="space-y-3">
                  {availablePaymentMethods.includes('stripe') && (
                    <div>
                      <Collapsible
                        open={selectedPaymentMethod === 'stripe'}
                        onOpenChange={(open) => {
                          if (!open && selectedPaymentMethod === 'stripe') {
                            setSelectedPaymentMethod(null);
                          }
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2"
                            style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              selectMethod('stripe');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                selectMethod('stripe');
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <RadioGroupItem value="stripe" id="stripe" onClick={(e) => e.stopPropagation()} />
                              <label htmlFor="stripe" className="flex items-center gap-3 cursor-pointer flex-1">
                                <CreditCard className="h-5 w-5" style={{ color: BRAND.green }} />
                                <span className="font-medium" style={{ fontFamily: "'Inter Tight', sans-serif" }}>Stripe Card (Online)</span>
                              </label>
                            </div>
                            {selectedPaymentMethod === 'stripe' ? (
                              <ChevronUp className="h-4 w-4" style={{ color: BRAND.green }} />
                            ) : (
                              <ChevronDown className="h-4 w-4" style={{ color: BRAND.green }} />
                            )}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2 px-4 pb-4">
                          <p className="text-sm text-muted-foreground">
                            You will be redirected to Stripe to complete payment securely.
                          </p>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}

                  {availablePaymentMethods.includes('payme') && (
                    <div>
                      <Collapsible
                        open={selectedPaymentMethod === 'payme'}
                        onOpenChange={(open) => {
                          if (!open && selectedPaymentMethod === 'payme') {
                            setSelectedPaymentMethod(null);
                          }
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2"
                            style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              selectMethod('payme');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                selectMethod('payme');
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <RadioGroupItem value="payme" id="payme" onClick={(e) => e.stopPropagation()} />
                              <label htmlFor="payme" className="flex items-center gap-3 cursor-pointer flex-1">
                                <Smartphone className="h-5 w-5" style={{ color: BRAND.green }} />
                                <div className="flex flex-col">
                                  <span className="font-medium" style={{ fontFamily: "'Inter Tight', sans-serif" }}>PayMe</span>
                                  <span className="text-xs text-muted-foreground">Upload Payme Receipt after successful payment</span>
                                </div>
                              </label>
                            </div>
                            {selectedPaymentMethod === 'payme' ? (
                              <ChevronUp className="h-4 w-4" style={{ color: BRAND.green }} />
                            ) : (
                              <ChevronDown className="h-4 w-4" style={{ color: BRAND.green }} />
                            )}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2 px-4 pb-4 space-y-4">
                          {event.payme_link && (
                            <div>
                              <Label className="text-sm font-medium mb-2 block">PayMe Payment Link</Label>
                              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                                <span className="flex-1 text-sm truncate">{event.payme_link}</span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(event.payme_link!, '_blank');
                                  }}
                                  style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                          <div>
                            <Label htmlFor="payme-receipt" className="text-sm font-medium mb-2 block">
                              Upload receipt
                            </Label>
                            <Input
                              id="payme-receipt"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={handleReceiptChange}
                              className="cursor-pointer"
                              style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                              disabled={isCompressing}
                            />
                            {isCompressing && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Compressing image...
                              </p>
                            )}
                            {receiptFile && selectedPaymentMethod === 'payme' && !isCompressing && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Selected: {receiptFile.name}
                              </p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}

                  {availablePaymentMethods.includes('fps') && (
                    <div>
                      <Collapsible
                        open={selectedPaymentMethod === 'fps'}
                        onOpenChange={(open) => {
                          if (!open && selectedPaymentMethod === 'fps') {
                            setSelectedPaymentMethod(null);
                          }
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2"
                            style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              selectMethod('fps');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                selectMethod('fps');
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <RadioGroupItem value="fps" id="fps" onClick={(e) => e.stopPropagation()} />
                              <label htmlFor="fps" className="flex items-center gap-3 cursor-pointer flex-1">
                                <QrCode className="h-5 w-5" style={{ color: BRAND.green }} />
                                <div className="flex flex-col">
                                  <span className="font-medium" style={{ fontFamily: "'Inter Tight', sans-serif" }}>FPS</span>
                                  <span className="text-xs text-muted-foreground">Upload FPS Receipt/Capscreen after successful payment</span>
                                </div>
                              </label>
                            </div>
                            {selectedPaymentMethod === 'fps' ? (
                              <ChevronUp className="h-4 w-4" style={{ color: BRAND.green }} />
                            ) : (
                              <ChevronDown className="h-4 w-4" style={{ color: BRAND.green }} />
                            )}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2 px-4 pb-4 space-y-4">
                          {event.fps_link && (
                            <div>
                              <Label className="text-sm font-medium mb-2 block">FPS Payment Link</Label>
                              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                                <span className="flex-1 text-sm truncate">{event.fps_link}</span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(event.fps_link!, '_blank');
                                  }}
                                  style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                          <div>
                            <Label htmlFor="fps-receipt" className="text-sm font-medium mb-2 block">
                              Upload receipt
                            </Label>
                            <Input
                              id="fps-receipt"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={handleReceiptChange}
                              className="cursor-pointer"
                              style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                              disabled={isCompressing}
                            />
                            {isCompressing && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Compressing image...
                              </p>
                            )}
                            {receiptFile && selectedPaymentMethod === 'fps' && !isCompressing && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Selected: {receiptFile.name}
                              </p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}
                </div>
              </RadioGroup>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">
                No payment methods are currently available. Please contact the event organizer.
              </p>
            </CardContent>
          </Card>
        )}
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

