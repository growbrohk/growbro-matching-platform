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
import EnquiryCard from '@/components/enquiries/EnquiryCard';

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
  const { currentOrg } = useAuth();
  const [filter, setFilter] = useState<FilterType>('all');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    fetchEnquiries();
  }, [currentOrg, filter]);

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

      // Fetch orders (Sales Orders) - orders are linked to events, events have org_id
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          *,
          events!inner(
            id,
            title,
            org_id,
            orgs!inner(
              name,
              slug,
              org_profiles(logo_url, category, location)
            )
          )
        `)
        .eq('events.org_id', currentOrg.id)
        .order('created_at', { ascending: false });

      if (orders) {
        for (const order of orders) {
          const eventData = order.events as any;
          const orgData = eventData?.orgs;
          const profileData = Array.isArray(orgData?.org_profiles) 
            ? orgData.org_profiles[0] 
            : orgData?.org_profiles;

          // Don't filter during fetch - filter after fetching all data

          allEnquiries.push({
            id: order.id,
            type: 'sales_order',
            status: order.status === 'paid' ? 'confirmed' : order.status === 'pending' ? 'waiting_confirmation' : 'archived',
            brand: {
              name: orgData?.name || 'Unknown',
              slug: orgData?.slug,
              logoUrl: profileData?.logo_url,
              category: profileData?.category,
              location: profileData?.location,
            },
            item: {
              name: eventData?.title || 'Event',
              thumbnailUrl: undefined,
              type: 'event',
            },
            previewText: `Order #${order.id.slice(0, 8)}`,
            date: order.created_at,
            unread: order.status === 'pending',
            channel: 'Website',
            productType: 'ticket',
          });
        }
      }

      // Fetch conversations (Messages)
      // First get conversation IDs for current org
      const { data: myConversations, error: conversationsError } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('org_id', currentOrg.id);

      if (!conversationsError && myConversations && myConversations.length > 0) {
        const convIds = myConversations.map(cp => cp.conversation_id);
        
        // Fetch conversation details with last_message_at
        const { data: conversationsData } = await supabase
          .from('conversations')
          .select('id, last_message_at, created_at')
          .in('id', convIds)
          .order('last_message_at', { ascending: false, nullsFirst: false });

        if (conversationsData && conversationsData.length > 0) {
          // Fetch last message for each conversation (using a subquery approach)
          // For each conversation, get the most recent message
          const conversationData: Array<{
            conversationId: string;
            lastMessage: any;
            otherOrgId: string;
          }> = [];

          for (const convId of convIds) {
          // Get last message
          const { data: lastMessage } = await supabase
            .from('conversation_messages')
            .select('id, body, created_at, sender_org_id')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          // Get other participant org_id
          const { data: otherParticipant } = await supabase
            .from('conversation_participants')
            .select('org_id')
            .eq('conversation_id', convId)
            .neq('org_id', currentOrg.id)
            .limit(1)
            .single();

          if (lastMessage && otherParticipant) {
            conversationData.push({
              conversationId: convId,
              lastMessage,
              otherOrgId: otherParticipant.org_id,
            });
          }
        }

        // Fetch all other orgs with profiles in one query
        const otherOrgIds = conversationData.map(cd => cd.otherOrgId);
        const otherOrgMap = new Map<string, any>();
        if (otherOrgIds.length > 0) {
          const { data: otherOrgs } = await supabase
            .from('orgs')
            .select(`
              id,
              name,
              slug,
              org_profiles(category, address, logo_url)
            `)
            .in('id', otherOrgIds);

          if (otherOrgs) {
            for (const org of otherOrgs) {
              const profileData = Array.isArray(org.org_profiles) 
                ? org.org_profiles[0] 
                : org.org_profiles;
              otherOrgMap.set(org.id, {
                name: org.name,
                slug: org.slug,
                logoUrl: profileData?.logo_url,
                category: profileData?.category,
                location: profileData?.address,
              });
            }
          }
        }

        // Create enquiry items
        for (const cd of conversationData) {
          const otherOrg = otherOrgMap.get(cd.otherOrgId);
          if (!otherOrg) continue;

          const convInfo = conversationsData.find(c => c.id === cd.conversationId);
          const lastMessageAt = convInfo?.last_message_at || cd.lastMessage.created_at;

          allEnquiries.push({
            id: cd.conversationId,
            type: 'message',
            status: 'pending',
            brand: {
              name: otherOrg.name,
              slug: otherOrg.slug,
              logoUrl: otherOrg.logoUrl,
              category: otherOrg.category,
              location: otherOrg.location,
            },
            item: {
              name: 'Message',
              type: 'message',
            },
            previewText: cd.lastMessage.body,
            date: lastMessageAt,
            unread: false,
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
          {filteredEnquiries.map((enquiry) => (
            <EnquiryCard key={enquiry.id} enquiry={enquiry} />
          ))}
        </div>
      )}
    </div>
  );
}

