/**
 * Product checkout pending page - PayMe/FPS waiting for seller confirmation
 * Route: /:orgSlug/checkout/pending/:orderId
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithOrgAndProducts, type OrderWithOrgAndProducts } from '@/lib/api/product-checkout';
import { Clock } from 'lucide-react';

const BRAND = {
  green: '#0E7A3A',
  beigeSoft: '#FBF8F4',
  dark: '#0F1F17',
};

function formatPrice(amount: number, currency = 'HKD'): string {
  return `${currency === 'HKD' ? 'HK$' : currency} ${amount.toFixed(2)}`;
}

export default function ProductCheckoutPendingPage() {
  const { orgSlug, orderId } = useParams<{ orgSlug: string; orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<OrderWithOrgAndProducts | null>(null);
  const [loading, setLoading] = useState(true);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!orderId || !orgSlug) {
      navigate('/');
      return;
    }

    const fetchOrder = async () => {
      try {
        const orderData = await getOrderWithOrgAndProducts(orderId);
        if (!orderData) {
          toast({ title: 'Order not found', variant: 'destructive' });
          navigate(`/${orgSlug}`);
          return;
        }

        setData(orderData);
        setLoading(false);

        if (redirectedRef.current) return;

        const { order } = orderData;
        if (order.fulfillment_status === 'confirmed' || order.total_amount <= 0) {
          redirectedRef.current = true;
          navigate(`/${orgSlug}/checkout/success/${orderId}`, { replace: true });
          return;
        }
        if (order.payment_status !== 'submitted') {
          redirectedRef.current = true;
          navigate(`/${orgSlug}/checkout/payment/${orderId}`, { replace: true });
          return;
        }
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err?.message || 'Failed to load order.',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, orgSlug, navigate, toast]);

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

  if (!data) return null;

  const { order, org, order_items } = data;

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.beigeSoft }}>
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <Clock className="h-16 w-16 mx-auto mb-4" style={{ color: BRAND.green }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
            Payment submitted
          </h1>
          <p className="text-muted-foreground">
            Your receipt has been received. The seller will confirm your payment shortly.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="font-semibold text-lg mb-2" style={{ color: BRAND.dark }}>
              Order #{order.order_no} from {org.name}
            </p>
            <div className="border-t pt-4 mt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <div className="space-y-1 mb-4">
                {order_items.map((item, idx) => (
                  <p key={idx} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    {item.quantity}x {item.product_name}
                    {item.variant_label ? ` (${item.variant_label})` : ''}
                  </p>
                ))}
              </div>
              <div className="flex justify-between font-semibold pt-2" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <span style={{ color: BRAND.dark }}>Total</span>
                <span style={{ color: BRAND.green }}>{formatPrice(order.total_amount, order.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground text-center mb-8">
          You will receive an update once the seller confirms your payment.
        </p>

        <Button
          className="w-full"
          style={{ backgroundColor: BRAND.green, color: 'white' }}
          onClick={() => navigate(`/${orgSlug}`)}
        >
          Back to {org.name}
        </Button>
      </div>
    </div>
  );
}
