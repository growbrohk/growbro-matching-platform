import { supabase } from '@/integrations/supabase/client';
import { ENQUIRIES_INITIAL_FETCH } from '@/lib/constants/query-limits';
import {
  getBookingRequestsForOrg,
  markBookingRequestsSeen,
  type BookingRequestWithSpace,
} from '@/lib/api/poster-spaces';
import type { HostOrderCardData } from '@/components/host/HostEnquiryOrderCard';
import type { MessageEnquiryRowData } from '@/components/enquiries/MessageEnquiryRow';

export type EnquiriesFilterType =
  | 'all'
  | 'requests'
  | 'messages'
  | 'sales_orders'
  | 'archived';

export interface EnquiryItem {
  id: string;
  type: 'request' | 'message' | 'sales_order' | 'system';
  status?: 'pending' | 'waiting_confirmation' | 'confirmed' | 'archived' | string;
  brand?: { name: string; slug?: string; logoUrl?: string; category?: string; location?: string };
  item?: { name: string; thumbnailUrl?: string; type?: 'event' | 'product' | 'space' | 'message' };
  period?: { start?: string | Date; end?: string | Date };
  previewText?: string;
  date: string | Date;
  unread?: boolean;
  channel?: 'POS' | 'Website' | string;
  productType?: string;
  spaceType?: string;
}

export interface AffiliateRequestRow {
  id: string;
  tracking_link_id: string;
  host_org_id: string;
  affiliate_org_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  tracking_link: {
    slug: string;
    label: string | null;
    destination_url: string;
    commission_rate: number;
    start_date: string;
    end_date: string;
  };
  host_org: {
    name: string;
    slug?: string;
  };
}

export interface RequesterOrgProfile {
  name?: string;
  slug?: string;
  logoUrl?: string;
  category?: string;
  location?: string;
}

export type HostOrdersCursor = { updatedAt: string; orderId: string } | null;

export type EnquiriesPageParam = {
  ordersCursor: HostOrdersCursor;
  bookingsOffset: number;
  affiliatesOffset: number;
  inboxOffset: number;
};

export const INITIAL_ENQUIRIES_PAGE_PARAM: EnquiriesPageParam = {
  ordersCursor: null,
  bookingsOffset: 0,
  affiliatesOffset: 0,
  inboxOffset: 0,
};

const AFFILIATE_SELECT = `
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
`;

function offsetRange(offset: number): { from: number; to: number } {
  return { from: offset, to: offset + ENQUIRIES_INITIAL_FETCH - 1 };
}

function sortEnquiries(items: EnquiryItem[]): EnquiryItem[] {
  return [...items].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

function mapBookingToEnquiry(
  { request, space }: BookingRequestWithSpace,
  requesterOrg?: RequesterOrgProfile | null
): EnquiryItem {
  return {
    id: request.id,
    type: 'request',
    status:
      request.status === 'pending'
        ? 'pending'
        : request.status === 'approved'
          ? 'confirmed'
          : 'archived',
    brand: {
      name: request.requester_name || requesterOrg?.name || 'Unknown',
      slug: requesterOrg?.slug,
      logoUrl: requesterOrg?.logoUrl,
      category: requesterOrg?.category,
      location: requesterOrg?.location,
    },
    item: {
      name: space.title || 'Space',
      thumbnailUrl:
        Array.isArray(space.photos) && space.photos.length > 0 ? space.photos[0] : undefined,
      type: 'space',
    },
    period: {
      start: request.requested_start_date,
      end: request.computed_end_date,
    },
    previewText: request.message || undefined,
    date: request.created_at,
    unread: request.status === 'pending',
  };
}

function mapOrderToEnquiry(order: HostOrderCardData): EnquiryItem {
  const isProductOrder = !order.event_id;
  return {
    id: order.order_id,
    type: 'sales_order',
    status:
      order.fulfillment_status === 'confirmed'
        ? 'confirmed'
        : order.fulfillment_status === 'pending_confirmation'
          ? 'waiting_confirmation'
          : 'archived',
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
  };
}

function mapInboxToEnquiry(inboxRow: MessageEnquiryRowData): EnquiryItem {
  return {
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
  };
}

function transformAffiliateRows(data: unknown[]): AffiliateRequestRow[] {
  return data.map((req: any) => ({
    id: req.id,
    tracking_link_id: req.tracking_link_id,
    host_org_id: req.host_org_id,
    affiliate_org_id: req.affiliate_org_id,
    status: req.status as 'pending' | 'accepted' | 'rejected',
    created_at: req.created_at,
    tracking_link: req.tracking_links,
    host_org: Array.isArray(req.orgs) ? req.orgs[0] : req.orgs,
  }));
}

function mapAffiliateToEnquiry(req: AffiliateRequestRow): EnquiryItem | null {
  if (req.status !== 'pending') return null;
  return {
    id: req.id,
    type: 'request',
    status: 'pending',
    brand: {
      name: req.host_org.name,
      slug: req.host_org.slug,
    },
    item: {
      name: req.tracking_link.label || req.tracking_link.destination_url,
      type: 'event',
    },
    period: {
      start: req.tracking_link.start_date,
      end: req.tracking_link.end_date,
    },
    previewText: `Commission: ${(req.tracking_link.commission_rate * 100).toFixed(1)}%`,
    date: req.created_at,
    unread: true,
  };
}

export interface EnquiriesFeedPageResult {
  enquiries: EnquiryItem[];
  hostOrders: HostOrderCardData[];
  messageEnquiries: MessageEnquiryRowData[];
  affiliateRequests: AffiliateRequestRow[];
  bookings: BookingRequestWithSpace[];
  unreadRequestIds: string[];
  requesterUserIds: string[];
  hasMore: boolean;
  nextPageParam: EnquiriesPageParam;
}

async function fetchHostOrdersPage(
  orgId: string,
  cursor: HostOrdersCursor
): Promise<{ orders: HostOrderCardData[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc('get_host_order_list', {
    p_org_id: orgId,
    p_limit: ENQUIRIES_INITIAL_FETCH,
    p_cursor_updated_at: cursor?.updatedAt ?? null,
    p_cursor_order_id: cursor?.orderId ?? null,
  });

  if (error) {
    console.error('Error fetching host orders:', error);
    return { orders: [], hasMore: false };
  }

  const orders = (data ?? []) as HostOrderCardData[];
  return { orders, hasMore: orders.length === ENQUIRIES_INITIAL_FETCH };
}

async function fetchInboxPage(
  orgId: string,
  offset: number
): Promise<{ rows: MessageEnquiryRowData[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc('get_conversation_inbox', {
    p_org_id: orgId,
    p_limit: ENQUIRIES_INITIAL_FETCH,
    p_offset: offset,
  });

  if (error) {
    console.error('Error fetching conversation inbox:', error);
    return { rows: [], hasMore: false };
  }

  const rows = (data ?? []) as MessageEnquiryRowData[];
  return { rows, hasMore: rows.length === ENQUIRIES_INITIAL_FETCH };
}

async function fetchAffiliatesPage(
  orgId: string,
  range: { from: number; to: number }
): Promise<{ affiliates: AffiliateRequestRow[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('affiliate_requests')
    .select(AFFILIATE_SELECT)
    .eq('affiliate_org_id', orgId)
    .order('created_at', { ascending: false })
    .range(range.from, range.to);

  if (error) {
    console.error('Error fetching affiliate requests:', error);
    return { affiliates: [], hasMore: false };
  }

  const affiliates = transformAffiliateRows(data ?? []);
  return { affiliates, hasMore: affiliates.length === ENQUIRIES_INITIAL_FETCH };
}

async function fetchBookingsPage(
  orgId: string,
  range: { from: number; to: number }
): Promise<{ bookings: BookingRequestWithSpace[]; hasMore: boolean }> {
  const bookings = await getBookingRequestsForOrg(orgId, range);
  return { bookings, hasMore: bookings.length === ENQUIRIES_INITIAL_FETCH };
}

export async function fetchRequesterOrgMap(
  userIds: string[]
): Promise<Map<string, RequesterOrgProfile>> {
  const map = new Map<string, RequesterOrgProfile>();
  if (userIds.length === 0) return map;

  const { data: orgMembers } = await supabase
    .from('org_members')
    .select('user_id, org_id, orgs(name, slug, org_profiles(logo_url, category, location))')
    .in('user_id', userIds);

  if (!orgMembers) return map;

  for (const member of orgMembers) {
    const orgData = member.orgs as {
      name?: string;
      slug?: string;
      org_profiles?: { logo_url?: string; category?: string; location?: string } | { logo_url?: string; category?: string; location?: string }[];
    };
    const profileData = Array.isArray(orgData?.org_profiles)
      ? orgData.org_profiles[0]
      : orgData?.org_profiles;

    if (!map.has(member.user_id)) {
      map.set(member.user_id, {
        name: orgData?.name,
        slug: orgData?.slug,
        logoUrl: profileData?.logo_url,
        category: profileData?.category,
        location: profileData?.location,
      });
    }
  }

  return map;
}

export function applyRequesterOrgMap(
  enquiries: EnquiryItem[],
  bookings: BookingRequestWithSpace[],
  requesterOrgMap: Map<string, RequesterOrgProfile>
): EnquiryItem[] {
  if (requesterOrgMap.size === 0) return enquiries;

  const bookingById = new Map(bookings.map((b) => [b.request.id, b]));

  return enquiries.map((enquiry) => {
    if (enquiry.type !== 'request') return enquiry;
    const booking = bookingById.get(enquiry.id);
    if (!booking?.request.requester_user_id) return enquiry;
    const requesterOrg = requesterOrgMap.get(booking.request.requester_user_id);
    if (!requesterOrg) return enquiry;
    return {
      ...enquiry,
      brand: {
        name: booking.request.requester_name || requesterOrg.name || enquiry.brand?.name || 'Unknown',
        slug: requesterOrg.slug ?? enquiry.brand?.slug,
        logoUrl: requesterOrg.logoUrl ?? enquiry.brand?.logoUrl,
        category: requesterOrg.category ?? enquiry.brand?.category,
        location: requesterOrg.location ?? enquiry.brand?.location,
      },
    };
  });
}

export { markBookingRequestsSeen };

function buildNextPageParam(
  pageParam: EnquiriesPageParam,
  opts: {
    ordersHasMore: boolean;
    orders: HostOrderCardData[];
    bookingsHasMore: boolean;
    affiliatesHasMore: boolean;
    inboxHasMore: boolean;
  }
): EnquiriesPageParam {
  const next: EnquiriesPageParam = { ...pageParam };

  if (opts.orders.length > 0) {
    const last = opts.orders[opts.orders.length - 1];
    next.ordersCursor = { updatedAt: last.updated_at, orderId: last.order_id };
  }

  if (opts.bookingsHasMore) {
    next.bookingsOffset = pageParam.bookingsOffset + ENQUIRIES_INITIAL_FETCH;
  }
  if (opts.affiliatesHasMore) {
    next.affiliatesOffset = pageParam.affiliatesOffset + ENQUIRIES_INITIAL_FETCH;
  }
  if (opts.inboxHasMore) {
    next.inboxOffset = pageParam.inboxOffset + ENQUIRIES_INITIAL_FETCH;
  }

  return next;
}

export async function fetchEnquiriesFeedPage(
  orgId: string,
  filter: EnquiriesFilterType,
  pageParam: EnquiriesPageParam
): Promise<EnquiriesFeedPageResult> {
  const bookingsRange = offsetRange(pageParam.bookingsOffset);
  const affiliatesRange = offsetRange(pageParam.affiliatesOffset);

  const enquiries: EnquiryItem[] = [];
  let hostOrders: HostOrderCardData[] = [];
  let messageEnquiries: MessageEnquiryRowData[] = [];
  let affiliateRequests: AffiliateRequestRow[] = [];
  let bookings: BookingRequestWithSpace[] = [];
  let unreadRequestIds: string[] = [];
  let requesterUserIds: string[] = [];

  let ordersHasMore = false;
  let bookingsHasMore = false;
  let affiliatesHasMore = false;
  let inboxHasMore = false;

  const includeBookings =
    filter === 'all' || filter === 'requests' || filter === 'archived';
  const includeOrders = filter === 'all' || filter === 'sales_orders';
  const includeInbox = filter === 'all' || filter === 'messages';
  const includeAffiliates = filter === 'all' || filter === 'requests';

  if (filter === 'sales_orders') {
    const { orders, hasMore } = await fetchHostOrdersPage(orgId, pageParam.ordersCursor);
    hostOrders = orders;
    ordersHasMore = hasMore;
    enquiries.push(...orders.map(mapOrderToEnquiry));
    const hasMorePage = ordersHasMore;
    return {
      enquiries: sortEnquiries(enquiries),
      hostOrders,
      messageEnquiries,
      affiliateRequests,
      bookings,
      unreadRequestIds,
      requesterUserIds,
      hasMore: hasMorePage,
      nextPageParam: buildNextPageParam(pageParam, {
        ordersHasMore,
        orders,
        bookingsHasMore: false,
        affiliatesHasMore: false,
        inboxHasMore: false,
      }),
    };
  }

  if (filter === 'messages') {
    const { rows, hasMore } = await fetchInboxPage(orgId, pageParam.inboxOffset);
    messageEnquiries = rows;
    inboxHasMore = hasMore;
    enquiries.push(...rows.map(mapInboxToEnquiry));
    return {
      enquiries: sortEnquiries(enquiries),
      hostOrders,
      messageEnquiries,
      affiliateRequests,
      bookings,
      unreadRequestIds,
      requesterUserIds,
      hasMore: inboxHasMore,
      nextPageParam: buildNextPageParam(pageParam, {
        ordersHasMore: false,
        orders: [],
        bookingsHasMore: false,
        affiliatesHasMore: false,
        inboxHasMore,
      }),
    };
  }

  const tasks: Promise<void>[] = [];

  if (includeBookings) {
    tasks.push(
      fetchBookingsPage(orgId, bookingsRange).then(({ bookings: pageBookings, hasMore }) => {
        bookingsHasMore = hasMore;
        bookings = pageBookings;
        unreadRequestIds = pageBookings
          .filter(({ request }) => !request.host_seen_at)
          .map(({ request }) => request.id);
        requesterUserIds = pageBookings
          .map(({ request }) => request.requester_user_id)
          .filter(Boolean) as string[];
        for (const row of pageBookings) {
          enquiries.push(mapBookingToEnquiry(row));
        }
      })
    );
  }

  if (includeOrders) {
    tasks.push(
      fetchHostOrdersPage(orgId, pageParam.ordersCursor).then(({ orders, hasMore }) => {
        ordersHasMore = hasMore;
        hostOrders = orders;
        enquiries.push(...orders.map(mapOrderToEnquiry));
      })
    );
  }

  if (includeInbox) {
    tasks.push(
      fetchInboxPage(orgId, pageParam.inboxOffset).then(({ rows, hasMore }) => {
        inboxHasMore = hasMore;
        messageEnquiries = rows;
        enquiries.push(...rows.map(mapInboxToEnquiry));
      })
    );
  }

  if (includeAffiliates) {
    tasks.push(
      fetchAffiliatesPage(orgId, affiliatesRange).then(({ affiliates, hasMore }) => {
        affiliatesHasMore = hasMore;
        affiliateRequests = affiliates;
        for (const req of affiliates) {
          const item = mapAffiliateToEnquiry(req);
          if (item) enquiries.push(item);
        }
      })
    );
  }

  await Promise.all(tasks);

  const hasMore =
    ordersHasMore || bookingsHasMore || affiliatesHasMore || inboxHasMore;

  return {
    enquiries: sortEnquiries(enquiries),
    hostOrders,
    messageEnquiries,
    affiliateRequests,
    bookings,
    unreadRequestIds,
    requesterUserIds,
    hasMore,
    nextPageParam: buildNextPageParam(pageParam, {
      ordersHasMore,
      orders: hostOrders,
      bookingsHasMore,
      affiliatesHasMore,
      inboxHasMore,
    }),
  };
}

export function filterEnquiriesForTab(
  enquiries: EnquiryItem[],
  filter: EnquiriesFilterType
): EnquiryItem[] {
  return enquiries.filter((enquiry) => {
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
}

export function shouldMarkBookingsSeen(filter: EnquiriesFilterType): boolean {
  return filter === 'all' || filter === 'requests';
}
