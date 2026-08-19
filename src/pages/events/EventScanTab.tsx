import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useEventTickets } from '@/hooks/use-event-tickets';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Camera, CheckCircle2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getValidEndTimestamp, type EventTimeSlotFields } from '@/lib/utils/event-time-slots';

const TICKET_LOOKUP_SELECT = `
  id,
  qr_code,
  status,
  refunded_at,
  scanned_at,
  first_name,
  last_name,
  email,
  phone,
  remark,
  order_id,
  time_slot,
  order:orders!inner(
    id,
    event_id,
    buyer_first_name,
    buyer_last_name,
    buyer_email,
    buyer_phone,
    metadata,
    order_addon_items(
      order_id,
      ticket_id,
      label,
      variant_label,
      quantity
    )
  ),
  ticket_type:ticket_types(
    name,
    valid_for_days
  )
`;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

type ScanConfirmState = {
  ticketId: string;
  name: string;
  phone: string | null;
  email: string | null;
  ticketType: string;
  addons: string;
  remark: string;
  canRedeem: boolean;
  errorMessage?: string;
  validEnd?: number;
};

type AddonItem = {
  order_id: string;
  ticket_id: string | null;
  label: string | null;
  variant_label: string | null;
  quantity: number;
};

function formatAddon(a: { label: string | null; variant_label: string | null; quantity: number }) {
  const label = a.label || 'Add-on';
  const variantPart = a.variant_label ? `${a.variant_label} – ` : '';
  return `${variantPart}${label} × ${a.quantity}`;
}

function formatTicketAddons(ticketId: string, orderId: string, addonItems: AddonItem[]) {
  const perTicketAddons = addonItems.filter((a) => a.ticket_id === ticketId);
  const orderLevelAddons = addonItems.filter((a) => a.ticket_id == null && a.order_id === orderId);
  const allAddons = [...perTicketAddons, ...orderLevelAddons];
  return allAddons.length > 0 ? allAddons.map(formatAddon).join(', ') : '';
}

function parseCameraError(error: unknown): { name?: string; message: string } {
  if (error instanceof DOMException) {
    return { name: error.name, message: error.message };
  }
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error);
  const nameMatch = message.match(
    /(NotAllowedError|NotFoundError|OverconstrainedError|NotReadableError|SecurityError)/,
  );
  return { name: nameMatch?.[1], message };
}

function getCameraErrorMessage(error: unknown) {
  const { name, message } = parseCameraError(error);
  switch (name) {
    case 'NotAllowedError':
      return 'Camera permission denied. Allow camera access in browser settings.';
    case 'NotFoundError':
      return getNoCameraMessage();
    case 'OverconstrainedError':
      return 'Could not open the selected camera. Try a different browser or close other apps using the camera.';
    case 'NotReadableError':
      return 'Camera is in use by another application.';
    case 'SecurityError':
      return 'Camera blocked by browser security. Use HTTPS or localhost.';
    default:
      return message || `${name || 'Error'}: could not start camera.`;
  }
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isEmbeddedBrowser() {
  return /Electron|Cursor/i.test(navigator.userAgent);
}

async function hasVideoInputDevice(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return true;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === 'videoinput');
  } catch {
    return true;
  }
}

function getNoCameraMessage() {
  if (isEmbeddedBrowser()) {
    return 'No camera is available in this in-app preview browser. Open this page in Chrome, Safari, or Edge to scan.';
  }
  return 'No camera detected. On macOS, allow camera access for your browser in System Settings > Privacy & Security > Camera, close other apps using the camera, then retry.';
}

async function primeCameraPermission() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
    });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // Let scanner.start surface the real permission error.
  }
}

async function cleanupScannerInstance(scanner: Html5Qrcode) {
  try {
    await scanner.stop();
  } catch {
    // Scanner may not have started.
  }
  try {
    scanner.clear();
  } catch {
    // Ignore clear errors.
  }
}

function clearScannerContainer() {
  const container = document.getElementById('qr-reader');
  if (container) {
    container.innerHTML = '';
  }
}

async function buildCameraAttempts(): Promise<Array<string | { facingMode: string }>> {
  const attempts: Array<string | { facingMode: string }> = [];
  let devices: Array<{ id: string; label: string }> = [];

  try {
    devices = await Html5Qrcode.getCameras();
  } catch (err) {
    console.warn('Could not enumerate cameras:', err);
  }

  const validDevices = devices.filter((d) => Boolean(d.id));

  if (isMobileDevice()) {
    const backCamera = validDevices.find((d) => /back|rear|environment/i.test(d.label));
    if (backCamera?.id) attempts.push(backCamera.id);
    if (validDevices[0]?.id && validDevices[0].id !== backCamera?.id) {
      attempts.push(validDevices[0].id);
    }
    attempts.push({ facingMode: 'environment' });
    attempts.push({ facingMode: 'user' });
  } else {
    attempts.push({ facingMode: 'user' });
    for (const device of validDevices) {
      if (!attempts.includes(device.id)) {
        attempts.push(device.id);
      }
    }
  }

  if (attempts.length === 0) {
    attempts.push({ facingMode: 'user' });
  }

  return attempts;
}

function buildAttendeeName(ticket: {
  first_name: string | null;
  last_name: string | null;
  order: {
    buyer_first_name?: string | null;
    buyer_last_name?: string | null;
  };
}) {
  if (ticket.first_name && ticket.last_name) {
    return `${ticket.first_name} ${ticket.last_name}`.trim();
  }
  if (ticket.order?.buyer_first_name && ticket.order?.buyer_last_name) {
    return `${ticket.order.buyer_first_name} ${ticket.order.buyer_last_name}`.trim();
  }
  return ticket.first_name || ticket.order?.buyer_first_name || 'Attendee';
}

export function EventScanTab({
  eventId,
  eventSchedule,
}: {
  eventId: string;
  eventSchedule: EventTimeSlotFields | null;
}) {
  const [scanning, setScanning] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    message: string;
    attendeeName?: string;
    ticketType?: string;
  } | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<ScanConfirmState | null>(null);
  const [confirmRemark, setConfirmRemark] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrReaderRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);
  const { refetch } = useEventTickets(eventId);
  const { user } = useAuth();
  const { toast } = useToast();

  const scannerConfig = {
    fps: 10,
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
      const qrboxSize = Math.max(200, Math.floor(minEdgeSize * 0.7));
      return { width: qrboxSize, height: qrboxSize };
    },
  };

  useEffect(() => {
    return () => {
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

  const closeConfirmDialog = () => {
    setConfirmDialogOpen(false);
    setConfirmData(null);
    setConfirmRemark('');
    setConfirmLoading(false);
    isProcessingRef.current = false;
  };

  const openConfirmDialog = (data: ScanConfirmState) => {
    setConfirmData(data);
    setConfirmRemark(data.remark);
    setConfirmDialogOpen(true);
  };

  const startScannerCamera = async (
    onScan: (decodedText: string) => void,
    onScanError: (errorMessage: string) => void,
  ) => {
    await primeCameraPermission();
    const attempts = await buildCameraAttempts();

    let lastError: unknown;

    for (const cameraConfig of attempts) {
      clearScannerContainer();
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      try {
        await scanner.start(cameraConfig, scannerConfig, onScan, onScanError);
        return;
      } catch (err) {
        lastError = err;
        console.warn('Camera start attempt failed:', cameraConfig, err);
        await cleanupScannerInstance(scanner);
        scannerRef.current = null;
      }
    }

    throw lastError ?? new Error('Could not start camera.');
  };

  const startScanning = async () => {
    if (!qrReaderRef.current) {
      toast({
        title: 'Error',
        description: 'Scanner container not found',
        variant: 'destructive',
      });
      return;
    }

    if (!window.isSecureContext) {
      toast({
        title: 'Camera unavailable',
        description: 'Camera requires a secure connection (HTTPS or localhost).',
        variant: 'destructive',
      });
      return;
    }

    if (!(await hasVideoInputDevice())) {
      toast({
        title: 'No camera found',
        description: getNoCameraMessage(),
        variant: 'destructive',
      });
      return;
    }

    try {
      setInitializing(true);
      setLastScanResult(null);

      qrReaderRef.current.style.display = 'block';
      qrReaderRef.current.style.visibility = 'visible';
      qrReaderRef.current.style.minHeight = '300px';
      qrReaderRef.current.style.width = '100%';
      qrReaderRef.current.style.position = 'relative';

      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => setTimeout(resolve, 100));

      const rect = qrReaderRef.current.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(qrReaderRef.current);

      if (
        rect.width === 0 ||
        rect.height === 0 ||
        computedStyle.display === 'none' ||
        computedStyle.visibility === 'hidden'
      ) {
        throw new Error('Scanner container is not visible. Please ensure the Scan tab is active and try again.');
      }

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {
          // Ignore stop errors
        }
        try {
          scannerRef.current.clear();
        } catch {
          // Ignore clear errors
        }
        scannerRef.current = null;
      }

      clearScannerContainer();

      const onScan = (decodedText: string) => {
        handleScanSuccess(decodedText);
      };
      const onScanError = (errorMessage: string) => {
        if (
          !errorMessage.includes('NotFoundException') &&
          !errorMessage.includes('No MultiFormat Readers')
        ) {
          console.debug('Scan error:', errorMessage);
        }
      };

      await startScannerCamera(onScan, onScanError);

      setScanning(true);
      setInitializing(false);
    } catch (error: unknown) {
      console.error('Error starting scanner:', error);
      setInitializing(false);
      setScanning(false);

      if (qrReaderRef.current) {
        qrReaderRef.current.style.display = 'none';
      }

      toast({
        title: 'Error',
        description: `Failed to start camera. ${getCameraErrorMessage(error)}`,
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

    if (qrReaderRef.current) {
      qrReaderRef.current.style.display = 'none';
    }
  };

  const extractTicketIdentifier = (payload: string): string | null => {
    try {
      const url = new URL(payload);
      const ticketParam =
        url.searchParams.get('ticket') ||
        url.searchParams.get('ticket_id') ||
        url.searchParams.get('ticket_code');
      if (ticketParam) return ticketParam;

      const pathParts = url.pathname.split('/');
      const ticketIndex = pathParts.findIndex((p) => p === 'ticket' || p === 'tickets');
      if (ticketIndex >= 0 && pathParts[ticketIndex + 1]) {
        return pathParts[ticketIndex + 1];
      }
    } catch {
      // Not a URL, treat as direct identifier
    }

    return payload.trim() || null;
  };

  const fetchTicketByIdentifier = async (identifier: string) => {
    let ticket: Record<string, unknown> | null = null;
    let fetchError: { message: string } | null = null;

    const { data: ticketByQr, error: errorByQr } = await supabase
      .from('tickets')
      .select(TICKET_LOOKUP_SELECT)
      .eq('qr_code', identifier)
      .maybeSingle();

    if (ticketByQr) {
      ticket = ticketByQr as Record<string, unknown>;
    } else if (errorByQr) {
      console.warn('Error querying by qr_code:', errorByQr);
    }

    if (!ticket && isValidUuid(identifier)) {
      const { data: ticketById, error: errorById } = await supabase
        .from('tickets')
        .select(TICKET_LOOKUP_SELECT)
        .eq('id', identifier)
        .maybeSingle();

      if (errorById) {
        fetchError = errorById;
      } else if (ticketById) {
        ticket = ticketById as Record<string, unknown>;
      }
    }

    if (fetchError) {
      throw new Error(`Failed to lookup ticket: ${fetchError.message}`);
    }

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    return ticket;
  };

  const lookupTicket = async (identifier: string): Promise<ScanConfirmState> => {
    const ticket = await fetchTicketByIdentifier(identifier);

    const order = ticket.order as {
      id: string;
      event_id: string;
      buyer_first_name?: string | null;
      buyer_last_name?: string | null;
      buyer_email?: string | null;
      buyer_phone?: string | null;
      metadata?: { remark?: string } | null;
      order_addon_items?: AddonItem[];
    };
    const ticketType = ticket.ticket_type as { name?: string; valid_for_days?: string } | null;

    if (order.event_id !== eventId) {
      throw new Error('Ticket does not belong to this event');
    }

    const name = buildAttendeeName({
      first_name: ticket.first_name as string | null,
      last_name: ticket.last_name as string | null,
      order,
    });
    const phone = (ticket.phone as string | null) || order.buyer_phone || null;
    const email = (ticket.email as string | null) || order.buyer_email || null;
    const ticketTypeName = ticketType?.name || 'Unknown';
    const remark = (ticket.remark as string | null) || order.metadata?.remark || '';

    const addons = formatTicketAddons(
      ticket.id as string,
      order.id,
      order.order_addon_items ?? [],
    );

    let validEnd: number | undefined;
    if (eventSchedule) {
      const now = new Date().getTime();
      const validForDays = ticketType?.valid_for_days || 'day_1';
      const ticketTimeSlot = ticket.time_slot as string | null | undefined;
      validEnd = getValidEndTimestamp(
        eventSchedule,
        validForDays,
        ticketTimeSlot ?? (validForDays !== 'each' ? validForDays : null),
      );

      if (now > validEnd + FIVE_MINUTES_MS) {
        return {
          ticketId: ticket.id as string,
          name,
          phone,
          email,
          ticketType: ticketTypeName,
          addons,
          remark,
          canRedeem: false,
          errorMessage: 'Ticket no longer valid for this time slot',
          validEnd,
        };
      }
    }

    if (ticket.refunded_at) {
      return {
        ticketId: ticket.id as string,
        name,
        phone,
        email,
        ticketType: ticketTypeName,
        addons,
        remark,
        canRedeem: false,
        errorMessage: 'Ticket refunded',
        validEnd,
      };
    }

    if (ticket.status === 'scanned') {
      return {
        ticketId: ticket.id as string,
        name,
        phone,
        email,
        ticketType: ticketTypeName,
        addons,
        remark,
        canRedeem: false,
        errorMessage: 'Already checked in',
        validEnd,
      };
    }

    return {
      ticketId: ticket.id as string,
      name,
      phone,
      email,
      ticketType: ticketTypeName,
      addons,
      remark,
      canRedeem: true,
      validEnd,
    };
  };

  const confirmCheckIn = async () => {
    if (!confirmData || !confirmData.canRedeem || confirmLoading) return;

    const { ticketId, name, ticketType, validEnd, remark: originalRemark } = confirmData;
    const remarkChanged = confirmRemark !== originalRemark;
    const remarkValue = confirmRemark;

    if (validEnd != null && Date.now() > validEnd + FIVE_MINUTES_MS) {
      const errorMessage = 'Ticket no longer valid for this time slot';
      setLastScanResult({
        success: false,
        message: errorMessage,
        attendeeName: name,
        ticketType,
      });
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'Not signed in',
        variant: 'destructive',
      });
      return;
    }

    setConfirmLoading(true);

    const payload: Record<string, unknown> = {
      status: 'scanned',
      scanned_at: new Date().toISOString(),
      scanned_by: user.id,
    };
    if (remarkChanged) {
      payload.remark = remarkValue || null;
    }

    closeConfirmDialog();

    try {
      const { data: updated, error: updateError } = await supabase
        .from('tickets')
        .update(payload)
        .eq('id', ticketId)
        .eq('status', 'valid')
        .is('refunded_at', null)
        .select('id');

      if (updateError) throw updateError;

      if (!updated || updated.length === 0) {
        throw new Error('Ticket was already checked in.');
      }

      setLastScanResult({
        success: true,
        message: 'Successfully checked in',
        attendeeName: name,
        ticketType,
      });

      toast({
        title: 'Success',
        description: `${name} (${ticketType}) checked in successfully!`,
      });

      void refetch();
    } catch (error: unknown) {
      console.error('Error confirming check-in:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to check in ticket';

      setLastScanResult({
        success: false,
        message: errorMessage,
        attendeeName: name,
        ticketType,
      });

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleScanSuccess = async (decodedText: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const identifier = extractTicketIdentifier(decodedText);
    if (!identifier) {
      isProcessingRef.current = false;
      await stopScanning();
      toast({
        title: 'Invalid QR Code',
        description: 'Could not extract ticket identifier from QR code',
        variant: 'destructive',
      });
      return;
    }

    setLookupLoading(true);
    const stopPromise = stopScanning();

    try {
      const result = await lookupTicket(identifier);
      openConfirmDialog(result);

      if (!result.canRedeem && result.errorMessage === 'Already checked in') {
        toast({
          title: 'Already Checked In',
          description: `${result.name} (${result.ticketType}) was already checked in.`,
        });
      }
    } catch (error: unknown) {
      console.error('Error looking up ticket:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to lookup ticket';

      setLastScanResult({
        success: false,
        message: errorMessage,
      });

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });

      isProcessingRef.current = false;
    } finally {
      await stopPromise;
      setLookupLoading(false);
    }
  };

  const showStartScanning =
    !scanning && !initializing && !lookupLoading && !confirmDialogOpen;

  return (
    <div className="space-y-6">
      <Card className="rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        <CardHeader>
          <CardTitle>QR Code Scanner</CardTitle>
          <CardDescription>Scan ticket QR codes to check in attendees</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div
              ref={qrReaderRef}
              id="qr-reader"
              className="w-full rounded-lg overflow-hidden border-2"
              style={{
                borderColor: scanning ? 'rgba(14,122,58,0.3)' : 'rgba(14,122,58,0.14)',
                minHeight: '300px',
                display: 'none',
              }}
            />

            {lookupLoading && (
              <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <Loader2 className="h-8 w-8 animate-spin mb-4" style={{ color: '#0E7A3A' }} />
                <p className="text-muted-foreground">Looking up ticket...</p>
              </div>
            )}

            {showStartScanning && (
              <div
                className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg"
                style={{ borderColor: 'rgba(14,122,58,0.14)' }}
              >
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

          {lastScanResult && (
            <Alert
              className={
                lastScanResult.success ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
              }
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

      <Dialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeConfirmDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmData?.canRedeem ? 'Confirm Check-in' : 'Ticket Details'}
            </DialogTitle>
            <DialogDescription>
              {confirmData?.canRedeem
                ? 'Review ticket details and confirm before checking in.'
                : confirmData?.errorMessage || 'This ticket cannot be checked in.'}
            </DialogDescription>
          </DialogHeader>

          {confirmData && (
            <div className="space-y-4 py-2">
              {!confirmData.canRedeem && confirmData.errorMessage && (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-700">
                    {confirmData.errorMessage}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3 text-sm">
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{confirmData.name}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{confirmData.phone || '-'}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Email</span>
                  <span className="break-all">{confirmData.email || '-'}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Ticket Type</span>
                  <span>{confirmData.ticketType}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Add-ons</span>
                  <span>{confirmData.addons || 'None'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scan-remark">Remark</Label>
                <Textarea
                  id="scan-remark"
                  value={confirmRemark}
                  onChange={(e) => setConfirmRemark(e.target.value)}
                  placeholder="Add a remark (optional)"
                  disabled={!confirmData.canRedeem || confirmLoading}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeConfirmDialog} disabled={confirmLoading}>
              Cancel
            </Button>
            {confirmData?.canRedeem && (
              <Button
                onClick={confirmCheckIn}
                disabled={confirmLoading}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              >
                {confirmLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking in...
                  </>
                ) : (
                  'Confirm Check-in'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
