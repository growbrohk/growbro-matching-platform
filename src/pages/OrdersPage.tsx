import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { useOrdersDashboard, RangeKey, formatMoney } from '@/hooks/useOrdersDashboard';
import { OrderListRowCompact } from '@/components/OrderListRowCompact';
import { HostOrderDetailView } from '@/components/orders/HostOrderDetailView';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

type OrderTab = 'pending' | 'completed' | 'all';

/**
 * OrdersPage - Mobile-first orders list matching screenshot layout
 *
 * Tab definitions:
 * - Pending: payment_status = 'submitted'
 * - Completed: payment_status = 'paid' OR fulfillment_status = 'confirmed'
 * - All: pending OR confirmed orders only (excludes cancelled/refunded/failed)
 */
export default function OrdersPage() {
  const { orderId } = useParams<{ orderId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isList = !orderId;

  // Get range from URL or default to 30d
  const rangeParam = searchParams.get('range') as RangeKey | null;
  const range: RangeKey =
    rangeParam && ['today', '7d', '30d', '90d'].includes(rangeParam) ? rangeParam : '30d';

  // Get tab from URL or default to 'all'
  const tabParam = searchParams.get('tab') as OrderTab | null;
  const [selectedTab, setSelectedTab] = useState<OrderTab>(
    tabParam && ['pending', 'completed', 'all'].includes(tabParam) ? tabParam : 'all'
  );

  const { data: dashboardData, isLoading } = useOrdersDashboard(range, { enabled: isList });

  // Update URL when tab changes (list only)
  useEffect(() => {
    if (!isList) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', selectedTab);
    params.set('range', range);
    setSearchParams(params, { replace: true });
  }, [selectedTab, range, searchParams, setSearchParams, isList]);

  const listSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';

  if (orderId) {
    return <HostOrderDetailView orderId={orderId} listSearch={listSearch} />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  const { pendingCount = 0, completedCount = 0, allCount = 0 } = dashboardData || {};

  // Get filtered orders based on selected tab
  const getFilteredOrders = () => {
    const { allOrders = [] } = dashboardData || {};

    switch (selectedTab) {
      case 'pending':
        return allOrders.filter((o) => o.payment_status === 'submitted');
      case 'completed':
        return allOrders.filter(
          (o) => o.payment_status === 'paid' || o.fulfillment_status === 'confirmed'
        );
      case 'all':
      default:
        // All tab: only show orders where payment_status IN ('submitted','paid')
        return allOrders.filter(
          (o) => o.payment_status === 'submitted' || o.payment_status === 'paid'
        );
    }
  };

  const tabs: { key: OrderTab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'completed', label: 'Completed', count: completedCount },
    { key: 'all', label: 'All', count: allCount },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Title */}
      <h1 className="text-3xl font-bold uppercase tracking-tight" style={{ color: '#0F1F17' }}>
        ORDERS
      </h1>

      {/* Tab Row (Pill Filter) */}
      <div className="flex gap-1 bg-gray-200 rounded-full p-1 flex-nowrap">
        {tabs.map((tab) => {
          const isSelected = selectedTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={cn(
                'flex-1 min-w-0 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                isSelected
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="truncate">{tab.label}</span>
                <span className="shrink-0">{tab.count}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Order Rows */}
      <div className="space-y-0">
        {getFilteredOrders().length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
            No orders found
          </div>
        ) : (
          getFilteredOrders().map((order) => {
            const timestamp = order.created_at
              ? format(new Date(order.created_at), 'MMM d, yyyy h:mm a')
              : '';
            // Show confirm only for pending orders: payment_status='submitted' OR fulfillment_status='pending_confirmation'
            const hostShowConfirm =
              order.payment_status === 'submitted' ||
              order.fulfillment_status === 'pending_confirmation';
            const showConfirm =
              !!order.partnerRowAccess?.isPartnerRow
                ? hostShowConfirm && order.partnerRowAccess.canConfirmOrder
                : hostShowConfirm;
            const showDetailsButton =
              !order.partnerRowAccess?.isPartnerRow || order.partnerRowAccess.canViewOrderDetails;

            return (
              <OrderListRowCompact
                key={order.id}
                name={order.displayName || `Order ${order.order_no || order.id.slice(0, 6)}`}
                createdAtLabel={timestamp}
                imageUrl={order.previewImageUrl}
                priceLabel={formatMoney(order.total_amount)}
                onDetails={() => navigate(`/app/orders/${order.id}${listSearch}`)}
                onConfirm={() => {
                  queryClient.invalidateQueries({ queryKey: ['orders-dashboard'] });
                }}
                showConfirm={showConfirm}
                showDetailsButton={showDetailsButton}
                orderId={order.id}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
