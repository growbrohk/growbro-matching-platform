import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useEventTickets } from '@/hooks/use-event-tickets';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Camera, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function EventScanTab({ eventId }: { eventId: string }) {
  const [scanning, setScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    message: string;
    attendeeName?: string;
    ticketType?: string;
  } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { refetch } = useEventTickets(eventId);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current = null;
          })
          .catch(() => {
            scannerRef.current = null;
          });
      }
    };
  }, []);

  const startScanning = async () => {
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' }, // Use back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // Ignore scanning errors (they're frequent during scanning)
        }
      );

      setScanning(true);
      setLastScanResult(null);
    } catch (error: any) {
      console.error('Error starting scanner:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start camera. Please check permissions.',
        variant: 'destructive',
      });
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
    }
    setScanning(false);
  };

  const extractTicketIdentifier = (payload: string): string | null => {
    // Try to parse as URL first
    try {
      const url = new URL(payload);
      // Check for ticket query param
      const ticketParam = url.searchParams.get('ticket') || url.searchParams.get('ticket_id') || url.searchParams.get('ticket_code');
      if (ticketParam) return ticketParam;
      
      // Check if pathname contains ticket info
      const pathParts = url.pathname.split('/');
      const ticketIndex = pathParts.findIndex(p => p === 'ticket' || p === 'tickets');
      if (ticketIndex >= 0 && pathParts[ticketIndex + 1]) {
        return pathParts[ticketIndex + 1];
      }
    } catch {
      // Not a URL, treat as direct identifier
    }

    // Treat as direct ticket id/code
    return payload.trim() || null;
  };

  const checkInTicket = async (identifier: string) => {
    try {
      // First, find the ticket by qr_code or id
      const { data: ticket, error: fetchError } = await supabase
        .from('tickets')
        .select(`
          id,
          qr_code,
          status,
          scanned_at,
          first_name,
          last_name,
          order_id,
          order:orders!inner(
            id,
            event_id
          ),
          ticket_type:ticket_types(
            name
          )
        `)
        .or(`qr_code.eq.${identifier},id.eq.${identifier}`)
        .single();

      if (fetchError || !ticket) {
        throw new Error('Ticket not found');
      }

      const order = ticket.order as any;
      const ticketType = ticket.ticket_type as any;

      // Verify ticket belongs to this event
      if (order.event_id !== eventId) {
        throw new Error('Ticket does not belong to this event');
      }

      // Check if already scanned
      if (ticket.status === 'scanned') {
        const attendeeName = ticket.first_name && ticket.last_name
          ? `${ticket.first_name} ${ticket.last_name}`
          : 'Attendee';
        
        setLastScanResult({
          success: false,
          message: 'Already checked in',
          attendeeName,
          ticketType: ticketType?.name,
        });
        
        toast({
          title: 'Already Checked In',
          description: `${attendeeName} (${ticketType?.name || 'Unknown'}) was already checked in.`,
          variant: 'default',
        });
        return;
      }

      // Update ticket status
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'scanned',
          scanned_at: new Date().toISOString(),
          scanned_by: (await supabase.auth.getUser()).data.user?.id || null,
        })
        .eq('id', ticket.id);

      if (updateError) throw updateError;

      const attendeeName = ticket.first_name && ticket.last_name
        ? `${ticket.first_name} ${ticket.last_name}`
        : 'Attendee';

      setLastScanResult({
        success: true,
        message: 'Successfully checked in',
        attendeeName,
        ticketType: ticketType?.name,
      });

      toast({
        title: 'Success',
        description: `${attendeeName} (${ticketType?.name || 'Unknown'}) checked in successfully!`,
      });

      // Refresh tickets list
      refetch();
    } catch (error: any) {
      console.error('Error checking in ticket:', error);
      const errorMessage = error.message || 'Failed to check in ticket';
      
      setLastScanResult({
        success: false,
        message: errorMessage,
      });

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleScanSuccess = async (decodedText: string) => {
    // Stop scanning temporarily
    await stopScanning();

    const identifier = extractTicketIdentifier(decodedText);
    if (!identifier) {
      toast({
        title: 'Invalid QR Code',
        description: 'Could not extract ticket identifier from QR code',
        variant: 'destructive',
      });
      return;
    }

    await checkInTicket(identifier);
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        <CardHeader>
          <CardTitle>QR Code Scanner</CardTitle>
          <CardDescription>
            Scan ticket QR codes to check in attendees
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Scanner Container */}
          <div className="space-y-4">
            <div
              id="qr-reader"
              className="w-full rounded-lg overflow-hidden border-2"
              style={{
                borderColor: scanning ? 'rgba(14,122,58,0.3)' : 'rgba(14,122,58,0.14)',
                minHeight: '300px',
                display: scanning ? 'block' : 'none',
              }}
            />

            {!scanning && (
              <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <Camera className="h-16 w-16 mb-4" style={{ color: '#0E7A3A', opacity: 0.3 }} />
                <p className="text-muted-foreground mb-4">Camera not active</p>
                <Button
                  onClick={startScanning}
                  style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Start Scanning
                </Button>
              </div>
            )}

            {scanning && (
              <Button
                onClick={stopScanning}
                variant="outline"
                className="w-full"
              >
                Stop Scanning
              </Button>
            )}
          </div>

          {/* Last Scan Result */}
          {lastScanResult && (
            <Alert
              className={lastScanResult.success ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}
            >
              {lastScanResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-600" />
              )}
              <AlertTitle className={lastScanResult.success ? 'text-green-800' : 'text-yellow-800'}>
                {lastScanResult.success ? 'Check-in Successful' : 'Check-in Failed'}
              </AlertTitle>
              <AlertDescription className={lastScanResult.success ? 'text-green-700' : 'text-yellow-700'}>
                {lastScanResult.attendeeName && lastScanResult.ticketType && (
                  <div className="font-medium mb-1">
                    {lastScanResult.attendeeName} - {lastScanResult.ticketType}
                  </div>
                )}
                {lastScanResult.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
