/**
 * Page 4: Pending Confirmation Page
 * 
 * Dedicated page for orders with payment_status='submitted' (PayMe/FPS receipt uploaded).
 * Shows pending confirmation UI with payment details.
 * 
 * Strict guards:
 * - If order.fulfillment_status === 'confirmed' OR order.total_amount <= 0:
 *   → navigate to Success (replace:true) once
 * - Else if order.payment_status !== 'submitted':
 *   → navigate to Payment (replace:true) once
 * - Else render pending UI
 * 
 * NO redirect loops - guards only run once after order fetch completes.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { formatEventTimeSlotsDisplayText } from '@/lib/utils/event-time-slots';
import { Clock, ExternalLink, FileText, AlertCircle } from 'lucide-react';

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
};

/**
 * Format submitted_at timestamp for display
 * Shows date and time in Hong Kong timezone
 */
function formatSubmittedAt(submittedAt: string | null): string {
  if (!submittedAt) return 'N/A';
  
  const date = new Date(submittedAt);
  const TIMEZONE = 'Asia/Hong_Kong';
  
  return date.toLocaleString('en-US', {
    timeZone: TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function PendingConfirmationPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<OrderWithEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
          setError('Order not found');
          setLoading(false);
          return;
        }

        setOrder(orderData);
        setLoading(false);

        // Strict guards - only redirect once after order fetch completes
        if (redirectedRef.current) {
          return; // Already redirected, prevent multiple redirects
        }

        // Guard 1: If confirmed or free → navigate to Success (replace:true) once
        if (
          orderData.fulfillment_status === 'confirmed' ||
          orderData.total_amount <= 0
        ) {
          redirectedRef.current = true;
          navigate(`/booking/success/${orderId}`, { replace: true });
          return;
        }

        // Guard 2: If payment_status !== 'submitted' → navigate to Payment (replace:true) once
        if (orderData.payment_status !== 'submitted') {
          redirectedRef.current = true;
          navigate(`/booking/payment/${orderId}`, { replace: true });
          return;
        }

        // Order is in correct state for this page:
        // - payment_status === 'submitted'
        // - fulfillment_status !== 'confirmed'
        // - total_amount > 0
        // Continue rendering pending UI
      } catch (error: any) {
        console.error('Error fetching order:', error);
        setError(error.message || 'Failed to load order details.');
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, navigate]);

  // Show skeleton while loading
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

  // Show error UI (NO redirect)
  if (error || !order) {
    return (
      <div className="min-h-screen pb-24" style={{ backgroundColor: BRAND.beigeSoft }}>
        <div className="container mx-auto px-4 pt-8 pb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <AlertCircle className="h-12 w-12" style={{ color: '#EF4444' }} />
                <div>
                  <h2 className="text-xl font-semibold mb-2" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
                    {error || 'Order not found'}
                  </h2>
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    {error 
                      ? 'Unable to load order details. Please try again later.'
                      : 'The order you are looking for does not exist.'}
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/')}
                  style={{
                    backgroundColor: BRAND.green,
                    color: 'white',
                    fontFamily: "'Inter Tight', sans-serif"
                  }}
                >
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const event = order.event;
  const bookingCode = order.order_no || order.id.slice(0, 8).toUpperCase();

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: BRAND.beigeSoft }}>
      {/* Header */}
      <div className="container mx-auto px-4 pt-8 pb-6">
        <h1 className="text-2xl font-bold mb-6" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
          Pending Confirmation
        </h1>

        {/* Pending Banner */}
        <div 
          className="rounded-2xl px-6 py-4 mb-6 flex items-center gap-3"
          style={{ 
            backgroundColor: 'rgba(14,122,58,0.1)',
            border: `1px solid rgba(14,122,58,0.2)`
          }}
        >
          <Clock className="h-6 w-6" style={{ color: BRAND.green }} />
          <div>
            <p className="font-semibold text-base" style={{ color: BRAND.green, fontFamily: "'Inter Tight', sans-serif" }}>
              Waiting for host to verify your payment
            </p>
            <p className="text-sm mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Your payment receipt has been submitted. The host will review and confirm your booking soon.
            </p>
          </div>
        </div>
      </div>

      {/* Order Details */}
      <div className="container mx-auto px-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Order Number */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Order Number</p>
                <p className="text-lg font-bold font-mono" style={{ color: BRAND.green }}>
                  {bookingCode}
                </p>
              </div>

              {/* Event Summary */}
              <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <p className="text-sm font-medium text-muted-foreground mb-2">Event</p>
                <p className="font-semibold text-lg mb-2" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
                  {event.title}
                </p>
                
                <div className="space-y-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  {event.location_text && (
                    <p>📍 {event.location_text}</p>
                  )}
                  <p className="whitespace-pre-line">📅 {formatEventTimeSlotsDisplayText(event)}</p>
                </div>
              </div>

              {/* Ticket Summary */}
              <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <p className="text-sm font-medium text-muted-foreground mb-2">Tickets</p>
                <div className="space-y-1">
                  {order.order_items.map((item, idx) => (
                    <p key={idx} className="text-sm">
                      {item.quantity}x {item.ticket_type.name}
                    </p>
                  ))}
                  <p className="text-sm font-semibold mt-2">
                    Total: {order.tickets.length} ticket(s)
                  </p>
                </div>
              </div>

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

              {/* Payment Method */}
              <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <p className="text-sm font-medium text-muted-foreground mb-1">Payment Method</p>
                <p className="text-sm capitalize">
                  {order.payment_method === 'payme' ? 'PayMe' : order.payment_method === 'fps' ? 'FPS' : order.payment_method || 'N/A'}
                </p>
              </div>

              {/* Submitted At */}
              {order.submitted_at && (
                <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Submitted At</p>
                  <p className="text-sm" style={{ color: BRAND.dark }}>
                    {formatSubmittedAt(order.submitted_at)}
                  </p>
                </div>
              )}

              {/* Receipt Link/Preview */}
              {order.receipt_url && (
                <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Payment Receipt</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // 1. Base URL for your Supabase project
                        const baseUrl = "https://pbtupzbqtuxzznwummep.supabase.co/storage/v1/object/public/payment-receipts";
                        
                        // 2. Ensure we don't have leading slashes that create double-slashes in the URL
                        const cleanPath = order.receipt_url!.replace(/^\/+/, '');
                        
                        // 3. Combine them
                        const finalUrl = `${baseUrl}/${cleanPath}`;
                        
                        console.debug('Opening receipt:', finalUrl);
                        window.open(finalUrl, '_blank');
                      }}
                      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      View Receipt
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Payment Status Badge */}
              <div className="border-t pt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <p className="text-sm font-medium text-muted-foreground mb-2">Status</p>
                <div 
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                  style={{ 
                    backgroundColor: 'rgba(251,191,36,0.1)',
                    color: '#FBBF24',
                    border: '1px solid rgba(251,191,36,0.2)'
                  }}
                >
                  <Clock className="h-3 w-3" />
                  Pending Confirmation
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Message */}
        <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: 'rgba(14,122,58,0.05)' }}>
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Once your booking is confirmed, you'll receive a confirmation email with your ticket and QR code.
          </p>
        </div>

        {/* Action Button */}
        <div className="mt-6">
          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={() => navigate('/')}
            style={{
              backgroundColor: BRAND.green,
              color: 'white',
              fontFamily: "'Inter Tight', sans-serif"
            }}
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}

