import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useOrdersDashboard, RangeKey } from '@/hooks/useOrdersDashboard';
import { OrderRow } from '@/components/OrderRow';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type OrderTab = 'pending' | 'completed' | 'all';

/**
 * OrdersPage - Mobile-first orders list matching screenshot layout
 * 
 * Tab definitions:
 * - Pending: payment_status = 'submitted'
 * - Completed: payment_status = 'paid' OR fulfillment_status = 'confirmed'
 * - All: no extra status filter (still within selected date range)
 */
export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get range from URL or default to 30d
  const rangeParam = searchParams.get('range') as RangeKey | null;
  const range: RangeKey = rangeParam && ['today', '7d', '30d', '90d'].includes(rangeParam) 
    ? rangeParam 
    : '30d';
  
  // Get tab from URL or default to 'all'
  const tabParam = searchParams.get('tab') as OrderTab | null;
  const [selectedTab, setSelectedTab] = useState<OrderTab>(
    tabParam && ['pending', 'completed', 'all'].includes(tabParam) 
      ? tabParam 
      : 'all'
  );

  const { data: dashboardData, isLoading } = useOrdersDashboard(range);

  // Update URL when tab changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', selectedTab);
    params.set('range', range);
    setSearchParams(params, { replace: true });
  }, [selectedTab, range, searchParams, setSearchParams]);

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
        return allOrders;
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
      <div className="flex gap-1 bg-gray-200 rounded-full p-1">
        {tabs.map((tab) => {
          const isSelected = selectedTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={cn(
                'flex-1 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                isSelected
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              {tab.label} {tab.count}
            </button>
          );
        })}
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 pb-2 border-b border-gray-200 text-sm font-medium" style={{ color: '#0F1F17' }}>
        <div className="col-span-5">product</div>
        <div className="col-span-3">details</div>
        <div className="col-span-2 text-center">qty</div>
        <div className="col-span-2 text-right">status</div>
      </div>

      {/* Order Rows */}
      <div className="space-y-0">
        {getFilteredOrders().length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
            No orders found
          </div>
        ) : (
          getFilteredOrders().map((order) => <OrderRow key={order.id} order={order} />)
        )}
      </div>
    </div>
  );
}
