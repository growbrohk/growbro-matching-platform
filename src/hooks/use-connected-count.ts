import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useConnectedCount(orgId?: string) {
  const { currentOrg } = useAuth();
  const targetOrgId = orgId || currentOrg?.id;

  return useQuery({
    queryKey: ['connected-count', targetOrgId],
    queryFn: async () => {
      if (!targetOrgId) return 0;

      const { data, error } = await supabase.rpc('get_connected_count', {
        p_org_id: targetOrgId,
      });

      if (error) {
        console.error('Error fetching connected count:', error);
        return 0;
      }

      return data || 0;
    },
    enabled: !!targetOrgId,
    refetchOnWindowFocus: true,
  });
}
