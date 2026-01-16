import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useConnectedCount(orgId?: string, isPublic: boolean = false) {
  const { currentOrg, orgMemberships } = useAuth();
  const targetOrgId = orgId || currentOrg?.id;
  
  // Determine if we should use public RPC
  // Use public RPC if:
  // 1. Explicitly marked as public, OR
  // 2. User is not a member of the target org
  const isMemberOfTargetOrg = targetOrgId && orgMemberships.some((m) => m.org_id === targetOrgId);
  const usePublicRPC = isPublic || !isMemberOfTargetOrg;

  return useQuery({
    queryKey: ['connected-count', targetOrgId, usePublicRPC ? 'public' : 'member'],
    queryFn: async () => {
      if (!targetOrgId) return 0;

      // Try member RPC first if user is a member, fallback to public RPC
      if (!usePublicRPC) {
        const { data, error } = await (supabase.rpc as any)('get_connected_count', {
          p_org_id: targetOrgId,
        });

        if (!error) {
          return data || 0;
        }
        // If member RPC fails, fallback to public RPC
      }

      // Use public RPC
      const { data, error } = await (supabase.rpc as any)('get_connected_count_public', {
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
