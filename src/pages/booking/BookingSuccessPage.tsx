import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { submitManualPayment } from '@/lib/payments/submitManualPayment';
import { formatEventDate, formatEventTime } from '@/lib/utils/datetime';
import { CreditCard, Smartphone, QrCode, ChevronDown, Loader2, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type PaymentMethod = 'stripe' | 'payme' | 'fps';

export default function BookingSuccessPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<OrderWithEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);

  useEffect(() => {
    if (!orderId) {
      navigate('/');
      return;
    }

    const fetchOrder = async () => {
      try {
        console.log('Fetching order:', orderId);
        
        // Check if this is the last order created (for guest checkout access)
        const lastOrderId = sessionStorage.getItem('last_order_id');
        const isRecentOrder = lastOrderId === orderId;
        
        const orderData = await getOrderWithEvent(orderId);
        console.log('Order data received:', orderData);
        
        if (!orderData) {
          console.error('Order not found for ID:', orderId);
          
          // If this was a recent order, it might be an RLS issue
          if (isRecentOrder) {
            toast({
              title: 'Order found but access denied',
              description: 'Your order was created successfully, but there was an issue loading it. Please try refreshing the page or contact support.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Order not found',
              description: 'The order you are looking for does not exist. It may have been created as a guest checkout - please try logging in first.',
              variant: 'destructive',
            });
          }
          
          // Don't navigate immediately - let user see the error
          setLoading(false);
          return;
        }
        
        // Clear the session storage after successful fetch
        if (isRecentOrder) {
          sessionStorage.removeItem('last_order_id');
        }
        
        setOrder(orderData);
        
        // Check if payment was already submitted
        if (orderData.payment_status === 'submitted' || orderData.payment_status === 'paid') {
          setPaymentSubmitted(true);
        }
      } catch (error: any) {
        console.error('Error fetching order:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        toast({
          title: 'Error',
          description: error.message || 'Failed to load order details. Please try refreshing the page.',
          variant: 'destructive',
        });
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, navigate, toast]);

  const isFree = order ? Number(order.total_amount) <= 0 : false;
  const event = order?.event;

  // Determine available payment methods
  const availablePaymentMethods: PaymentMethod[] = [];
  if (event) {
    if (event.enable_stripe) {
      availablePaymentMethods.push('stripe');
    }
    if (event.enable_payme && event.payme_link) {
      availablePaymentMethods.push('payme');
    }
    if (event.enable_fps && event.fps_link) {
      availablePaymentMethods.push('fps');
    }
  }

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
      
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please upload a file smaller than 10MB.',
          variant: 'destructive',
        });
        return;
      }
      
      setReceiptFile(file);
    }
  };

  const handleStripePayment = async () => {
    if (!orderId) return;
    
    // TODO: Implement Stripe checkout session creation
    // For now, show a message
    toast({
      title: 'Stripe payment',
      description: 'Stripe checkout will be implemented soon.',
    });
    
    // Example: Redirect to Stripe checkout
    // const checkoutUrl = await createStripeCheckoutSession(orderId);
    // window.location.href = checkoutUrl;
  };

  const handleManualPaymentSubmit = async () => {
    if (!orderId || !selectedPaymentMethod || !receiptFile) {
      toast({
        title: 'Missing information',
        description: 'Please select a payment method and upload a receipt.',
        variant: 'destructive',
      });
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

    setIsSubmitting(true);
    try {
      const paymentLink = selectedPaymentMethod === 'payme' 
        ? event?.payme_link 
        : event?.fps_link;

      if (!paymentLink) {
        throw new Error('Payment link not configured');
      }

      await submitManualPayment({
        orderId,
        paymentMethod: selectedPaymentMethod as 'payme' | 'fps',
        receiptFile,
        paymentReferenceLink: paymentLink,
      });

      setPaymentSubmitted(true);
      toast({
        title: 'Payment submitted',
        description: 'Your payment receipt has been submitted. Waiting for host confirmation.',
      });
    } catch (error: any) {
      console.error('Error submitting payment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCTAClick = () => {
    if (isFree) {
      // Navigate to event page or booking details
      if (event) {
        navigate(`/${event.org_id}/events/${event.id}`);
      } else {
        navigate('/');
      }
      return;
    }

    if (paymentSubmitted) {
      // Already submitted, do nothing or show message
      return;
    }

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

  const getCTAText = (): string => {
    if (isFree) {
      return 'Back to event';
    }
    if (paymentSubmitted) {
      return 'Payment submitted';
    }
    if (selectedPaymentMethod === 'stripe') {
      return 'Pay now';
    }
    if (selectedPaymentMethod === 'payme' || selectedPaymentMethod === 'fps') {
      return 'Finish payment';
    }
    return 'Select payment method';
  };

  const formatPrice = (amount: number, currency: string = 'HKD'): string => {
    return `${currency === 'HKD' ? 'HK$' : currency} ${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-400 to-orange-500">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-32 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!order || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-400 to-orange-500 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Order not found</h2>
              <p className="text-muted-foreground mb-4">The order you are looking for does not exist.</p>
              <Button onClick={() => navigate('/')}>Go home</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAmount = Number(order.total_amount);
  const currency = order.currency || 'HKD';

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-400 to-orange-500 pb-24">
      {/* Header */}
      <div className="container mx-auto px-4 pt-8 pb-6">
        {/* Pill banner */}
        <div className="bg-white/90 backdrop-blur-sm rounded-full px-6 py-3 mb-6 inline-block">
          <p className="text-orange-600 font-medium text-sm">
            {isFree 
              ? 'Your booking is submitted! You will receive a confirmation email soon once host confirmed!'
              : paymentSubmitted
              ? 'Payment submitted, waiting for host confirmation.'
              : 'Your booking is submitted! Please choose a payment method'
            }
          </p>
        </div>

        {/* Big price */}
        {!isFree && (
          <div className="mb-6">
            <h1 className="text-5xl font-bold text-white mb-2">
              {formatPrice(totalAmount, currency)}
            </h1>
            <p className="text-orange-100 text-sm">Total amount</p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="container mx-auto px-4">
        {/* Booking details accordion */}
        <Card className="mb-4">
          <Accordion type="single" collapsible>
            <AccordionItem value="details">
              <AccordionTrigger className="px-6">
                <span className="font-semibold">Booking details</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Event</p>
                    <p className="font-semibold">{event.title}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Date & Time</p>
                    <p>
                      {formatEventDate(event.start_at)} {formatEventTime(event.start_at, event.end_at)}
                    </p>
                  </div>
                  {event.location_text && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Location</p>
                      <p>{event.location_text}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Quantity</p>
                    <p>
                      {order.order_items.reduce((sum, item) => sum + item.quantity, 0)} ticket(s)
                    </p>
                  </div>
                  {order.buyer_first_name && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Contact</p>
                      <p>
                        {order.buyer_first_name} {order.buyer_last_name}
                        {order.buyer_email && <><br />{order.buyer_email}</>}
                        {order.buyer_phone && <><br />{order.buyer_phone}</>}
                      </p>
                    </div>
                  )}
                  {order.tickets.length > 0 && order.tickets[0].first_name && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Attendees</p>
                      <div className="space-y-1">
                        {order.tickets.map((ticket, idx) => (
                          <p key={ticket.id || idx}>
                            {ticket.first_name} {ticket.last_name}
                            {ticket.email && <span className="text-muted-foreground"> ({ticket.email})</span>}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        {/* Payment methods (only for paid orders) */}
        {!isFree && !paymentSubmitted && availablePaymentMethods.length > 0 && (
          <Card className="mb-4">
            <CardContent className="pt-6">
              <h2 className="font-semibold mb-4">Payment methods</h2>
              <RadioGroup
                value={selectedPaymentMethod || ''}
                onValueChange={(value) => {
                  const newMethod = value as PaymentMethod;
                  // Clear receipt file when switching away from manual payment methods
                  if (selectedPaymentMethod === 'payme' || selectedPaymentMethod === 'fps') {
                    if (newMethod !== 'payme' && newMethod !== 'fps') {
                      setReceiptFile(null);
                    }
                  }
                  setSelectedPaymentMethod(newMethod);
                }}
              >
                <div className="space-y-3">
                  {availablePaymentMethods.includes('stripe') && (
                    <div>
                      <Collapsible
                        open={selectedPaymentMethod === 'stripe'}
                        onOpenChange={(open) => {
                          if (open) {
                            setSelectedPaymentMethod('stripe');
                          } else if (selectedPaymentMethod === 'stripe') {
                            setSelectedPaymentMethod(null);
                          }
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <label
                            htmlFor="stripe"
                            className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent"
                            onClick={(e) => {
                              // Prevent double toggle
                              if (selectedPaymentMethod !== 'stripe') {
                                setSelectedPaymentMethod('stripe');
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <RadioGroupItem value="stripe" id="stripe" />
                              <CreditCard className="h-5 w-5 text-muted-foreground" />
                              <span className="font-medium">Stripe Card (Online)</span>
                            </div>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${selectedPaymentMethod === 'stripe' ? 'rotate-180' : ''}`} />
                          </label>
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
                          if (open) {
                            setSelectedPaymentMethod('payme');
                          } else if (selectedPaymentMethod === 'payme') {
                            setSelectedPaymentMethod(null);
                          }
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <label
                            htmlFor="payme"
                            className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent"
                            onClick={(e) => {
                              if (selectedPaymentMethod !== 'payme') {
                                setSelectedPaymentMethod('payme');
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <RadioGroupItem value="payme" id="payme" />
                              <Smartphone className="h-5 w-5 text-muted-foreground" />
                              <span className="font-medium">PayMe</span>
                            </div>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${selectedPaymentMethod === 'payme' ? 'rotate-180' : ''}`} />
                          </label>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2 px-4 pb-4 space-y-4">
                          <div>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (event.payme_link) {
                                  window.open(event.payme_link, '_blank');
                                }
                              }}
                            >
                              Open PayMe link <ExternalLink className="ml-2 h-4 w-4" />
                            </Button>
                          </div>
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
                            />
                            {receiptFile && selectedPaymentMethod === 'payme' && (
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
                          if (open) {
                            setSelectedPaymentMethod('fps');
                          } else if (selectedPaymentMethod === 'fps') {
                            setSelectedPaymentMethod(null);
                          }
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <label
                            htmlFor="fps"
                            className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent"
                            onClick={(e) => {
                              if (selectedPaymentMethod !== 'fps') {
                                setSelectedPaymentMethod('fps');
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <RadioGroupItem value="fps" id="fps" />
                              <QrCode className="h-5 w-5 text-muted-foreground" />
                              <span className="font-medium">FPS</span>
                            </div>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${selectedPaymentMethod === 'fps' ? 'rotate-180' : ''}`} />
                          </label>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2 px-4 pb-4 space-y-4">
                          <div>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (event.fps_link) {
                                  window.open(event.fps_link, '_blank');
                                }
                              }}
                            >
                              Open FPS link <ExternalLink className="ml-2 h-4 w-4" />
                            </Button>
                          </div>
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
                            />
                            {receiptFile && selectedPaymentMethod === 'fps' && (
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
        )}

        {/* No payment methods available message */}
        {!isFree && !paymentSubmitted && availablePaymentMethods.length === 0 && (
          <Card className="mb-4">
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">
                No payment methods are currently available. Please contact the event organizer.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sticky CTA button */}
      {!isFree && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 safe-area-bottom">
          <div className="container mx-auto">
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 text-base font-semibold"
              onClick={handleCTAClick}
              disabled={isSubmitting || paymentSubmitted || (!selectedPaymentMethod && !paymentSubmitted)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                getCTAText()
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Free booking CTA */}
      {isFree && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 safe-area-bottom">
          <div className="container mx-auto">
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 text-base font-semibold"
              onClick={handleCTAClick}
            >
              Back to event
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

