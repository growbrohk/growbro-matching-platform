import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, QrCode, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Booking {
  id: string;
  brand_org_id: string;
  venue_org_id: string;
  resource_product_id: string;
  start_at: string;
  end_at: string;
  status: string;
  booking_entitlements?: Array<{
    id: string;
    code: string;
    redeemed_at: string | null;
  }>;
  products?: {
    title: string;
  };
  brand_org?: {
    name: string;
  };
  venue_org?: {
    name: string;
  };
}

export default function Bookings() {
  const { currentOrg } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;

    const fetchBookings = async () => {
      try {
        const { data: bookingsData, error } = await supabase
          .from('bookings')
          .select('*')
          .or(`brand_org_id.eq.${currentOrg.id},venue_org_id.eq.${currentOrg.id}`)
          .order('start_at', { ascending: false });

        if (error) throw error;

        // Fetch related data separately
        const enrichedBookings = await Promise.all(
          (bookingsData || []).map(async (booking) => {
            const [entitlements, product, brandOrg, venueOrg] = await Promise.all([
              supabase
                .from('booking_entitlements')
                .select('id, code, redeemed_at')
                .eq('booking_id', booking.id)
                .limit(1),
              supabase
                .from('products')
                .select('title')
                .eq('id', booking.resource_product_id)
                .single(),
              supabase
                .from('orgs')
                .select('name')
                .eq('id', booking.brand_org_id)
                .single(),
              supabase
                .from('orgs')
                .select('name')
                .eq('id', booking.venue_org_id)
                .single(),
            ]);

            return {
              ...booking,
              booking_entitlements: entitlements.data || [],
              products: product.data,
              brand_org: brandOrg.data,
              venue_org: venueOrg.data,
            };
          })
        );

        setBookings(enrichedBookings);
      } catch (error: any) {
        console.error('Error fetching bookings:', error);
        toast.error('Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [currentOrg]);

  const handleRedeem = async (code: string) => {
    try {
      const { error } = await supabase.rpc('redeem_booking', { p_code: code });
      if (error) throw error;
      toast.success('Booking redeemed successfully!');
      // Refresh bookings
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message || 'Failed to redeem booking');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: { variant: 'secondary' as const, icon: Clock, label: 'Pending' },
      confirmed: { variant: 'default' as const, icon: CheckCircle2, label: 'Confirmed' },
      cancelled: { variant: 'destructive' as const, icon: Clock, label: 'Cancelled' },
      completed: { variant: 'outline' as const, icon: CheckCircle2, label: 'Completed' },
    };
    return variants[status] || variants.pending;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
              Bookings
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Manage your venue asset bookings
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
          </div>
        ) : bookings.length === 0 ? (
          <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 mb-4" style={{ color: 'rgba(15,31,23,0.4)' }} />
              <h3 className="text-lg font-semibold mb-2">No bookings yet</h3>
              <p className="text-sm text-center" style={{ color: 'rgba(15,31,23,0.72)' }}>
                Bookings will appear here when created
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {bookings.map((booking) => {
              const statusInfo = getStatusBadge(booking.status);
              const entitlement = booking.booking_entitlements?.[0];
              const isBrand = booking.brand_org_id === currentOrg?.id;

              return (
                <Card key={booking.id} className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                          {(booking.products as any)?.title || 'Venue Asset'}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {isBrand ? (
                            <>Venue: {(booking.venue_org as any)?.name}</>
                          ) : (
                            <>Brand: {(booking.brand_org as any)?.name}</>
                          )}
                        </CardDescription>
                      </div>
                      <Badge variant={statusInfo.variant}>
                        <statusInfo.icon className="h-3 w-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span style={{ color: 'rgba(15,31,23,0.6)' }}>Start:</span>
                        <div className="font-medium">
                          {format(new Date(booking.start_at), 'MMM d, yyyy h:mm a')}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: 'rgba(15,31,23,0.6)' }}>End:</span>
                        <div className="font-medium">
                          {format(new Date(booking.end_at), 'MMM d, yyyy h:mm a')}
                        </div>
                      </div>
                    </div>

                    {entitlement && (
                      <div className="p-4 rounded-2xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium mb-1">QR Code</div>
                            <div className="font-mono text-lg">{entitlement.code}</div>
                          </div>
                          <div>
                            {entitlement.redeemed_at ? (
                              <Badge variant="outline" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Redeemed
                              </Badge>
                            ) : isBrand ? (
                              <Button
                                size="sm"
                                onClick={() => handleRedeem(entitlement.code)}
                                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                              >
                                <QrCode className="h-4 w-4 mr-2" />
                                Redeem
                              </Button>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

