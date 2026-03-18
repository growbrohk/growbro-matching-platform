/**
 * Product checkout success page - Order confirmation
 * Route: /:orgSlug/checkout/success/:orderId
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getOrderWithOrgAndProducts, type OrderWithOrgAndProducts } from '@/lib/api/product-checkout';
import { getProductCheckoutRoute } from '@/lib/utils/product-checkout-route';

const BRAND = {
  green: '#0E7A3A',
  beigeSoft: '#FBF8F4',
  dark: '#0F1F17',
};

function formatPrice(amount: number, currency = 'HKD'): string {
  return `${currency === 'HKD' ? 'HK$' : currency} ${amount.toFixed(2)}`;
}

export default function ProductCheckoutSuccessPage() {
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
          toast({
            title: 'Order not found',
            variant: 'destructive',
          });
          navigate(`/${orgSlug}`);
          return;
        }

        setData(orderData);
        setLoading(false);

        if (redirectedRef.current) return;

        const route = getProductCheckoutRoute(orderData.order);
        if (route !== 'success') {
          redirectedRef.current = true;
          if (route === 'pending') {
            navigate(`/${orgSlug}/checkout/pending/${orderId}`, { replace: true });
          } else if (route === 'payment') {
            navigate(`/${orgSlug}/checkout/payment/${orderId}`, { replace: true });
          }
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
          <CheckCircle2 className="h-16 w-16 mx-auto mb-4" style={{ color: BRAND.green }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: BRAND.dark, fontFamily: "'Inter Tight', sans-serif" }}>
            Thank you for your order!
          </h1>
          <p className="text-muted-foreground">
            Order #{order.order_no}
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="font-semibold text-lg mb-2" style={{ color: BRAND.dark }}>
              {org.name}
            </p>
            <div className="border-t pt-4 mt-4" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <div className="space-y-1 mb-4">
                {order_items.map((item, idx) => (
                  <p key={idx} className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    {item.quantity}x {item.product_name}
                    {item.variant_label ? ` (${item.variant_label})` : ''} – {formatPrice(item.subtotal, order.currency)}
                  </p>
                ))}
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <span style={{ color: BRAND.dark }}>Total</span>
                <span style={{ color: BRAND.green }}>{formatPrice(order.total_amount, order.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground text-center mb-8">
          The seller will contact you about delivery or pickup.
        </p>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate(`/${orgSlug}`)}
          >
            Back to {org.name}
          </Button>
          <Button
            className="flex-1"
            style={{ backgroundColor: BRAND.green, color: 'white' }}
            onClick={() => navigate('/')}
          >
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
