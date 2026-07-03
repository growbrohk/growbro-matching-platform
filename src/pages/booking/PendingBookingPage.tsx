/**
 * Page 4: Successful Registration (Pending Host Confirmation)
 * 
 * Shows "Waiting for host confirmation" message.
 * Only accessible when:
 * - payment_method in (payme, fps)
 * - payment_status = 'pending' or 'submitted'
 * - fulfillment_status = 'pending_confirmation'
 * 
 * NO QR code shown on this page.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { formatEventDateTimeMultiDay } from '@/lib/utils/datetime';
import { Clock, Loader2 } from 'lucide-react';

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

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
};

export default function PendingBookingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<OrderWithEvent | null>(null);
  const [loading, setLoading] = useState(true);

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

        // Check eligibility
        const isEligible = 
          (orderData.payment_method === 'payme' || orderData.payment_method === 'fps') &&
          (orderData.payment_status === 'pending' || orderData.payment_status === 'submitted') &&
          orderData.fulfillment_status === 'pending_confirmation';

        if (!isEligible) {
          // Redirect based on order state
          if (orderData.payment_status === 'paid' && orderData.fulfillment_status === 'confirmed') {
            // Already confirmed - go to success page
            navigate(`/booking/success/${orderId}`, { replace: true });
          } else if (orderData.total_amount > 0 && orderData.payment_status === 'unpaid') {
            // Needs payment
            navigate(`/booking/payment/${orderId}`, { replace: true });
          } else {
            // Other states - redirect to payment
            navigate(`/booking/payment/${orderId}`, { replace: true });
          }
          return;
        }
      } catch (error: any) {
        console.error('Error fetching order:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load order details.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, navigate, toast]);

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

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: BRAND.beigeSoft }}>
      {/* Header */}
      <div className="container mx-auto px-4 pt-8 pb-6">
        <h1 className="text-2xl font-bold mb-6" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
          Registration Submitted
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
              Waiting for host confirmation
            </p>
            <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Your payment has been submitted. The host will review and confirm your booking soon.
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
                  {order.order_no || order.id.slice(0, 8).toUpperCase()}
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
                  <p>📅 {formatEventDateTimeMultiDay(event.start_at, event.end_at, event.day_2_start_at, event.day_2_end_at, event.day_3_start_at, event.day_3_end_at, event.day_4_start_at, event.day_4_end_at)}</p>
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

              {/* Add-ons (per-ticket or order-level) */}
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
                  {order.payment_method === 'payme' ? 'PayMe' : 'FPS'}
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
                  Pending
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
      </div>
    </div>
  );
}

