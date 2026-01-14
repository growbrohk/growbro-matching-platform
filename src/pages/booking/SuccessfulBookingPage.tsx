/**
 * Page 5: Successful Booking (Confirmed)
 *
 * Shows ticket with QR code.
 * Only accessible when:
 * - payment_status = 'paid'
 * - fulfillment_status = 'confirmed'
 *
 * UPDATED:
 * - Added padding (spacing) below each ticket on screen
 * - Does NOT affect print/PDF layout (still 1 ticket per page)
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { getBookingRoute } from '@/lib/utils/booking-route';
import { formatEventDate, formatEventTime } from '@/lib/utils/datetime';
import TicketCard, { TicketCardPreview } from '@/components/booking/TicketCard';
import { CheckCircle2, FileText, Clock } from 'lucide-react';

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
  const [searchParams] = useSearchParams();

  const [order, setOrder] = useState<OrderWithEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasRedirected, setHasRedirected] = useState(false);
  
  // Check if status=pending_confirmation query param is present
  // OR if order has pending_confirmation status with manual payment
  const isPendingConfirmation = 
    searchParams.get('status') === 'pending_confirmation' ||
    (order?.fulfillment_status === 'pending_confirmation' &&
     order?.total_amount > 0 &&
     (order?.payment_method === 'payme' || order?.payment_method === 'fps'));

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

        if (hasRedirected) return;

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

        if (route !== 'success') {
          setHasRedirected(true);
          if (route === 'payment') {
            navigate(`/booking/payment/${orderId}`, { replace: true });
          } else if (route === 'pending') {
            navigate(`/booking/pending/${orderId}`, { replace: true });
          } else {
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

  if (!order) return null;

  const tickets = order.tickets ?? [];
  const bookingCode = order.order_no || order.id.slice(0, 8).toUpperCase();

  // Determine if we should show pending confirmation UI
  const showPendingConfirmation = 
    searchParams.get('status') === 'pending_confirmation' ||
    (order.fulfillment_status === 'pending_confirmation' &&
     order.total_amount > 0 &&
     (order.payment_method === 'payme' || order.payment_method === 'fps'));

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

  const pricePerTicket =
    tickets.length > 0 ? Math.round((order.total_amount || 0) / tickets.length) : 0;

  const venue = order.event.venue_name || order.event.location_text || 'TBA';

  return (
    <>
      {/* Print styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { margin: 0; size: auto; }
              html, body { height: auto !important; margin: 0 !important; padding: 0 !important; }
              body * { visibility: hidden; }
              .print-container, .print-container * { visibility: visible; }
              .print-container { position: static !important; display: block !important; width: 100%; }
              .ticket-page-break { 
                display: block; 
                break-before: page; 
                page-break-before: always; 
                height: 100vh;
                margin: 0 !important;
                padding: 0 !important;
              }
              .no-print { display: none !important; }
            }
          `,
        }}
      />

      <div className="min-h-screen pb-20" style={{ backgroundColor: BRAND.beigeSoft }}>
        {/* Header */}
        <div className="container mx-auto px-4 pt-8 pb-6 no-print">
          <h1
            className="text-2xl font-bold mb-6"
            style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}
          >
            Ticket
          </h1>

          {/* Success Banner */}
          <div
            className="rounded-2xl px-6 py-4 mb-6 flex items-center gap-3"
            style={{
              backgroundColor: showPendingConfirmation 
                ? 'rgba(251,191,36,0.1)' 
                : 'rgba(14,122,58,0.1)',
              border: `1px solid ${showPendingConfirmation 
                ? 'rgba(251,191,36,0.2)' 
                : 'rgba(14,122,58,0.2)'}`,
            }}
          >
            {showPendingConfirmation ? (
              <Clock className="h-6 w-6" style={{ color: '#FBBF24' }} />
            ) : (
              <CheckCircle2 className="h-6 w-6" style={{ color: BRAND.green }} />
            )}
            <div>
              <p
                className="font-semibold text-base"
                style={{ 
                  color: showPendingConfirmation ? '#FBBF24' : BRAND.green, 
                  fontFamily: "'Inter Tight', sans-serif" 
                }}
              >
                {showPendingConfirmation ? 'Registration received ✅' : '✓ Congrats'}
              </p>
              <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                {showPendingConfirmation 
                  ? 'Waiting for host confirmation'
                  : 'Your ticket has been successfully booked'}
              </p>
            </div>
          </div>

          {/* Pending Confirmation Details Panel */}
          {showPendingConfirmation && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2" style={{ color: 'rgba(15,31,23,0.72)' }}>
                      We've received your payment proof. The host will confirm your booking shortly.
                    </p>
                  </div>
                  
                  <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                    <div className="flex justify-between">
                      <span className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>Event</span>
                      <span className="text-sm font-medium" style={{ color: BRAND.dark }}>{order.event.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>Date & Time</span>
                      <span className="text-sm font-medium" style={{ color: BRAND.dark }}>
                        {formatEventDate(order.event.start_at)} {formatEventTime(order.event.start_at, order.event.end_at)}
                      </span>
                    </div>
                    {venue && (
                      <div className="flex justify-between">
                        <span className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>Venue</span>
                        <span className="text-sm font-medium" style={{ color: BRAND.dark }}>{venue}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>Quantity</span>
                      <span className="text-sm font-medium" style={{ color: BRAND.dark }}>{tickets.length} ticket{tickets.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>Order No.</span>
                      <span className="text-sm font-medium" style={{ color: BRAND.dark }}>{bookingCode}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Ticket Cards */}
        <div className="container mx-auto px-4">
          {/* Show pending confirmation message instead of tickets if pending */}
          {showPendingConfirmation ? (
            <Card className="mb-6">
              <CardContent className="pt-6 pb-8">
                <div className="text-center space-y-4">
                  <Clock className="h-16 w-16 mx-auto" style={{ color: '#FBBF24' }} />
                  <div>
                    <p className="text-lg font-semibold mb-2" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
                      Ticket will appear after confirmation
                    </p>
                    <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                      Once the host confirms your booking, your ticket QR code will be available here.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* ✅ UPDATED: removed space-y-0 so we control spacing per ticket */
            <div className="print-container">
              {tickets.map((ticket, index) => {
                if (!ticket.qr_code) return null;

              const ticketParticipantName =
                ticket.first_name || ticket.last_name
                  ? `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim().toUpperCase()
                  : order.buyer_first_name || order.buyer_last_name
                  ? `${order.buyer_first_name || ''} ${order.buyer_last_name || ''}`.trim().toUpperCase()
                  : 'GUEST';

              return (
                // ✅ UPDATED: add bottom spacing on screen, but print removes it via CSS
                <div
                  key={ticket.id || index}
                  className="ticket-page-break mb-12 no-print:last:mb-0"
                >
                  {tickets.length > 1 && (
                    <p
                      className="text-sm text-muted-foreground mb-2 text-center no-print"
                      style={{ marginBottom: '0.5rem' }}
                    >
                      Ticket {index + 1} of {tickets.length}
                    </p>
                  )}

                  <TicketCardPreview>
                    <TicketCard
                      eventName={order.event.title}
                      dateTime={order.event.start_at}
                      venue={venue}
                      checkinCode={ticket.qr_code}
                      qrValue={ticket.qr_code}
                      participantName={ticketParticipantName}
                      price={pricePerTicket}
                      seatNumber={null}
                      currency={order.currency || 'HKD'}
                    />
                  </TicketCardPreview>
                </div>
              );
            })}
            </div>
          )}

          {/* Download Button - Only show if not pending confirmation */}
          {!showPendingConfirmation && (
            <div className="mt-6 no-print">
            <Button
              className="w-full h-12 text-base font-semibold"
              style={{
                backgroundColor: BRAND.green,
                color: 'white',
                fontFamily: "'Inter Tight', sans-serif",
              }}
              onClick={handleDownloadPDF}
            >
              <FileText className="mr-2 h-5 w-5" />
              Download PDF / Print
            </Button>
            </div>
          )}

          {/* Action Buttons for Pending Confirmation */}
          {showPendingConfirmation && (
            <div className="mt-6 space-y-3 no-print">
              <Button
                className="w-full h-12 text-base font-semibold"
                style={{
                  backgroundColor: BRAND.green,
                  color: 'white',
                  fontFamily: "'Inter Tight', sans-serif",
                }}
                onClick={() => navigate('/events')}
              >
                Back to Events
              </Button>
              {/* Optional: Contact Host button - placeholder for now */}
              {/* <Button
                variant="outline"
                className="w-full h-12 text-base font-semibold"
                style={{
                  borderColor: 'rgba(14,122,58,0.14)',
                  color: BRAND.green,
                  fontFamily: "'Inter Tight', sans-serif",
                }}
                onClick={() => {
                  // TODO: Implement contact host functionality
                  toast({
                    title: 'Contact Host',
                    description: 'Contact functionality will be available soon.',
                  });
                }}
              >
                Contact Host
              </Button> */}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
