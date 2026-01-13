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
import TicketCard, { TicketCardPreview } from '@/components/booking/TicketCard';
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
  const ticketImageRefs = useRef<(HTMLDivElement | null)[]>([]);
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

  const setTicketRef = (index: number) => (el: HTMLDivElement | null) => {
    ticketImageRefs.current[index] = el;
  };

  const handleDownloadTickets = async () => {
    if (!order) {
      return;
    }

    const tickets = order.tickets ?? [];
    if (tickets.length === 0) {
      return;
    }

    setDownloading(true);
    try {
      // Wait a tick to ensure hidden nodes are painted
      await new Promise(r => setTimeout(r, 50));

      // Dynamic import - only loaded when user clicks download
      const html2canvas = (await import('html2canvas')).default;

      const bookingCode = order.order_no || order.id.slice(0, 8).toUpperCase();
      const files: File[] = [];
      const objectUrls: string[] = [];

        // Capture each ticket as a separate image
      for (let i = 0; i < tickets.length; i++) {
        const ref = ticketImageRefs.current[i];
        if (!ref || !tickets[i]?.qr_code) {
          continue;
        }

        // The ref points to the div containing TicketCard
        // Get bounding box to ensure correct dimensions
        const rect = ref.getBoundingClientRect();
        const measuredWidth = rect.width || 800;
        const measuredHeight = rect.height || 1200;

        // Capture the ticket as canvas (black background for ticket card)
        // The TicketCard component already has black background, so we capture the whole ref
        const canvas = await html2canvas(ref, {
          scale: 2,
          backgroundColor: '#000000',
          useCORS: true,
          logging: false,
          windowWidth: 800,
          windowHeight: measuredHeight,
          width: measuredWidth,
          height: measuredHeight,
        } as any);

        // Convert canvas to blob
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/png', 1.0);
        });

        if (!blob) {
          continue;
        }

        // Create file
        const filename = `ticket_${bookingCode}_${i + 1}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        files.push(file);
      }

      if (files.length === 0) {
        throw new Error('No tickets could be captured');
      }

      // Try Web Share API first (best for mobile)
      if (navigator.share && navigator.canShare({ files })) {
        try {
          await navigator.share({
            files,
            title: 'Your tickets',
            text: `Your tickets for ${order.event.title}`,
          });
          toast({
            title: 'Tickets shared',
            description: 'Your tickets have been shared. You can save them to your photos.',
          });
          return;
        } catch (shareError: any) {
          // User cancelled share, or share failed - fall through to fallback
          if (shareError.name !== 'AbortError') {
            console.warn('Web Share API failed:', shareError);
          }
        }
      }

      // Fallback: Open each image in a new tab (works well on mobile for long-press save)
      // Also attempt direct download for desktop browsers
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectUrl = URL.createObjectURL(file);
        objectUrls.push(objectUrl);

        // Try direct download first (works on desktop)
        try {
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = file.name;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          // Small delay between downloads
          if (i < files.length - 1) {
            await new Promise(r => setTimeout(r, 300));
          }
        } catch (downloadError) {
          // If download fails, open in new tab as fallback
          window.open(objectUrl, '_blank');
        }
      }

      toast({
        title: 'Tickets downloaded',
        description: files.length === 1 
          ? 'Your ticket has been saved.' 
          : `${files.length} tickets have been saved.`,
      });

      // Clean up object URLs after a delay
      setTimeout(() => {
        objectUrls.forEach(url => URL.revokeObjectURL(url));
      }, 5000);
    } catch (error: any) {
      console.error('Error downloading tickets:', error);
      toast({
        title: 'Download failed',
        description: error.message || 'Failed to download tickets. Please try again.',
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

  // Calculate price per ticket (total_amount / ticket count)
  const pricePerTicket = tickets.length > 0 
    ? Math.round((order.total_amount || 0) / tickets.length)
    : 0;

  // Venue name (venue_name or location_text)
  const venue = order.event.venue_name || order.event.location_text || 'TBA';

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

      {/* Ticket Cards - Render all tickets */}
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-4">
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
                  <p className="text-sm text-muted-foreground mb-2 text-center">
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

        {/* Hidden capture nodes for download - positioned off-screen but visible to html2canvas */}
        <div 
          style={{ 
            position: 'absolute',
            top: 0,
            left: '-9999px',
            width: '800px',
            height: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {tickets.map((ticket, index) => {
            if (!ticket.qr_code) return null;
            
            const ticketParticipantName = ticket.first_name || ticket.last_name
              ? `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim().toUpperCase()
              : order.buyer_first_name || order.buyer_last_name
              ? `${order.buyer_first_name || ''} ${order.buyer_last_name || ''}`.trim().toUpperCase()
              : 'GUEST';

            return (
              <div 
                key={`capture-${ticket.id || index}`} 
                ref={setTicketRef(index)}
                style={{
                  width: '800px',
                  marginBottom: '20px',
                  transform: 'none',
                  isolation: 'isolate',
                }}
              >
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
                  captureMode={true}
                />
              </div>
            );
          })}
        </div>

        {/* Download Button */}
        <div className="mt-6">
          {tickets.length > 1 && (
            <p className="text-sm text-muted-foreground mb-3 text-center">
              Each ticket will be saved as a photo.
            </p>
          )}
          <Button
            className="w-full h-12 text-base font-semibold"
            style={{ 
              backgroundColor: BRAND.green,
              color: 'white',
              fontFamily: "'Inter Tight', sans-serif"
            }}
            onClick={handleDownloadTickets}
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
                {tickets.length > 1 ? 'Download Tickets' : 'Download Ticket'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

