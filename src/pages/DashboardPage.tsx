import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrdersDashboard, formatMoney, RangeKey } from '@/hooks/useOrdersDashboard';
import { Card, CardContent } from '@/components/ui/card';
import { OrderRow } from '@/components/OrderRow';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

/**
 * DashboardPage - Mobile-first dashboard matching screenshot layout
 * 
 * Definitions:
 * - Pending orders: payment_status = 'submitted' (user uploaded receipt / clicked I've paid)
 * - Revenue: SUM(total_amount) for orders where payment_status = 'paid' OR fulfillment_status = 'confirmed'
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentOrg } = useAuth();
  
  // Get range from URL or default to '30d'
  const rangeParam = searchParams.get('range') as RangeKey | null;
  const initialRange: RangeKey = rangeParam && ['today', '7d', '30d', '90d'].includes(rangeParam) 
    ? rangeParam 
    : '30d';
  
  const [selectedRange, setSelectedRange] = useState<RangeKey>(initialRange);
  const { data: dashboardData, isLoading } = useOrdersDashboard(selectedRange);

  // Update URL when range changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('range', selectedRange);
    setSearchParams(params, { replace: true });
  }, [selectedRange, searchParams, setSearchParams]);

  // Fetch enquiries count (unresolved)
  // TODO: Replace with actual enquiries table query if table exists
  const { data: enquiriesCount = 0 } = useQuery({
    queryKey: ['enquiries-count', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return 0;
      // TODO: Query enquiries table for unresolved count
      // For now, return placeholder
      return 0;
    },
    enabled: !!currentOrg,
  });

  // Fetch collab count
  // TODO: Replace with actual collab table query if table exists
  const collabCount = 0; // Placeholder

  const rangeOptions: { key: RangeKey; label: string }[] = [
    { key: 'today', label: 'today' },
    { key: '7d', label: 'last 7 days' },
    { key: '30d', label: 'last 30 days' },
    { key: '90d', label: 'last 90 days' },
  ];

  const handleOrdersClick = () => {
    navigate(`/app/orders?range=${selectedRange}&tab=all`);
  };

  const handleViewAllPending = () => {
    navigate(`/app/orders?range=${selectedRange}&tab=pending`);
  };

  const handleCollabClick = () => {
    // TODO: Route to collab page when ready
    navigate('/app/collab');
  };

  const handleEnquiriesClick = () => {
    // TODO: Route to enquiries page when ready
    navigate('/app/enquiries');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  const { revenueTotal = 0, ordersCount = 0, pendingOrders = [] } = dashboardData || {};

  return (
    <>
      <style>{`
        .pill-filter-container::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="w-full space-y-6">
        {/* Title */}
        <h1 className="text-3xl font-bold uppercase tracking-tight" style={{ color: '#0F1F17' }}>
          DASHBOARD
        </h1>

        {/* Pill Filter Row - Single row, no wrap, scrollable if needed */}
        <div 
          className="pill-filter-container flex gap-2.5 flex-nowrap overflow-x-auto"
          style={{
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none', // IE/Edge
          }}
        >
        {rangeOptions.map((option) => {
          const isSelected = selectedRange === option.key;
          return (
            <button
              key={option.key}
              onClick={() => setSelectedRange(option.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0',
                'min-h-[36px]',
                isSelected
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Revenue Card */}
      <Card className="rounded-xl">
        <CardContent className="p-6 flex items-center justify-between">
          <div className="text-4xl font-bold" style={{ color: '#0F1F17' }}>
            {formatMoney(revenueTotal)}
          </div>
          <div className="text-sm font-medium" style={{ color: '#0F1F17' }}>
            total revenue
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: '#0F1F17' }}>
          quick actions
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {/* Orders Card */}
          <button
            onClick={handleOrdersClick}
            className="bg-gray-100 rounded-xl p-4 text-left hover:bg-gray-200 transition-colors relative"
          >
            <div className="text-2xl font-bold mb-1" style={{ color: '#0F1F17' }}>
              {ordersCount}
            </div>
            <div className="text-xs font-medium mb-1" style={{ color: '#0F1F17' }}>
              orders
            </div>
            <div className="text-xs pr-7" style={{ color: 'rgba(15,31,23,0.6)' }}>
              products & tickets
            </div>
            <ChevronRight 
              className="h-4 w-4 absolute right-3 bottom-3" 
              style={{ color: '#0F1F17' }} 
            />
          </button>

          {/* Collab Card */}
          <button
            onClick={handleCollabClick}
            className="bg-gray-100 rounded-xl p-4 text-left hover:bg-gray-200 transition-colors relative"
          >
            <div className="text-2xl font-bold mb-1" style={{ color: '#0F1F17' }}>
              {collabCount}
            </div>
            <div className="text-xs font-medium mb-1 pr-7" style={{ color: '#0F1F17' }}>
              collab
            </div>
            <ChevronRight 
              className="h-4 w-4 absolute right-3 bottom-3" 
              style={{ color: '#0F1F17' }} 
            />
          </button>

          {/* Enquiries Card */}
          <button
            onClick={handleEnquiriesClick}
            className="bg-gray-100 rounded-xl p-4 text-left hover:bg-gray-200 transition-colors relative"
          >
            <div className="text-2xl font-bold mb-1" style={{ color: '#0F1F17' }}>
              {enquiriesCount}
            </div>
            <div className="text-xs font-medium mb-1" style={{ color: '#0F1F17' }}>
              enquiries
            </div>
            <div className="text-xs pr-7" style={{ color: 'rgba(15,31,23,0.6)' }}>
              unresolved
            </div>
            <ChevronRight 
              className="h-4 w-4 absolute right-3 bottom-3" 
              style={{ color: '#0F1F17' }} 
            />
          </button>
        </div>
      </div>

      {/* Pending Orders Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: '#0F1F17' }}>
            pending orders
          </h2>
          <button
            onClick={handleViewAllPending}
            className="text-sm hover:underline"
            style={{ color: 'rgba(15,31,23,0.6)' }}
          >
            view all
          </button>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 pb-2 border-b border-gray-200 text-sm font-medium" style={{ color: '#0F1F17' }}>
          <div className="col-span-5">product</div>
          <div className="col-span-3">details</div>
          <div className="col-span-2 text-center">qty</div>
          <div className="col-span-2 text-right">status</div>
        </div>

        {/* Order Rows */}
        {pendingOrders.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
            No pending orders
          </div>
        ) : (
          pendingOrders.map((order) => <OrderRow key={order.id} order={order} />)
        )}
      </div>
      </div>
    </>
  );
}
