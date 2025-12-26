import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Calendar, Loader2, Search, Filter, QrCode } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

interface Reservation {
  id: string;
  resource_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  party_size: number;
  status: string;
  price_amount: number | null;
  currency: string;
  created_at: string;
  qr_token: string;
  booking_resources: {
    name: string;
    type: string;
  };
  booking_slots: {
    start_at: string;
    end_at: string;
  } | null;
  booking_payment_intents: {
    status: string;
  }[];
}

export default function ReservationsList() {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (currentOrg?.id) {
      fetchReservations();
    }
  }, [currentOrg?.id]);

  const fetchReservations = async () => {
    if (!currentOrg?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('booking_reservations' as any)
        .select(`
          *,
          booking_resources!inner(name, type, org_id),
          booking_slots(start_at, end_at),
          booking_payment_intents(status)
        `)
        .eq('booking_resources.org_id', currentOrg.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReservations(data as any || []);
    } catch (error: any) {
      console.error('Error fetching reservations:', error);
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
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

  const getPaymentStatus = (paymentIntents: any[]) => {
    if (!paymentIntents || paymentIntents.length === 0) return 'unpaid';
    return paymentIntents[0].status;
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

  const filteredReservations = reservations.filter((reservation) => {
    const matchesSearch =
      reservation.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reservation.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reservation.customer_phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reservation.booking_resources.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || reservation.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reservations</h1>
          <p className="text-muted-foreground mt-2">
            View and manage all booking reservations
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending_payment">Pending Payment</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="checked_in">Checked In</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredReservations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No reservations found</h3>
            <p className="text-muted-foreground text-center">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Reservations will appear here once customers book'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReservations.map((reservation) => (
            <Card
              key={reservation.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/app/booking/reservations/${reservation.id}`)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">
                            {reservation.customer_name || 'Unknown'}
                          </h3>
                          <Badge className={getStatusColor(reservation.status)} variant="secondary">
                            {reservation.status.replace('_', ' ')}
                          </Badge>
                          <Badge
                            className={getPaymentStatusColor(
                              getPaymentStatus(reservation.booking_payment_intents)
                            )}
                            variant="secondary"
                          >
                            {getPaymentStatus(reservation.booking_payment_intents)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {reservation.booking_resources.name} •{' '}
                          {reservation.party_size} {reservation.party_size === 1 ? 'person' : 'people'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Contact</p>
                        <p className="font-medium">
                          {reservation.customer_email || reservation.customer_phone || 'N/A'}
                        </p>
                      </div>
                      {reservation.booking_slots && (
                        <div>
                          <p className="text-muted-foreground">Slot Time</p>
                          <p className="font-medium">
                            {format(new Date(reservation.booking_slots.start_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-muted-foreground">Created</p>
                        <p className="font-medium">
                          {format(new Date(reservation.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>

                    {reservation.price_amount !== null && reservation.price_amount > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold">
                          {reservation.currency} {reservation.price_amount}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <QrCode className="h-5 w-5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground font-mono">
                      {reservation.qr_token.slice(0, 8)}...
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

