/**
 * Page 5: Successful Booking (Confirmed)
 *
 * Shows ticket with QR code.
 * Only accessible when:
 * - payment_status = 'paid' OR 'submitted' (if confirmed)
 * - fulfillment_status = 'confirmed' OR total_amount = 0
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { getBookingRoute } from '@/lib/utils/booking-route';
import { formatTicketTypeDateTime } from '@/lib/utils/datetime';
import {
  formatPurchasedTimeSlotShortLabel,
  hasMultipleTimeSlots,
} from '@/lib/utils/event-time-slots';
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
  const hasRedirectedRef = useRef(false);

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

        // Clear tracking_link_id attribution after successful order confirmation
        // This is a safety measure in case it wasn't cleared during order creation
        localStorage.removeItem('tracking_link_id');

        // Prevent multiple redirect attempts in one mount cycle
        if (hasRedirectedRef.current) return;

        // --- ROUTING LOGIC START ---
        
        const isConfirmed = orderData.fulfillment_status === 'confirmed';
        const isPaid = orderData.payment_status === 'paid';
        const isFree = orderData.total_amount <= 0;

        // GUARD 1: SUCCESS STATE (The "Safe Zone")
        // If the order is confirmed, paid, or free, STAY HERE.
        if (isConfirmed || isPaid || isFree) {
          console.debug('[booking-route] Valid success state detected. Access granted.');
          return; 
        }

        // GUARD 2: PENDING STATE
        // If payment is submitted but not yet confirmed by the host (e.g., PayMe/FPS)
        if (orderData.payment_status === 'submitted') {
          hasRedirectedRef.current = true;
          navigate(`/booking/pending/${orderId}`, { replace: true });
          return;
        }

        // GUARD 3: PAYMENT STATE
        // If explicitly unpaid and not a free event
        if (orderData.total_amount > 0 && orderData.payment_status === 'unpaid') {
          hasRedirectedRef.current = true;
          navigate(`/booking/payment/${orderId}`, { replace: true });
          return;
        }

        // GUARD 4: FALLBACK
        // Use utility logic if none of the explicit conditions above matched
        const fallbackRoute = getBookingRoute(orderData);
        if (fallbackRoute !== 'success') {
          console.debug(`[booking-route] Fallback redirecting to: ${fallbackRoute}`);
          hasRedirectedRef.current = true;
          navigate(`/booking/${fallbackRoute}/${orderId}`, { replace: true });
        }
        
        // --- ROUTING LOGIC END ---

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

  if (tickets.length === 0) {
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
        <div className="container mx-auto px-4 pt-8 pb-6 no-print">
          <h1
            className="text-2xl font-bold mb-6"
            style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}
          >
            Ticket
          </h1>

          <div
            className="rounded-2xl px-6 py-4 mb-6 flex items-center gap-3"
            style={{
              backgroundColor: 'rgba(14,122,58,0.1)',
              border: `1px solid rgba(14,122,58,0.2)`,
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

        <div className="container mx-auto px-4">
          <div className="print-container">
            {tickets.map((ticket, index) => {
              if (!ticket.qr_code) return null;

              const ticketParticipantName =
                ticket.first_name || ticket.last_name
                  ? `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim().toUpperCase()
                  : order.buyer_first_name || order.buyer_last_name
                  ? `${order.buyer_first_name || ''} ${order.buyer_last_name || ''}`.trim().toUpperCase()
                  : 'GUEST';

              const addonsForTicket = (order.order_addon_items || []).filter(
                (a) => a.ticket_id === ticket.id
              );

              const multiSlot = hasMultipleTimeSlots(order.event);
              const timeSlotLabel =
                multiSlot && ticket.time_slot
                  ? formatPurchasedTimeSlotShortLabel(ticket.time_slot) ?? undefined
                  : undefined;

              return (
                <div key={ticket.id || index} className="ticket-page-break mb-12 no-print:last:mb-0">
                  {tickets.length > 1 && (
                    <p className="text-sm text-muted-foreground mb-2 text-center no-print">
                      Ticket {index + 1} of {tickets.length}
                    </p>
                  )}
                  <TicketCardPreview>
                    <TicketCard
                      eventName={order.event.title}
                      dateTime={order.event.start_at}
                      dateTimeFormatted={formatTicketTypeDateTime(
                        order.event,
                        { valid_for_days: ticket.ticket_type?.valid_for_days },
                        ticket.time_slot ?? undefined
                      )}
                      timeSlotLabel={timeSlotLabel}
                      venue={venue}
                      checkinCode={ticket.qr_code}
                      qrValue={ticket.qr_code}
                      participantName={ticketParticipantName}
                      price={pricePerTicket}
                      seatNumber={null}
                      addons={addonsForTicket.map((a) => ({
                        label: a.label || 'Add-on',
                        variantLabel: a.variant_label,
                        quantity: a.quantity,
                      }))}
                      currency={order.currency || 'HKD'}
                      isRefunded={!!ticket.refunded_at}
                    />
                  </TicketCardPreview>
                </div>
              );
            })}
            {(order.order_addon_items || []).filter((a) => !a.ticket_id).length > 0 && (
              <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
                <p className="text-sm font-medium mb-2" style={{ color: BRAND.dark }}>
                  Add-ons
                </p>
                {(order.order_addon_items || [])
                  .filter((a) => !a.ticket_id)
                  .map((a) => (
                    <div key={a.id} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                      {a.label}
                      {a.variant_label && ` – ${a.variant_label}`} × {a.quantity}
                    </div>
                  ))}
              </div>
            )}
          </div>

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
        </div>
      </div>
    </>
  );
}