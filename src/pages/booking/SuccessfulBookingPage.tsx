/**
 * Page 5: Successful Booking (Confirmed)
 * 
 * Shows ticket with QR code.
 * Only accessible when:
 * - payment_status = 'paid'
 * - fulfillment_status = 'confirmed'
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { getBookingRoute } from '@/lib/utils/booking-route';
import EventTicketCard from '@/components/booking/EventTicketCard';
import { CheckCircle2, Download, Loader2 } from 'lucide-react';

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
  const [downloading, setDownloading] = useState(false);
  const ticketCardRef = useRef<HTMLDivElement>(null);
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
          currentPage: 'success',
        });

        // If route is not 'success', redirect accordingly (one-way)
        if (route !== 'success') {
          redirectedRef.current = true;
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
  }, [orderId, navigate, toast]);

  const handleDownloadTicket = async () => {
    if (!ticketCardRef.current || !order) {
      return;
    }

    setDownloading(true);
    try {
      // Dynamic imports - only loaded when user clicks download
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      // Capture the ticket card as canvas
      const canvas = await html2canvas(ticketCardRef.current, {
        background: BRAND.beigeSoft,
        useCORS: true,
        logging: false,
      });

      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download
      const bookingCode = order.order_no || order.id.slice(0, 8).toUpperCase();
      pdf.save(`ticket_${bookingCode}.pdf`);

      toast({
        title: 'Ticket downloaded',
        description: 'Your ticket has been saved.',
      });
    } catch (error: any) {
      console.error('Error downloading ticket:', error);
      toast({
        title: 'Download failed',
        description: error.message || 'Failed to download ticket. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
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
      <div className="min-h-screen pb-24" style={{ backgroundColor: BRAND.beigeSoft }}>
        <div className="container mx-auto px-4 pt-8 pb-6">
          <p className="text-center text-muted-foreground">No tickets found for this order.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: BRAND.beigeSoft }}>
      {/* Header */}
      <div className="container mx-auto px-4 pt-8 pb-6">
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

      {/* Ticket Card */}
      <div className="container mx-auto px-4">
        <div ref={ticketCardRef}>
          <EventTicketCard
            eventTitle={order.event.title}
            eventCategory={order.event.category}
            eventAddress={order.event.location_text}
            venueName={order.event.venue_name}
            eventDate={order.event.start_at}
            eventTime={order.event.end_at}
            eventStartTime={order.event.start_at}
            coverImageUrl={order.event.cover_image_url}
            bookingCode={bookingCode}
            tickets={tickets}
            showQR={true}
          />
        </div>

        {/* Download Button */}
        <div className="mt-6">
          <Button
            className="w-full h-12 text-base font-semibold"
            style={{ 
              backgroundColor: BRAND.green,
              color: 'white',
              fontFamily: "'Inter Tight', sans-serif"
            }}
            onClick={handleDownloadTicket}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Download Ticket
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

