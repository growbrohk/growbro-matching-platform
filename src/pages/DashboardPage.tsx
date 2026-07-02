import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatMoney, RangeKey } from '@/hooks/useOrdersDashboard';
import { useDashboardSummary } from '@/hooks/useDashboardSummary';
import { useDashboardPipelineStats } from '@/hooks/useDashboardPipelineStats';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderListRowCompact } from '@/components/OrderListRowCompact';
import { ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { CreateTrackingLinkModal } from '@/components/tracking/CreateTrackingLinkModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProductOrderDispatchPanel } from '@/components/orders/ProductOrderDispatchPanel';
import { invalidateOrderQueries, invalidatePipelineQueries } from '@/lib/queryInvalidation';

function StatCardSkeleton() {
  return (
    <Card className="rounded-xl min-w-0">
      <CardContent className="p-6">
        <Skeleton className="h-9 w-24 mb-2" />
        <Skeleton className="h-4 w-20" />
      </CardContent>
    </Card>
  );
}

function PipelineCardSkeleton() {
  return (
    <div className="min-w-0 bg-gray-100 rounded-xl p-4">
      <Skeleton className="h-8 w-10 mb-2" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

function OrderListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-200">
          <Skeleton className="w-12 h-12 rounded flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/**
 * Format money as HKD currency
 */
function formatHKD(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded % 1 === 0) {
    return `$${rounded.toLocaleString()}`;
  }
  return `$${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DashboardPendingShippingRow({
  name,
  createdAtLabel,
  imageUrl,
  priceLabel,
  onDetails,
  onOpenDispatch,
}: {
  name: string;
  createdAtLabel: string;
  imageUrl: string | null;
  priceLabel: string;
  onDetails: () => void;
  onOpenDispatch: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  const showImage = imageUrl && !imageError;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-200">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {showImage ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-12 h-12 rounded bg-gray-200 flex-shrink-0 object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-12 h-12 rounded bg-gray-200 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate" style={{ color: '#0F1F17' }}>
            {name}
          </div>
          <div className="text-xs truncate" style={{ color: 'rgba(15,31,23,0.6)' }}>
            {createdAtLabel}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 whitespace-nowrap font-medium text-sm" style={{ color: '#0F1F17' }}>
        {priceLabel}
      </div>
      <div className="flex items-center justify-end gap-4 flex-shrink-0 pl-4 whitespace-nowrap">
        <button
          type="button"
          onClick={onDetails}
          className="text-sm hover:underline lowercase"
          style={{ color: '#0F1F17' }}
        >
          details
        </button>
        <button
          type="button"
          onClick={onOpenDispatch}
          className="text-sm hover:underline lowercase"
          style={{ color: '#0F1F17' }}
        >
          Dispatched
        </button>
      </div>
    </div>
  );
}

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
  const { data: summaryData, isLoading: summaryLoading } = useDashboardSummary(selectedRange);
  const { data: pipelineStats, isLoading: pipelineLoading } = useDashboardPipelineStats(
    currentOrg?.id || '',
    selectedRange
  );
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<{
    orderId: string;
    addonItemId?: string | null;
  } | null>(null);

  // Update URL when range changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('range', selectedRange);
    setSearchParams(params, { replace: true });
  }, [selectedRange, searchParams, setSearchParams]);

  const pendingShippingOrdersSnapshot = useMemo(
    () => summaryData?.pendingShippingOrders ?? [],
    [summaryData?.pendingShippingOrders],
  );
  useEffect(() => {
    if (!dispatchTarget) return;
    const stillPending = pendingShippingOrdersSnapshot.some(
      (o) =>
        o.id === dispatchTarget.orderId &&
        (dispatchTarget.addonItemId
          ? o.addonItemId === dispatchTarget.addonItemId
          : !o.addonItemId)
    );
    if (!stillPending) {
      setDispatchTarget(null);
    }
  }, [dispatchTarget, pendingShippingOrdersSnapshot]);

  const {
    revenueTotal = 0,
    ordersCountSubmittedPaid = 0,
    pendingCountSubmitted = 0,
    pendingOrders = [],
    pendingShippingOrders = [],
    pendingShippingCount = 0,
  } = summaryData || {};

  const channelsCount = pipelineStats?.channelsCount ?? 0;
  const collabCount = pipelineStats?.collabCount ?? 0;
  const pipelineRevenueTotal = pipelineStats?.pipelineRevenueTotal ?? 0;

  const rangeOptions: { key: RangeKey; label: string }[] = [
    { key: 'today', label: 'today' },
    { key: '7d', label: 'last 7 days' },
    { key: '30d', label: 'last 30 days' },
    { key: '90d', label: 'last 90 days' },
  ];

  const handleViewAllPending = () => {
    navigate(`/app/orders?range=${selectedRange}&tab=pending`);
  };

  const dispatchModalOrder = dispatchTarget
    ? pendingShippingOrders.find(
        (o) =>
          o.id === dispatchTarget.orderId &&
          (dispatchTarget.addonItemId
            ? o.addonItemId === dispatchTarget.addonItemId
            : !o.addonItemId)
      )
    : undefined;

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
        {summaryLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card className="rounded-xl @container min-w-0">
              <CardContent className="min-w-0 p-6">
                <div
                  className="min-w-0 mb-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
                  title={formatMoney(revenueTotal)}
                >
                  <div
                    className="whitespace-nowrap font-bold tabular-nums leading-tight text-[clamp(1.125rem,11cqw,2.25rem)]"
                    style={{ color: '#0F1F17' }}
                  >
                    {formatMoney(revenueTotal)}
                  </div>
                </div>
                <div className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                  total revenue
                </div>
              </CardContent>
            </Card>

            <Link
              to={`/app/orders?range=${selectedRange}&tab=all`}
              className="block min-w-0 cursor-pointer rounded-xl no-underline text-inherit outline-none transition-opacity hover:opacity-90 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#0E7A3A] focus-visible:ring-offset-2"
              aria-label={`View orders, ${ordersCountSubmittedPaid} in selected period`}
            >
              <Card className="h-full rounded-xl @container min-w-0">
                <CardContent className="min-w-0 p-6">
                  <div
                    className="min-w-0 mb-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
                    title={String(ordersCountSubmittedPaid)}
                  >
                    <div
                      className="whitespace-nowrap font-bold tabular-nums leading-tight text-[clamp(1.125rem,11cqw,2.25rem)]"
                      style={{ color: '#0F1F17' }}
                    >
                      {ordersCountSubmittedPaid}
                    </div>
                  </div>
                  <div className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                    orders
                  </div>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
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
          {pipelineLoading ? (
            <>
              <PipelineCardSkeleton />
              <PipelineCardSkeleton />
              <PipelineCardSkeleton />
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  navigate(`/app/dashboard/pipelines?mode=host&range=${selectedRange}`);
                }}
                className="min-w-0 bg-gray-100 rounded-xl p-4 text-left hover:bg-gray-200 transition-colors relative"
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

              <button
                onClick={() => {
                  navigate(`/app/dashboard/pipelines?mode=collab&range=${selectedRange}`);
                }}
                className="min-w-0 bg-gray-100 rounded-xl p-4 text-left hover:bg-gray-200 transition-colors relative"
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

              <button
                onClick={() => {
                  navigate(`/app/dashboard/pipeline-revenue?range=${selectedRange}`);
                }}
                className="min-w-0 bg-gray-100 rounded-xl p-4 text-left hover:bg-gray-200 transition-colors relative"
              >
                <div
                  className="text-2xl font-bold mb-1 tabular-nums truncate pr-7"
                  style={{ color: '#0F1F17' }}
                  title={formatHKD(pipelineRevenueTotal)}
                >
                  {formatHKD(pipelineRevenueTotal)}
                </div>
                <div className="text-xs font-medium" style={{ color: '#0F1F17' }}>
                  revenue
                </div>
                <ChevronRight
                  className="h-4 w-4 absolute right-3 bottom-3"
                  style={{ color: '#0F1F17' }}
                />
              </button>
            </>
          )}
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
        {summaryLoading ? (
          <OrderListSkeleton />
        ) : pendingOrders.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
            No pending orders
          </div>
        ) : (
          pendingOrders.map((order) => {
            const timestamp = order.created_at
              ? format(new Date(order.created_at), 'MMM d, yyyy h:mm a')
              : '';
            const showConfirm = order.payment_status === 'submitted' || order.fulfillment_status === 'pending_confirmation';
            
            const statusBadge =
              order.order_type === 'product' && order.shipped_at ? 'Sent' : null;

            return (
              <OrderListRowCompact
                key={order.id}
                name={order.displayName || `Order ${order.order_no || order.id.slice(0, 6)}`}
                createdAtLabel={timestamp}
                imageUrl={order.previewImageUrl}
                priceLabel={formatMoney(order.total_amount)}
                onDetails={() =>
                  navigate(`/app/orders/${order.id}`, { state: { ordersBackTo: '/app/dashboard' } })
                }
                onConfirm={() => {
                  void invalidateOrderQueries(queryClient, order.id, order.event_id ?? null);
                }}
                showConfirm={showConfirm}
                orderId={order.id}
                statusBadge={statusBadge}
              />
            );
          })
        )}
      </div>

      {/* Pending shipping — paid product orders not yet dispatched */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold" style={{ color: '#0F1F17' }}>
              pending shipping
            </h2>
            {pendingShippingCount > 0 && (
              <span
                className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: '#EF4444' }}
              >
                {pendingShippingCount}
              </span>
            )}
          </div>
        </div>
        {summaryLoading ? (
          <OrderListSkeleton />
        ) : pendingShippingOrders.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
            No orders waiting to ship
          </div>
        ) : (
          pendingShippingOrders.map((order) => {
            const timestamp = order.created_at
              ? format(new Date(order.created_at), 'MMM d, yyyy h:mm a')
              : '';
            return (
              <DashboardPendingShippingRow
                key={order.addonItemId ? `addon-${order.addonItemId}` : order.id}
                name={order.displayName || `Order ${order.order_no || order.id.slice(0, 6)}`}
                createdAtLabel={timestamp}
                imageUrl={order.previewImageUrl}
                priceLabel={formatMoney(order.total_amount)}
                onDetails={() =>
                  navigate(`/app/orders/${order.id}`, { state: { ordersBackTo: '/app/dashboard' } })
                }
                onOpenDispatch={() =>
                  setDispatchTarget({
                    orderId: order.id,
                    addonItemId: order.addonItemId ?? null,
                  })
                }
              />
            );
          })
        )}
      </div>
      </div>

      {/* Tracking Link Modal */}
      <CreateTrackingLinkModal
        open={isTrackingModalOpen}
        onOpenChange={setIsTrackingModalOpen}
        onSuccess={() => {
          void invalidatePipelineQueries(queryClient);
        }}
      />

      <Dialog
        open={!!dispatchTarget && !!dispatchModalOrder}
        onOpenChange={(open) => {
          if (!open) setDispatchTarget(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: '#0F1F17' }}>
              {dispatchModalOrder?.displayName || 'Dispatch'}
            </DialogTitle>
          </DialogHeader>
          {dispatchModalOrder ? (
            <ProductOrderDispatchPanel
              orderId={dispatchModalOrder.id}
              addonItemId={dispatchModalOrder.addonItemId ?? undefined}
              shippedAt={dispatchModalOrder.shipped_at ?? null}
              carrierTrackingNumber={dispatchModalOrder.carrier_tracking_number ?? null}
              paymentStatus={dispatchModalOrder.payment_status}
              fulfillmentStatus={dispatchModalOrder.fulfillment_status}
              canEdit
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
