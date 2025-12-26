import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Calendar, Loader2, MapPin, Clock, CheckCircle, Upload, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import QRCodeReact from 'qrcode.react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Reservation {
  id: string;
  status: string;
  customer_name: string;
  party_size: number;
  price_amount: number | null;
  currency: string;
  expires_at: string | null;
  created_at: string;
  qr_token: string;
  slot: {
    start_at: string;
    end_at: string;
  } | null;
  resource: {
    name: string;
    location_text: string | null;
    type: string;
  };
  payment: {
    status: string;
    proof_submitted: boolean;
  } | null;
}

export default function PublicReservation() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [proofUrl, setProofUrl] = useState('');

  useEffect(() => {
    if (qrToken) {
      fetchReservation();
    }
  }, [qrToken]);

  const fetchReservation = async () => {
    if (!qrToken) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('public_booking_get_reservation', {
        p_qr_token: qrToken,
      });

      if (error) throw error;
      setReservation(data);
    } catch (error: any) {
      console.error('Error fetching reservation:', error);
      toast.error('Failed to load reservation');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitProof = async () => {
    if (!proofUrl || !qrToken) {
      toast.error('Please enter a proof URL');
      return;
    }

    try {
      setUploading(true);
      const { error } = await supabase.rpc('public_booking_submit_proof', {
        p_qr_token: qrToken,
        p_proof_url: proofUrl,
      });

      if (error) throw error;
      toast.success('Payment proof submitted successfully');
      setProofUrl('');
      fetchReservation();
    } catch (error: any) {
      console.error('Error submitting proof:', error);
      toast.error(error.message || 'Failed to submit proof');
    } finally {
      setUploading(false);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Not Found</CardTitle>
            <CardDescription>This reservation could not be found</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const qrCodeUrl = `${window.location.origin}/r/${reservation.qr_token}`;
  const isExpired = reservation.expires_at && new Date(reservation.expires_at) < new Date();
  const needsPayment = reservation.status === 'pending_payment' && reservation.price_amount && reservation.price_amount > 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FBF8F4' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Your Booking</h1>
          <p className="text-muted-foreground">Reference: {reservation.qr_token.slice(0, 8)}</p>
        </div>

        {/* Status Alert */}
        {reservation.status === 'confirmed' && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Booking Confirmed</AlertTitle>
            <AlertDescription className="text-green-700">
              Your booking has been confirmed. Show the QR code below when you arrive.
            </AlertDescription>
          </Alert>
        )}

        {reservation.status === 'checked_in' && (
          <Alert className="mb-6 bg-blue-50 border-blue-200">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800">Checked In</AlertTitle>
            <AlertDescription className="text-blue-700">
              You have been checked in. Enjoy your experience!
            </AlertDescription>
          </Alert>
        )}

        {reservation.status === 'cancelled' && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800">Booking Cancelled</AlertTitle>
            <AlertDescription className="text-red-700">
              This booking has been cancelled.
            </AlertDescription>
          </Alert>
        )}

        {isExpired && reservation.status === 'pending_payment' && (
          <Alert className="mb-6 bg-gray-50 border-gray-200">
            <AlertCircle className="h-4 w-4 text-gray-600" />
            <AlertTitle className="text-gray-800">Booking Expired</AlertTitle>
            <AlertDescription className="text-gray-700">
              This booking has expired. Please make a new booking.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Booking Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Booking Details</CardTitle>
                <Badge className={getStatusColor(reservation.status)} variant="secondary">
                  {reservation.status.replace('_', ' ')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Resource</p>
                <p className="font-semibold text-lg">{reservation.resource.name}</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {reservation.resource.type}
                </p>
              </div>

              {reservation.resource.location_text && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium">{reservation.resource.location_text}</p>
                  </div>
                </div>
              )}

              {reservation.slot && (
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm text-muted-foreground">Date & Time</p>
                    <p className="font-medium">
                      {format(new Date(reservation.slot.start_at), 'EEEE, MMMM d, yyyy')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(reservation.slot.start_at), 'h:mm a')} -{' '}
                      {format(new Date(reservation.slot.end_at), 'h:mm a')}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground">Guest Name</p>
                <p className="font-medium">{reservation.customer_name}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Party Size</p>
                <p className="font-medium">
                  {reservation.party_size} {reservation.party_size === 1 ? 'person' : 'people'}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Booking Date</p>
                <p className="font-medium">
                  {format(new Date(reservation.created_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Information */}
          {reservation.price_amount !== null && reservation.price_amount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-bold">
                    {reservation.currency} {reservation.price_amount}
                  </p>
                </div>

                {reservation.payment && (
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Status</p>
                    <Badge
                      variant="secondary"
                      className={
                        reservation.payment.status === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : reservation.payment.status === 'proof_submitted'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-700'
                      }
                    >
                      {reservation.payment.status.replace('_', ' ')}
                    </Badge>
                  </div>
                )}

                {needsPayment && !reservation.payment?.proof_submitted && (
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-yellow-800">Payment Required</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                      Please complete payment and submit proof below to confirm your booking.
                      {reservation.expires_at && (
                        <span className="block mt-1">
                          Expires: {format(new Date(reservation.expires_at), 'MMM d, h:mm a')}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {reservation.payment?.proof_submitted && reservation.payment.status !== 'paid' && (
                  <Alert className="bg-blue-50 border-blue-200">
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-800">Proof Submitted</AlertTitle>
                    <AlertDescription className="text-blue-700">
                      Your payment proof has been submitted and is being reviewed.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Payment Instructions - Only show if pending and not submitted proof */}
          {needsPayment && !reservation.payment?.proof_submitted && (
            <Card>
              <CardHeader>
                <CardTitle>Submit Payment Proof</CardTitle>
                <CardDescription>
                  Upload your payment confirmation to complete your booking
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="proof_url">Payment Proof Image URL</Label>
                  <Input
                    id="proof_url"
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    placeholder="https://example.com/payment-proof.jpg"
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload your image to a service like Imgur or Google Drive and paste the link here
                  </p>
                </div>
                <Button onClick={handleSubmitProof} disabled={uploading || !proofUrl} className="w-full">
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Submit Proof
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* QR Code - Only show for confirmed/checked-in bookings */}
          {(reservation.status === 'confirmed' || reservation.status === 'checked_in') && (
            <Card>
              <CardHeader>
                <CardTitle>Your Booking QR Code</CardTitle>
                <CardDescription>Show this code when you arrive</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="p-6 bg-white rounded-lg border">
                  <QRCodeReact value={qrCodeUrl} size={200} />
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Booking Reference</p>
                  <code className="text-sm font-mono bg-muted px-3 py-1 rounded">
                    {reservation.qr_token}
                  </code>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Keep this page bookmarked to check your booking status</p>
        </div>
      </div>
    </div>
  );
}

