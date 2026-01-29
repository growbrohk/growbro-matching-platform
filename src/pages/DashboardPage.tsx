import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrdersDashboard, formatMoney, RangeKey } from '@/hooks/useOrdersDashboard';
import { Card, CardContent } from '@/components/ui/card';
import { OrderListRowCompact } from '@/components/OrderListRowCompact';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { CreateTrackingLinkModal } from '@/components/tracking/CreateTrackingLinkModal';
import { supabase } from '@/integrations/supabase/client';

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
  const queryClient = useQueryClient();
  
  // Get range from URL or default to '30d'
  const rangeParam = searchParams.get('range') as RangeKey | null;
  const initialRange: RangeKey = rangeParam && ['today', '7d', '30d', '90d'].includes(rangeParam) 
    ? rangeParam 
    : '30d';
  
  const [selectedRange, setSelectedRange] = useState<RangeKey>(initialRange);
  const { data: dashboardData, isLoading } = useOrdersDashboard(selectedRange);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);

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

  // Calculate date range for tracking clicks
  const getDateRange = (rangeKey: RangeKey): { start: Date; end: Date } => {
    const end = new Date();
    const start = new Date();
    switch (rangeKey) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
    }
    return { start, end };
  };

  // Fetch channels count (tracking_links where host_org_id=currentOrg.id, type IN ('tracking', 'affiliate'), and status='active')
  // Only counts links where currentOrg is the host, NOT where currentOrg is the affiliate partner
  const { data: channelsCount = 0 } = useQuery({
    queryKey: ['tracking-channels-count', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return 0;
      const { count, error } = await (supabase.from('tracking_links' as any) as any)
        .select('*', { count: 'exact', head: true })
        .eq('host_org_id', currentOrg.id)
        .in('type', ['tracking', 'affiliate'])
        .eq('status', 'active');
      if (error) {
        console.error('Error fetching channels count:', error);
        return 0;
      }
      return count || 0;
    },
    enabled: !!currentOrg,
  });

  // Fetch collab count (tracking_links where affiliate_org_id=currentOrg.id and status='active')
  const { data: collabCount = 0 } = useQuery({
    queryKey: ['tracking-collab-count', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return 0;
      const { count, error } = await (supabase.from('tracking_links' as any) as any)
        .select('*', { count: 'exact', head: true })
        .eq('affiliate_org_id', currentOrg.id)
        .eq('status', 'active');
      if (error) {
        console.error('Error fetching collab count:', error);
        return 0;
      }
      return count || 0;
    },
    enabled: !!currentOrg,
  });

  // Fetch clicks count (tracking_clicks joined to tracking_links, filtered by time range and org membership)
  const { start: clicksStart, end: clicksEnd } = getDateRange(selectedRange);
  const { data: clicksCount = 0 } = useQuery({
    queryKey: ['tracking-clicks-count', currentOrg?.id, selectedRange],
    queryFn: async () => {
      if (!currentOrg) return 0;
      const startISO = clicksStart.toISOString();
      const endISO = clicksEnd.toISOString();
      
      // Query clicks where tracking_link belongs to current org (as host or affiliate)
      const { data, error } = await (supabase.from('tracking_clicks' as any) as any)
        .select(`
          id,
          tracking_links!inner(
            host_org_id,
            affiliate_org_id
          )
        `)
        .gte('clicked_at', startISO)
        .lte('clicked_at', endISO);

      if (error) {
        console.error('Error fetching clicks count:', error);
        return 0;
      }

      // Filter client-side to only count clicks where user's org is host or affiliate
      const filteredClicks = (data || []).filter((click: any) => {
        const link = click.tracking_links;
        return link.host_org_id === currentOrg.id || link.affiliate_org_id === currentOrg.id;
      });

      return filteredClicks.length;
    },
    enabled: !!currentOrg,
  });

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

  const { 
    revenueTotal = 0, 
    ordersCountSubmittedPaid = 0, 
    pendingCountSubmitted = 0,
    pendingOrders = [] 
  } = dashboardData || {};

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

      {/* Top Summary: Two Cards in One Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Revenue Card */}
        <Card className="rounded-xl">
          <CardContent className="p-6">
            <div className="text-4xl font-bold mb-1" style={{ color: '#0F1F17' }}>
              {formatMoney(revenueTotal)}
            </div>
            <div className="text-sm font-medium" style={{ color: '#0F1F17' }}>
              total revenue
            </div>
          </CardContent>
        </Card>

        {/* Orders Card */}
        <Card className="rounded-xl">
          <CardContent className="p-6">
            <div className="text-4xl font-bold mb-1" style={{ color: '#0F1F17' }}>
              {ordersCountSubmittedPaid}
            </div>
            <div className="text-sm font-medium" style={{ color: '#0F1F17' }}>
              orders
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: '#0F1F17' }}>
            pipeline
          </h2>
          <button
            onClick={() => setIsTrackingModalOpen(true)}
            className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors flex items-center justify-center flex-shrink-0"
            style={{ color: '#0F1F17' }}
            aria-label="Add tracking"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/* Channels Card */}
          <button
            onClick={() => {
              navigate('/app/dashboard/channels');
            }}
            className="bg-gray-100 rounded-xl p-4 text-left hover:bg-gray-200 transition-colors relative"
          >
            <div className="text-2xl font-bold mb-1" style={{ color: '#0F1F17' }}>
              {channelsCount}
            </div>
            <div className="text-xs font-medium" style={{ color: '#0F1F17' }}>
              channels
            </div>
            <ChevronRight 
              className="h-4 w-4 absolute right-3 bottom-3" 
              style={{ color: '#0F1F17' }} 
            />
          </button>

          {/* Collab Card */}
          <button
            onClick={() => {
              navigate('/app/dashboard/channels?collab=with&status=active');
            }}
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

          {/* Clicks Card */}
          <button
            onClick={() => {
              // Placeholder - can navigate or do nothing
            }}
            className="bg-gray-100 rounded-xl p-4 text-left hover:bg-gray-200 transition-colors relative"
          >
            <div className="text-2xl font-bold mb-1" style={{ color: '#0F1F17' }}>
              {clicksCount}
            </div>
            <div className="text-xs font-medium" style={{ color: '#0F1F17' }}>
              clicks
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
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold" style={{ color: '#0F1F17' }}>
              pending orders
            </h2>
            {pendingCountSubmitted > 0 && (
              <span 
                className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: '#EF4444' }}
              >
                {pendingCountSubmitted}
              </span>
            )}
          </div>
          <button
            onClick={handleViewAllPending}
            className="text-sm hover:underline"
            style={{ color: 'rgba(15,31,23,0.6)' }}
          >
            view all
          </button>
        </div>

        {/* Order Rows */}
        {pendingOrders.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
            No pending orders
          </div>
        ) : (
          pendingOrders.map((order) => {
            const timestamp = order.created_at
              ? format(new Date(order.created_at), 'MMM d, yyyy h:mm a')
              : '';
            const showConfirm = order.payment_status === 'submitted' || order.fulfillment_status === 'pending_confirmation';
            
            return (
              <OrderListRowCompact
                key={order.id}
                name={order.displayName || `Order ${order.order_no || order.id.slice(0, 6)}`}
                createdAtLabel={timestamp}
                imageUrl={order.previewImageUrl}
                priceLabel={formatMoney(order.total_amount)}
                onDetails={() => navigate(`/app/orders/${order.id}`)}
                onConfirm={() => {
                  // Invalidate queries to refresh data
                  queryClient.invalidateQueries({ queryKey: ['orders-dashboard'] });
                }}
                showConfirm={showConfirm}
                orderId={order.id}
              />
            );
          })
        )}
      </div>
      </div>

      {/* Tracking Link Modal */}
      <CreateTrackingLinkModal open={isTrackingModalOpen} onOpenChange={setIsTrackingModalOpen} />
    </>
  );
}
