import { useState, useEffect, useMemo, useCallback } from 'react';
import { Mail, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import EnquiryCard from '@/components/enquiries/EnquiryCard';
import MessageEnquiryRow from '@/components/enquiries/MessageEnquiryRow';
import HostEnquiryOrderCard from '@/components/host/HostEnquiryOrderCard';
import AffiliateRequestCard from '@/components/enquiries/AffiliateRequestCard';
import { useUnreadEnquiriesCount } from '@/hooks/use-unread-enquiries-count';
import { usePendingConnectionsCount } from '@/hooks/use-pending-connections-count';
import ConnectRequestsPreviewCard from '@/components/connections/ConnectRequestsPreviewCard';
import { useEnquiriesFeed, enquiriesFeedQueryKey } from '@/hooks/use-enquiries-feed';
import {
  applyRequesterOrgMap,
  fetchRequesterOrgMap,
  filterEnquiriesForTab,
  type AffiliateRequestRow,
  type EnquiriesFilterType,
  type EnquiryItem,
} from '@/lib/api/enquiries-feed';

export type { EnquiryItem };

export default function Enquiries() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentOrg } = useAuth();
  const { refetch: refetchUnreadCount } = useUnreadEnquiriesCount();
  const [filter, setFilter] = useState<EnquiriesFilterType>('sales_orders');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [enrichedEnquiries, setEnrichedEnquiries] = useState<EnquiryItem[] | null>(null);

  const showConnectPreview = filter === 'all' || filter === 'requests';
  const { data: pendingConnectionsData } = usePendingConnectionsCount({
    enabled: showConnectPreview,
  });

  const {
    data: feedPages,
    isLoading: loading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useEnquiriesFeed(filter, {
    onMarkSeenComplete: () => {
      void refetchUnreadCount();
    },
  });

  const merged = useMemo(() => {
    if (!feedPages?.pages.length) {
      return {
        enquiries: [] as EnquiryItem[],
        hostOrders: [],
        messageEnquiries: [],
        affiliateRequests: [] as AffiliateRequestRow[],
        bookings: [],
        requesterUserIds: [] as string[],
      };
    }

    const hostOrdersById = new Map();
    const messageById = new Map();
    const affiliateById = new Map();
    const enquiries: EnquiryItem[] = [];
    const bookings: (typeof feedPages.pages)[0]['bookings'] = [];
    const requesterUserIds = new Set<string>();

    for (const page of feedPages.pages) {
      for (const order of page.hostOrders) {
        hostOrdersById.set(order.order_id, order);
      }
      for (const msg of page.messageEnquiries) {
        messageById.set(msg.conversation_id, msg);
      }
      for (const aff of page.affiliateRequests) {
        affiliateById.set(aff.id, aff);
      }
      enquiries.push(...page.enquiries);
      bookings.push(...page.bookings);
      for (const id of page.requesterUserIds) {
        requesterUserIds.add(id);
      }
    }

    const sorted = [...enquiries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return {
      enquiries: sorted,
      hostOrders: [...hostOrdersById.values()],
      messageEnquiries: [...messageById.values()],
      affiliateRequests: [...affiliateById.values()],
      bookings,
      requesterUserIds: [...requesterUserIds],
    };
  }, [feedPages]);

  useEffect(() => {
    setEnrichedEnquiries(null);
    const userIds = merged.requesterUserIds;
    if (userIds.length === 0) {
      setEnrichedEnquiries(merged.enquiries);
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      void fetchRequesterOrgMap(userIds).then((map) => {
        if (cancelled) return;
        setEnrichedEnquiries(
          applyRequesterOrgMap(merged.enquiries, merged.bookings, map)
        );
      });
    });

    return () => {
      cancelled = true;
    };
  }, [merged.enquiries, merged.bookings, merged.requesterUserIds.join(',')]);

  const displayEnquiries = enrichedEnquiries ?? merged.enquiries;

  const filteredEnquiries = useMemo(
    () => filterEnquiriesForTab(displayEnquiries, filter),
    [displayEnquiries, filter]
  );

  const hostOrdersById = useMemo(
    () => new Map(merged.hostOrders.map((order) => [order.order_id, order])),
    [merged.hostOrders]
  );

  const messageEnquiriesById = useMemo(
    () => new Map(merged.messageEnquiries.map((row) => [row.conversation_id, row])),
    [merged.messageEnquiries]
  );

  const affiliateRequestsById = useMemo(
    () => new Map(merged.affiliateRequests.map((req) => [req.id, req])),
    [merged.affiliateRequests]
  );

  const handleEnquiriesRefresh = useCallback(() => {
    void refetch();
    if (currentOrg?.id) {
      void queryClient.invalidateQueries({
        queryKey: enquiriesFeedQueryKey(currentOrg.id, filter),
      });
    }
  }, [refetch, queryClient, currentOrg?.id, filter]);

  const getEmptyStateMessage = () => {
    switch (filter) {
      case 'requests':
        return 'No enquiries yet';
      case 'messages':
        return 'No messages yet';
      case 'sales_orders':
        return 'No sales enquiries yet';
      case 'archived':
        return 'No archived enquiries';
      default:
        return 'No enquiries yet';
    }
  };

  const renderEnquiryRow = (enquiry: EnquiryItem) => {
    if (enquiry.type === 'message') {
      const messageData = messageEnquiriesById.get(enquiry.id);
      if (messageData) {
        return <MessageEnquiryRow key={enquiry.id} data={messageData} />;
      }
      return <EnquiryCard key={enquiry.id} enquiry={enquiry} />;
    }

    if (enquiry.type === 'sales_order') {
      const orderData = hostOrdersById.get(enquiry.id);
      if (orderData) {
        return (
          <HostEnquiryOrderCard
            key={enquiry.id}
            order={orderData}
            onConfirmed={handleEnquiriesRefresh}
            onDetails={() =>
              navigate(`/app/orders/${orderData.order_id}`, {
                state: { ordersBackTo: '/app/enquiries' },
              })
            }
          />
        );
      }
      return <EnquiryCard key={enquiry.id} enquiry={enquiry} />;
    }

    if (enquiry.type === 'request') {
      const affiliateReq = affiliateRequestsById.get(enquiry.id);
      if (affiliateReq?.status === 'pending') {
        return (
          <AffiliateRequestCard
            key={enquiry.id}
            request={affiliateReq}
            onStatusChange={handleEnquiriesRefresh}
          />
        );
      }
    }

    return <EnquiryCard key={enquiry.id} enquiry={enquiry} />;
  };

  const filterLabel =
    filter === 'all'
      ? 'All'
      : filter === 'requests'
        ? 'Requests'
        : filter === 'messages'
          ? 'Messages'
          : filter === 'sales_orders'
            ? 'Sales Orders'
            : 'Archived';

  return (
    <div className="max-w-7xl space-y-6 md:space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.1)' }}>
              <Mail className="h-5 w-5" style={{ color: '#0E7A3A' }} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
              Enquiries
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Manage requests, messages, and sales enquiries in one place
          </p>
        </div>

        <div className="flex items-center gap-2">
          {filter !== 'all' && (
            <span className="text-xs font-medium hidden sm:inline" style={{ color: 'rgba(15,31,23,0.6)' }}>
              {filterLabel}
            </span>
          )}
          <Drawer open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                style={{ borderColor: 'rgba(14,122,58,0.2)' }}
              >
                <SlidersHorizontal className="h-5 w-5" style={{ color: '#0E7A3A' }} />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Filter Enquiries</DrawerTitle>
              </DrawerHeader>
              <div className="p-4">
                <RadioGroup
                  value={filter}
                  onValueChange={(value) => {
                    setFilter(value as EnquiriesFilterType);
                    setFilterDrawerOpen(false);
                  }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="all" id="all" />
                      <Label htmlFor="all" className="cursor-pointer flex-1">All</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="requests" id="requests" />
                      <Label htmlFor="requests" className="cursor-pointer flex-1">Requests</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="messages" id="messages" />
                      <Label htmlFor="messages" className="cursor-pointer flex-1">Messages</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sales_orders" id="sales_orders" />
                      <Label htmlFor="sales_orders" className="cursor-pointer flex-1">Sales Orders</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="archived" id="archived" />
                      <Label htmlFor="archived" className="cursor-pointer flex-1">Archived</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      {showConnectPreview && pendingConnectionsData && (
        <ConnectRequestsPreviewCard
          pendingCount={pendingConnectionsData.count}
          connections={pendingConnectionsData.connections}
          onClick={() => navigate('/app/enquiries/connect-requests')}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>Loading enquiries...</div>
        </div>
      ) : filteredEnquiries.length === 0 ? (
        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <div className="p-8 md:p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-3xl flex items-center justify-center" style={{ backgroundColor: 'rgba(14,122,58,0.08)' }}>
                <Mail className="h-8 w-8" style={{ color: '#0E7A3A' }} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
                  {getEmptyStateMessage()}
                </h3>
                <p className="text-sm max-w-md mx-auto" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  {filter === 'all' && 'When you receive requests, messages, or sales orders, they will appear here.'}
                  {filter === 'requests' && 'Booking requests from brands will appear here.'}
                  {filter === 'messages' && 'Messages from collaborators will appear here.'}
                  {filter === 'sales_orders' && 'Sales orders from your catalog will appear here.'}
                  {filter === 'archived' && 'Archived enquiries will appear here.'}
                </p>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEnquiries.map((enquiry) => renderEnquiryRow(enquiry))}

          {hasNextPage && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                Showing {filteredEnquiries.length} enquiries
              </p>
              <Button
                variant="outline"
                className="rounded-full"
                style={{ borderColor: 'rgba(14,122,58,0.2)' }}
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
