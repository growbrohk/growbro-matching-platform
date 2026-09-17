import { useQuery } from '@tanstack/react-query';
import { getTicketTypes } from '@/lib/api/events';
import type { TicketType } from '@/lib/types';

/** Shared cache for public event page + checkout inventory revalidation */
export const PUBLIC_TICKET_TYPES_QUERY_KEY = 'public-ticket-types';

const STALE_TIME_MS = 45_000;

export function publicTicketTypesQueryKey(eventId: string) {
  return [PUBLIC_TICKET_TYPES_QUERY_KEY, eventId] as const;
}

export function usePublicTicketTypes(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: publicTicketTypesQueryKey(eventId ?? ''),
    queryFn: () => getTicketTypes(eventId!, true, true),
    enabled: Boolean(eventId) && enabled,
    staleTime: STALE_TIME_MS,
  });
}

/** Imperative fetch with the same cache key (e.g. visibility refresh). */
export async function fetchPublicTicketTypes(
  queryClient: import('@tanstack/react-query').QueryClient,
  eventId: string
): Promise<TicketType[]> {
  return queryClient.fetchQuery({
    queryKey: publicTicketTypesQueryKey(eventId),
    queryFn: () => getTicketTypes(eventId, true, true),
    staleTime: STALE_TIME_MS,
  });
}
