import { useState, useEffect } from 'react';
import { Mail, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getBookingRequestsForSpace } from '@/lib/api/poster-spaces';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import EnquiryCard from '@/components/enquiries/EnquiryCard';
import MessageEnquiryRow, { type MessageEnquiryRowData } from '@/components/enquiries/MessageEnquiryRow';
import HostEnquiryOrderCard, { type HostOrderCardData } from '@/components/host/HostEnquiryOrderCard';
import AffiliateRequestCard from '@/components/enquiries/AffiliateRequestCard';
import { useUnreadEnquiriesCount } from '@/hooks/use-unread-enquiries-count';
import { usePendingConnectionsCount } from '@/hooks/use-pending-connections-count';
import ConnectRequestsPreviewCard from '@/components/connections/ConnectRequestsPreviewCard';

type FilterType = 'all' | 'requests' | 'messages' | 'sales_orders' | 'archived';

export interface EnquiryItem {
  id: string;
  type: 'request' | 'message' | 'sales_order' | 'system';
  status?: 'pending' | 'waiting_confirmation' | 'confirmed' | 'archived' | string;
  brand?: { name: string; slug?: string; logoUrl?: string; category?: string; location?: string };
  item?: { name: string; thumbnailUrl?: string; type?: 'event' | 'product' | 'space' };
  period?: { start?: string | Date; end?: string | Date };
  previewText?: string;
  date: string | Date;
  unread?: boolean;
  channel?: 'POS' | 'Website' | string;
  productType?: string;
  spaceType?: string;
}

export default function Enquiries() {
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const { refetch: refetchUnreadCount } = useUnreadEnquiriesCount();
  const { data: pendingConnectionsData } = usePendingConnectionsCount();
  const [filter, setFilter] = useState<FilterType>('all');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);
  const [messageEnquiries, setMessageEnquiries] = useState<MessageEnquiryRowData[]>([]);
  const [hostOrders, setHostOrders] = useState<HostOrderCardData[]>([]);
  const [affiliateRequests, setAffiliateRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    fetchEnquiries();
  }, [currentOrg, filter]);

  // Refetch on window focus to update message list
  useEffect(() => {
    const handleFocus = () => {
      if (currentOrg) {
        fetchEnquiries();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentOrg]);

  const fetchEnquiries = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const allEnquiries: EnquiryItem[] = [];

      // Fetch booking requests (Requests)
      const { data: spaces } = await supabase
        .from('poster_spaces')
        .select('id, title, photos, category')
        .eq('org_id', currentOrg.id);

      if (spaces && spaces.length > 0) {
        const allRequests: Array<{ request: any; space: any }> = [];
        
        for (const space of spaces) {
          const requests = await getBookingRequestsForSpace(space.id);
          for (const request of requests) {
            allRequests.push({ request, space });
          }
        }

        // Fetch requester orgs in batch
        const requesterUserIds = allRequests
          .map((r) => r.request.requester_user_id)
          .filter(Boolean) as string[];

        const requesterOrgMap = new Map<string, any>();
        if (requesterUserIds.length > 0) {
          const { data: orgMembers } = await supabase
            .from('org_members')
            .select('user_id, org_id, orgs(name, slug, org_profiles(logo_url, category, location))')
            .in('user_id', requesterUserIds);

          if (orgMembers) {
            for (const member of orgMembers) {
              const orgData = member.orgs as any;
              const profileData = Array.isArray(orgData?.org_profiles) 
                ? orgData.org_profiles[0] 
                : orgData?.org_profiles;
              
              if (!requesterOrgMap.has(member.user_id)) {
                requesterOrgMap.set(member.user_id, {
                  name: orgData?.name,
                  slug: orgData?.slug,
                  logoUrl: profileData?.logo_url,
                  category: profileData?.category,
                  location: profileData?.location,
                });
              }
            }
          }
        }

        // Mark unread booking requests as seen
        const unreadRequestIds = allRequests
          .filter(({ request }) => !request.host_seen_at)
          .map(({ request }) => request.id);

        if (unreadRequestIds.length > 0) {
          // Update host_seen_at for all unread requests in batch
          await supabase
            .from('poster_space_booking_requests')
            .update({ host_seen_at: new Date().toISOString() })
            .in('id', unreadRequestIds);
          
          // Refetch unread count to update badge
          refetchUnreadCount();
        }

        for (const { request, space } of allRequests) {
          const requesterOrg = request.requester_user_id 
            ? requesterOrgMap.get(request.requester_user_id) 
            : null;

          // Don't filter during fetch - filter after fetching all data

          allEnquiries.push({
            id: request.id,
            type: 'request',
            status: request.status === 'pending' ? 'pending' : request.status === 'approved' ? 'confirmed' : 'archived',
            brand: {
              name: request.requester_name || requesterOrg?.name || 'Unknown',
              slug: requesterOrg?.slug,
              logoUrl: requesterOrg?.logoUrl,
              category: requesterOrg?.category,
              location: requesterOrg?.location,
            },
            item: {
              name: space.title || 'Space',
              thumbnailUrl: Array.isArray(space.photos) && space.photos.length > 0 ? space.photos[0] : undefined,
              type: 'space',
            },
            period: {
              start: request.requested_start_date,
              end: request.computed_end_date,
            },
            previewText: request.message || undefined,
            date: request.created_at,
            unread: request.status === 'pending',
          });
        }
      }

      // Fetch orders (Sales Orders) using host_order_cards view
      const { data: hostOrderCards, error: ordersError } = await supabase
        .from('host_order_cards')
        .select('*')
        .eq('org_id', currentOrg.id)
        .order('updated_at', { ascending: false });

      if (ordersError) {
        console.error('Error fetching host orders:', ordersError);
      } else if (hostOrderCards) {
        // Store host orders separately for rendering with HostEnquiryOrderCard
        setHostOrders(hostOrderCards as HostOrderCardData[]);
        
        // Also add to allEnquiries for filtering/sorting compatibility
        for (const order of hostOrderCards) {
          const isProductOrder = !order.event_id;
          allEnquiries.push({
            id: order.order_id,
            type: 'sales_order',
            status: order.fulfillment_status === 'confirmed' ? 'confirmed' : order.fulfillment_status === 'pending_confirmation' ? 'waiting_confirmation' : 'archived',
            brand: {
              name: isProductOrder ? 'Product Order' : 'Event Order',
            },
            item: {
              name: order.event_title || (isProductOrder ? 'Product' : 'Event'),
              thumbnailUrl: order.event_cover_image_url || undefined,
              type: isProductOrder ? 'product' : 'event',
            },
            previewText: `Order ${order.order_no || order.order_id.slice(0, 8)}`,
            date: order.updated_at,
            unread: order.fulfillment_status === 'pending_confirmation',
            channel: 'Website',
            productType: isProductOrder ? 'product' : 'ticket',
          });
        }
      }

      // Fetch conversations (Messages) using RPC
      const { data: inboxData, error: inboxError } = await supabase
        .rpc('get_conversation_inbox', { p_org_id: currentOrg.id });

      if (!inboxError && inboxData) {
        // Store message enquiries separately for WhatsApp-style rendering
        setMessageEnquiries(inboxData as MessageEnquiryRowData[]);
        
        // Also add to allEnquiries for filtering/sorting compatibility
        // (but we'll render them separately with MessageEnquiryRow)
        for (const inboxRow of inboxData) {
          allEnquiries.push({
            id: inboxRow.conversation_id,
            type: 'message',
            status: 'pending',
            brand: {
              name: inboxRow.other_org_name,
              logoUrl: inboxRow.other_org_logo_url || undefined,
            },
            item: {
              name: 'Message',
              type: 'message',
            },
            previewText: inboxRow.last_message_body,
            date: inboxRow.last_message_at,
            unread: inboxRow.unread_count > 0,
          });
        }
      }

      // Fetch affiliate requests (where current org is affiliate)
      const { data: affiliateRequestsData, error: affiliateError } = await supabase
        .from('affiliate_requests')
        .select(`
          id,
          tracking_link_id,
          host_org_id,
          affiliate_org_id,
          status,
          created_at,
          tracking_links!inner(
            slug,
            label,
            destination_url,
            commission_rate,
            start_date,
            end_date
          ),
          orgs!affiliate_requests_host_org_id_fkey(
            name,
            slug
          )
        `)
        .eq('affiliate_org_id', currentOrg.id)
        .order('created_at', { ascending: false });

      if (affiliateError) {
        console.error('Error fetching affiliate requests:', affiliateError);
      } else if (affiliateRequestsData) {
        // Transform data to match expected structure
        const transformedRequests = affiliateRequestsData.map((req: any) => ({
          id: req.id,
          tracking_link_id: req.tracking_link_id,
          host_org_id: req.host_org_id,
          affiliate_org_id: req.affiliate_org_id,
          status: req.status,
          created_at: req.created_at,
          tracking_link: req.tracking_links,
          host_org: Array.isArray(req.orgs) ? req.orgs[0] : req.orgs,
        }));
        setAffiliateRequests(transformedRequests);

        // Also add to allEnquiries for filtering/sorting compatibility
        for (const req of transformedRequests) {
          if (req.status === 'pending') {
            allEnquiries.push({
              id: req.id,
              type: 'request',
              status: 'pending',
              brand: {
                name: req.host_org.name,
                slug: req.host_org.slug,
              },
              item: {
                name: req.tracking_link.label || req.tracking_link.destination_url,
                type: 'event', // Could be event/product/custom
              },
              period: {
                start: req.tracking_link.start_date,
                end: req.tracking_link.end_date,
              },
              previewText: `Commission: ${(req.tracking_link.commission_rate * 100).toFixed(1)}%`,
              date: req.created_at,
              unread: req.status === 'pending',
            });
          }
        }
      }

      // Sort by date (newest first)
      allEnquiries.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

      setEnquiries(allEnquiries);
    } catch (error) {
      console.error('Error fetching enquiries:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEnquiries = enquiries.filter((enquiry) => {
    if (filter === 'all') {
      return enquiry.status !== 'archived';
    }
    if (filter === 'archived') {
      return enquiry.status === 'archived';
    }
    if (filter === 'requests') {
      return enquiry.type === 'request' && enquiry.status !== 'archived';
    }
    if (filter === 'messages') {
      return enquiry.type === 'message' && enquiry.status !== 'archived';
    }
    if (filter === 'sales_orders') {
      return enquiry.type === 'sales_order' && enquiry.status !== 'archived';
    }
    return true;
  });

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

  return (
    <div className="max-w-7xl space-y-6 md:space-y-8">
      {/* Header */}
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

        {/* Filter Button */}
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
              <RadioGroup value={filter} onValueChange={(value) => { setFilter(value as FilterType); setFilterDrawerOpen(false); }}>
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

      {/* Connect Requests Card */}
      {pendingConnectionsData && (
        <ConnectRequestsPreviewCard
          pendingCount={pendingConnectionsData.count}
          connections={pendingConnectionsData.connections}
          onClick={() => navigate('/app/enquiries/connect-requests')}
        />
      )}

      {/* Enquiries List */}
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
          {/* Render affiliate requests first (if pending) */}
          {affiliateRequests
            .filter(req => req.status === 'pending' && (filter === 'all' || filter === 'requests'))
            .map((req) => (
              <AffiliateRequestCard
                key={req.id}
                request={req}
                onStatusChange={fetchEnquiries}
              />
            ))}
          
          {/* Render other enquiries */}
          {filteredEnquiries.map((enquiry) => {
            // Skip affiliate requests that are already rendered above
            const isAffiliateRequest = affiliateRequests.some(req => req.id === enquiry.id);
            if (isAffiliateRequest && enquiry.type === 'request') {
              return null; // Already rendered above
            }

            // Render message enquiries with WhatsApp-style component
            if (enquiry.type === 'message') {
              const messageData = messageEnquiries.find(m => m.conversation_id === enquiry.id);
              if (messageData) {
                return <MessageEnquiryRow key={enquiry.id} data={messageData} />;
              }
              // Fallback to standard card if messageData not found (shouldn't happen)
              return <EnquiryCard key={enquiry.id} enquiry={enquiry} />;
            }
            // Render sales orders with HostEnquiryOrderCard
            if (enquiry.type === 'sales_order') {
              const orderData = hostOrders.find(o => o.order_id === enquiry.id);
              if (orderData) {
                return (
                  <HostEnquiryOrderCard
                    key={enquiry.id}
                    order={orderData}
                    onConfirmed={fetchEnquiries}
                  />
                );
              }
              // Fallback to standard card if orderData not found
              return <EnquiryCard key={enquiry.id} enquiry={enquiry} />;
            }
            // Render other enquiries with standard card
            return <EnquiryCard key={enquiry.id} enquiry={enquiry} />;
          })}
        </div>
      )}
    </div>
  );
}

