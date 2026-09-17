import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchEnquiriesFeedPage,
  INITIAL_ENQUIRIES_PAGE_PARAM,
  markBookingRequestsSeen,
  shouldMarkBookingsSeen,
  type EnquiriesFilterType,
  type EnquiriesPageParam,
} from '@/lib/api/enquiries-feed';

export function enquiriesFeedQueryKey(orgId: string | undefined, filter: EnquiriesFilterType) {
  return ['enquiries-feed', orgId, filter] as const;
}

export function useEnquiriesFeed(
  filter: EnquiriesFilterType,
  options?: { onMarkSeenComplete?: () => void }
) {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.id;

  return useInfiniteQuery({
    queryKey: enquiriesFeedQueryKey(orgId, filter),
    queryFn: async ({ pageParam }) => {
      const param = pageParam as EnquiriesPageParam;
      const page = await fetchEnquiriesFeedPage(orgId!, filter, param);

      if (shouldMarkBookingsSeen(filter) && page.unreadRequestIds.length > 0) {
        queueMicrotask(() => {
          void markBookingRequestsSeen(page.unreadRequestIds)
            .then(() => options?.onMarkSeenComplete?.())
            .catch(() => undefined);
        });
      }

      return page;
    },
    initialPageParam: INITIAL_ENQUIRIES_PAGE_PARAM,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextPageParam : undefined,
    enabled: !!orgId,
    staleTime: 60_000,
  });
}
