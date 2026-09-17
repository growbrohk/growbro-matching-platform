import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchEnquiriesFeedPage,
  markBookingRequestsSeen,
  shouldMarkBookingsSeen,
  type EnquiriesFilterType,
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
      const page = await fetchEnquiriesFeedPage(orgId!, filter, pageParam);

      if (shouldMarkBookingsSeen(filter) && page.unreadRequestIds.length > 0) {
        queueMicrotask(() => {
          void markBookingRequestsSeen(page.unreadRequestIds)
            .then(() => options?.onMarkSeenComplete?.())
            .catch(() => undefined);
        });
      }

      return page;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length : undefined,
    enabled: !!orgId,
    staleTime: 60_000,
  });
}
