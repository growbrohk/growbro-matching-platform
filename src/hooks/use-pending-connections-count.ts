import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PendingConnection {
  connection_id: string;
  other_org_id: string;
  other_org_name: string;
  other_org_slug: string | null;
  other_org_logo_url: string | null;
  requested_at: string;
}

export function usePendingConnectionsCount() {
  const { currentOrg } = useAuth();

  return useQuery({
    queryKey: ['pending-connections-count', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return { count: 0, connections: [] };

      const { data, error } = await supabase
        .rpc('get_pending_incoming_connections', {
          p_org_id: currentOrg.id,
        });

      if (error) {
        console.error('Error fetching pending connections:', error);
        return { count: 0, connections: [] };
      }

      return {
        count: data?.length || 0,
        connections: (data || []) as PendingConnection[],
      };
    },
    enabled: !!currentOrg,
    refetchOnWindowFocus: true,
  });
}
