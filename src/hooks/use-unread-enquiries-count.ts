import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_REFETCH_INTERVAL_MS = 60_000;

/**
 * Shared unread enquiries count — React Query dedupes polling across AppLayout + page mounts.
 */
export function useUnreadEnquiriesCount(options?: {
  refetchInterval?: number | false;
}) {
  const { currentOrg } = useAuth();
  const refetchInterval =
    options?.refetchInterval !== undefined
      ? options.refetchInterval
      : DEFAULT_REFETCH_INTERVAL_MS;

  const { data: count = 0, isLoading: loading, refetch } = useQuery({
    queryKey: ['unread-enquiries-count', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg?.id) return 0;

      const { data, error } = await supabase.rpc('get_unread_enquiries_count', {
        p_org_id: currentOrg.id,
      });

      if (error) {
        console.error('Error fetching unread count:', error);
        return 0;
      }

      return data || 0;
    },
    enabled: !!currentOrg?.id,
    refetchInterval: refetchInterval === false ? false : refetchInterval,
    staleTime: refetchInterval === false ? 60_000 : Math.max(refetchInterval - 5_000, 30_000),
  });

  return { count, loading, refetch };
}
