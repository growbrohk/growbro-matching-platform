/**
 * Page 5: Successful Booking (Confirmed)
 * 
 * Shows ticket with QR code.
 * Only accessible when:
 * - payment_status = 'paid'
 * - fulfillment_status = 'confirmed'
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { getBookingRoute } from '@/lib/utils/booking-route';
import TicketCard, { TicketCardPreview } from '@/components/booking/TicketCard';
import { CheckCircle2, FileText } from 'lucide-react';

const BRAND = {
  green: "#0E7A3A",
  greenSoft: "#2F9B63",
  beige: "#F4EFE9",
  beigeSoft: "#FBF8F4",
  dark: "#0F1F17",
};

export default function SuccessfulBookingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [order, setOrder] = useState<OrderWithEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasRedirected, setHasRedirected] = useState(false);

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
        if (hasRedirected) {
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
          currentPage: 'success',
        });

        // If route is not 'success', redirect accordingly (one-way)
        if (route !== 'success') {
          setHasRedirected(true);
          if (route === 'payment') {
            navigate(`/booking/payment/${orderId}`, { replace: true });
          } else if (route === 'pending') {
            navigate(`/booking/pending/${orderId}`, { replace: true });
          } else {
            // Fallback to payment
            navigate(`/booking/payment/${orderId}`, { replace: true });
          }
          return;
        }

        // Route is 'success' - this page is correct, continue rendering
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
  }, [orderId, navigate, toast, hasRedirected]);

  const handleDownloadPDF = () => {
    window.print();
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

  // Get all tickets and booking code
  const tickets = order.tickets ?? [];
  const bookingCode = order.order_no || order.id.slice(0, 8).toUpperCase();

  // Safety check: if no tickets found, show error
  if (tickets.length === 0) {
    toast({
      title: 'No tickets found',
      description: 'Unable to load ticket information. Please contact support.',
      variant: 'destructive',
    });
    return (
      <div className="min-h-screen pb-20" style={{ backgroundColor: BRAND.beigeSoft }}>
        <div className="container mx-auto px-4 pt-8 pb-6">
          <p className="text-center text-muted-foreground">No tickets found for this order.</p>
        </div>
      </div>
    );
  }

  // Calculate price per ticket (total_amount / ticket count)
  const pricePerTicket = tickets.length > 0 
    ? Math.round((order.total_amount || 0) / tickets.length)
    : 0;

  // Venue name (venue_name or location_text)
  const venue = order.event.venue_name || order.event.location_text || 'TBA';

  return (
    <>
      {/* Print styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden; }
              .print-container, .print-container * { visibility: visible; }
              .print-container { position: absolute; left: 0; top: 0; width: 100%; }
              button, .no-print { display: none !important; }
            }
          `,
        }}
      />
      
      <div className="min-h-screen pb-20" style={{ backgroundColor: BRAND.beigeSoft }}>
        {/* Header */}
        <div className="container mx-auto px-4 pt-8 pb-6 no-print">
          <h1 className="text-2xl font-bold mb-6" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
            Ticket
          </h1>

          {/* Success Banner */}
          <div 
            className="rounded-2xl px-6 py-4 mb-6 flex items-center gap-3"
            style={{ 
              backgroundColor: 'rgba(14,122,58,0.1)',
              border: `1px solid rgba(14,122,58,0.2)`
            }}
          >
            <CheckCircle2 className="h-6 w-6" style={{ color: BRAND.green }} />
            <div>
              <p className="font-semibold text-base" style={{ color: BRAND.green, fontFamily: "'Inter Tight', sans-serif" }}>
                ✓ Congrats
              </p>
              <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                Your ticket has been successfully booked
              </p>
            </div>
          </div>
        </div>

        {/* Ticket Cards - Render all tickets */}
        <div className="container mx-auto px-4">
          <div className="print-container flex flex-col gap-6">
            {tickets.map((ticket, index) => {
              if (!ticket.qr_code) return null;
              
              const ticketParticipantName = ticket.first_name || ticket.last_name
                ? `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim().toUpperCase()
                : order.buyer_first_name || order.buyer_last_name
                ? `${order.buyer_first_name || ''} ${order.buyer_last_name || ''}`.trim().toUpperCase()
                : 'GUEST';

              return (
                <div key={ticket.id || index}>
                  {tickets.length > 1 && (
                    <p className="text-sm text-muted-foreground mb-2 text-center no-print">
                      Ticket {index + 1} of {tickets.length}
                    </p>
                  )}
                  <TicketCardPreview>
                    <TicketCard
                      eventName={order.event.title}
                      dateTime={order.event.start_at}
                      venue={venue}
                      checkinCode={bookingCode}
                      qrValue={ticket.qr_code}
                      participantName={ticketParticipantName}
                      price={pricePerTicket}
                      seatNumber={null} // Seat numbers not currently in schema
                      currency={order.currency || 'HKD'}
                    />
                  </TicketCardPreview>
                </div>
              );
            })}
          </div>

          {/* Download Button */}
          <div className="mt-6 no-print">
            <Button
              className="w-full h-12 text-base font-semibold"
              style={{ 
                backgroundColor: BRAND.green,
                color: 'white',
                fontFamily: "'Inter Tight', sans-serif"
              }}
              onClick={handleDownloadPDF}
            >
              <FileText className="mr-2 h-5 w-5" />
              Download PDF / Print
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

