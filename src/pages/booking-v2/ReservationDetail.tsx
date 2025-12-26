import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, CheckCircle, XCircle, Eye } from 'lucide-react';
import { format } from 'date-fns';
import QRCodeReact from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ReservationDetail {
  id: string;
  resource_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  party_size: number;
  status: string;
  price_amount: number | null;
  currency: string;
  answers: any;
  qr_token: string;
  created_at: string;
  expires_at: string | null;
  booking_resources: {
    id: string;
    name: string;
    type: string;
    location_text: string | null;
  };
  booking_slots: {
    start_at: string;
    end_at: string;
  } | null;
  booking_payment_intents: {
    id: string;
    status: string;
    proof_image_url: string | null;
    paid_at: string | null;
  }[];
}

export default function ReservationDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showProofDialog, setShowProofDialog] = useState(false);

  useEffect(() => {
    if (currentOrg?.id && id) {
      fetchReservation();
    }
  }, [currentOrg?.id, id]);

  const fetchReservation = async () => {
    if (!currentOrg?.id || !id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('booking_reservations')
        .select(`
          *,
          booking_resources!inner(id, name, type, location_text, org_id),
          booking_slots(start_at, end_at),
          booking_payment_intents(id, status, proof_image_url, paid_at)
        `)
        .eq('id', id)
        .eq('booking_resources.org_id', currentOrg.id)
        .single();

      if (error) throw error;
      setReservation(data);
    } catch (error: any) {
      console.error('Error fetching reservation:', error);
      toast.error('Failed to load reservation');
      navigate('/app/booking-v2/reservations');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!reservation) return;

    try {
      setUpdating(true);
      const { data, error } = await supabase.rpc('host_booking_mark_paid', {
        p_reservation_id: reservation.id,
      });

      if (error) throw error;
      toast.success('Marked as paid and confirmed');
      fetchReservation();
    } catch (error: any) {
      console.error('Error marking as paid:', error);
      toast.error(error.message || 'Failed to update payment status');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;
    if (!confirm('Are you sure you want to cancel this reservation?')) return;

    try {
      setUpdating(true);
      const { error } = await supabase
        .from('booking_reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservation.id);

      if (error) throw error;
      toast.success('Reservation cancelled');
      fetchReservation();
    } catch (error: any) {
      console.error('Error cancelling reservation:', error);
      toast.error('Failed to cancel reservation');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-700';
      case 'pending_payment':
        return 'bg-yellow-100 text-yellow-700';
      case 'checked_in':
        return 'bg-blue-100 text-blue-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'expired':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-700';
      case 'proof_submitted':
        return 'bg-orange-100 text-orange-700';
      case 'unpaid':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Reservation not found</p>
      </div>
    );
  }

  const paymentIntent = reservation.booking_payment_intents?.[0];
  const publicUrl = `${window.location.origin}/r/${reservation.qr_token}`;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app/booking-v2/reservations')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{reservation.customer_name}</h1>
            <p className="text-muted-foreground mt-1">
              Reservation #{reservation.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(reservation.status)} variant="secondary">
            {reservation.status.replace('_', ' ')}
          </Badge>
          {paymentIntent && (
            <Badge className={getPaymentStatusColor(paymentIntent.status)} variant="secondary">
              {paymentIntent.status.replace('_', ' ')}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{reservation.customer_name}</p>
            </div>
            {reservation.customer_email && (
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{reservation.customer_email}</p>
              </div>
            )}
            {reservation.customer_phone && (
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{reservation.customer_phone}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Party Size</p>
              <p className="font-medium">
                {reservation.party_size} {reservation.party_size === 1 ? 'person' : 'people'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Resource</p>
              <p className="font-medium">{reservation.booking_resources.name}</p>
              <p className="text-sm text-muted-foreground capitalize">
                {reservation.booking_resources.type}
              </p>
            </div>
            {reservation.booking_resources.location_text && (
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">{reservation.booking_resources.location_text}</p>
              </div>
            )}
            {reservation.booking_slots && (
              <div>
                <p className="text-sm text-muted-foreground">Time Slot</p>
                <p className="font-medium">
                  {format(new Date(reservation.booking_slots.start_at), 'MMMM d, yyyy')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(reservation.booking_slots.start_at), 'h:mm a')} -{' '}
                  {format(new Date(reservation.booking_slots.end_at), 'h:mm a')}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">
                {format(new Date(reservation.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {reservation.answers && Object.keys(reservation.answers).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(reservation.answers).map(([key, value]) => (
              <div key={key}>
                <p className="text-sm text-muted-foreground capitalize">
                  {key.replace(/_/g, ' ')}
                </p>
                <p className="font-medium">{String(value)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payment Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Amount</p>
            <p className="text-2xl font-bold">
              {reservation.price_amount !== null && reservation.price_amount > 0
                ? `${reservation.currency} ${reservation.price_amount}`
                : 'Free'}
            </p>
          </div>
          {paymentIntent && (
            <>
              <div>
                <p className="text-sm text-muted-foreground">Payment Status</p>
                <Badge className={getPaymentStatusColor(paymentIntent.status)} variant="secondary">
                  {paymentIntent.status.replace('_', ' ')}
                </Badge>
              </div>
              {paymentIntent.proof_image_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Payment Proof</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowProofDialog(true)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Proof
                  </Button>
                </div>
              )}
              {paymentIntent.paid_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Paid At</p>
                  <p className="font-medium">
                    {format(new Date(paymentIntent.paid_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QR Code</CardTitle>
          <CardDescription>
            Customer's booking confirmation code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div
              className="p-4 bg-white rounded-lg border cursor-pointer"
              onClick={() => setShowQrDialog(true)}
            >
              <QRCodeReact value={publicUrl} size={120} />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-2">Token</p>
              <code className="text-sm font-mono bg-muted px-3 py-2 rounded block break-all">
                {reservation.qr_token}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  toast.success('Link copied to clipboard');
                }}
              >
                Copy Link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {paymentIntent && paymentIntent.status !== 'paid' && reservation.status !== 'cancelled' && (
            <Button onClick={handleMarkPaid} disabled={updating}>
              {updating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Paid
                </>
              )}
            </Button>
          )}
          {reservation.status !== 'cancelled' && reservation.status !== 'checked_in' && (
            <Button variant="destructive" onClick={handleCancel} disabled={updating}>
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Reservation
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => window.open(publicUrl, '_blank')}
          >
            View Customer Page
          </Button>
        </CardContent>
      </Card>

      {/* QR Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Booking QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="p-6 bg-white rounded-lg border">
              <QRCodeReact value={publicUrl} size={256} />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Scan this code to view the booking
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Proof Dialog */}
      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {paymentIntent?.proof_image_url && (
              <img
                src={paymentIntent.proof_image_url}
                alt="Payment proof"
                className="w-full h-auto rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

