import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getOrderWithEvent, type OrderWithEvent } from '@/lib/api/bookings';
import { readBookingOrderFromNavigationState } from '@/lib/booking/order-navigation-state';

type Options = {
  orderId: string | undefined;
  onMissing?: () => void;
};

/**
 * Loads order for post-checkout routes, reusing router state when navigating from checkout.
 */
export function useOrderWithEventRoute({ orderId, onMissing }: Options) {
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState<OrderWithEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      onMissing?.();
      navigate('/');
      return;
    }

    let cancelled = false;

    const run = async () => {
      const fromNav = readBookingOrderFromNavigationState(location.state, orderId);
      if (fromNav) {
        if (!cancelled) {
          setOrder(fromNav);
          setLoading(false);
        }
        return;
      }

      try {
        const orderData = await getOrderWithEvent(orderId);
        if (cancelled) return;
        setOrder(orderData);
      } catch (error) {
        console.error('Failed to fetch order:', error);
        if (!cancelled) {
          setOrder(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [orderId, location.state, navigate, onMissing]);

  return { order, setOrder, loading };
}
