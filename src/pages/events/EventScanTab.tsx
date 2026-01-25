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
  const [initializing, setInitializing] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    message: string;
    attendeeName?: string;
    ticketType?: string;
  } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrReaderRef = useRef<HTMLDivElement>(null);
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
      if (qrReaderRef.current) {
        qrReaderRef.current.style.display = 'none';
      }
    };
  }, []);

  const startScanning = async () => {
    if (!qrReaderRef.current) {
      toast({
        title: 'Error',
        description: 'Scanner container not found',
        variant: 'destructive',
      });
      return;
    }

    try {
      setInitializing(true);
      setLastScanResult(null);
      
      // Ensure the div is visible before initializing
      // Force visibility styles to override any tab hiding
      qrReaderRef.current.style.display = 'block';
      qrReaderRef.current.style.visibility = 'visible';
      qrReaderRef.current.style.minHeight = '300px';
      qrReaderRef.current.style.width = '100%';
      qrReaderRef.current.style.position = 'relative';
      
      // Wait for next frame to ensure styles are applied
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify element is actually visible
      const rect = qrReaderRef.current.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(qrReaderRef.current);
      
      console.log('Scanner container check:', {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left
      });
      
      if (rect.width === 0 || rect.height === 0 || computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        throw new Error('Scanner container is not visible. Please ensure the Scan tab is active and try again.');
      }

      // Stop any existing scanner first
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch (e) {
          // Ignore stop errors
        }
        scannerRef.current = null;
      }

      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      // Try to get available cameras
      let cameraId: string | null = null;
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          // Prefer back camera (environment), fallback to first available
          const backCamera = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          cameraId = backCamera?.id || devices[0].id;
        }
      } catch (err) {
        console.warn('Could not enumerate cameras, using default:', err);
      }

      const cameraConfig = cameraId 
        ? { deviceId: { exact: cameraId } }
        : { facingMode: 'environment' }; // Fallback to facingMode

      await scanner.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdgePercentage = 0.7;
            const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
            return {
              width: qrboxSize,
              height: qrboxSize
            };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (errorMessage) => {
          // Ignore scanning errors (they're frequent during scanning)
          // Only log if it's a real error, not just "not found"
          if (!errorMessage.includes('NotFoundException') && !errorMessage.includes('No MultiFormat Readers')) {
            console.debug('Scan error:', errorMessage);
          }
        }
      );

      setScanning(true);
      setInitializing(false);
    } catch (error: any) {
      console.error('Error starting scanner:', error);
      setInitializing(false);
      setScanning(false);
      
      // Hide the div if initialization failed
      if (qrReaderRef.current) {
        qrReaderRef.current.style.display = 'none';
      }
      
      let errorMessage = 'Failed to start camera. ';
      if (error.name === 'NotAllowedError' || error.message?.includes('permission')) {
        errorMessage += 'Please allow camera access and try again.';
      } else if (error.name === 'NotFoundError' || error.message?.includes('camera')) {
        errorMessage += 'No camera found. Please ensure your device has a camera.';
      } else {
        errorMessage += error.message || 'Please check permissions.';
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
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
    setInitializing(false);
    
    // Hide the div when stopping
    if (qrReaderRef.current) {
      qrReaderRef.current.style.display = 'none';
    }
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
      // Use maybeSingle() instead of single() to avoid 400 error when ticket not found
      let ticket: any = null;
      let fetchError: any = null;

      // Try querying by qr_code first
      const { data: ticketByQr, error: errorByQr } = await supabase
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
        .eq('qr_code', identifier)
        .maybeSingle();

      // If found by qr_code, use it
      if (ticketByQr) {
        ticket = ticketByQr;
      } else if (errorByQr) {
        // If there's an error (not just "not found"), log it but continue to try by id
        console.warn('Error querying by qr_code:', errorByQr);
      }

      // If not found by qr_code, try by id
      if (!ticket) {
        const { data: ticketById, error: errorById } = await supabase
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
          .eq('id', identifier)
          .maybeSingle();

        if (errorById) {
          fetchError = errorById;
        } else if (ticketById) {
          ticket = ticketById;
        }
      }

      if (fetchError) {
        console.error('Error fetching ticket:', fetchError);
        throw new Error(`Failed to lookup ticket: ${fetchError.message}`);
      }

      if (!ticket) {
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
              ref={qrReaderRef}
              id="qr-reader"
              className="w-full rounded-lg overflow-hidden border-2"
              style={{
                borderColor: scanning ? 'rgba(14,122,58,0.3)' : 'rgba(14,122,58,0.14)',
                minHeight: '300px',
                display: 'none', // Hidden by default, shown when scanning starts
              }}
            />

            {!scanning && !initializing && (
              <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <Camera className="h-16 w-16 mb-4" style={{ color: '#0E7A3A', opacity: 0.3 }} />
                <p className="text-muted-foreground mb-4">Camera not active</p>
                <Button
                  onClick={startScanning}
                  disabled={initializing}
                  style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Start Scanning
                </Button>
              </div>
            )}

            {(scanning || initializing) && (
              <div className="space-y-2">
                {initializing && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" style={{ color: '#0E7A3A' }} />
                    <span className="text-sm text-muted-foreground">Initializing camera...</span>
                  </div>
                )}
                <Button
                  onClick={stopScanning}
                  variant="outline"
                  className="w-full"
                  disabled={initializing}
                >
                  Stop Scanning
                </Button>
              </div>
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
