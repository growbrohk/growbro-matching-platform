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
      if (!targetOrgId) {
        console.log('[useConnectedCount] No targetOrgId provided');
        return 0;
      }

      console.log('[useConnectedCount] Fetching connected count for:', {
        targetOrgId,
        usePublicRPC,
        isMemberOfTargetOrg,
      });

      // Try member RPC first if user is a member, fallback to public RPC
      if (!usePublicRPC) {
        console.log('[useConnectedCount] Trying member RPC: get_connected_count');
        const { data, error } = await (supabase.rpc as any)('get_connected_count', {
          p_org_id: targetOrgId,
        });

        if (!error) {
          console.log('[useConnectedCount] Member RPC success, count:', data);
          return data || 0;
        }
        console.log('[useConnectedCount] Member RPC failed, falling back to public RPC:', error);
        // If member RPC fails, fallback to public RPC
      }

      // Use public RPC
      console.log('[useConnectedCount] Using public RPC: get_connected_count_public');
      const { data, error } = await (supabase.rpc as any)('get_connected_count_public', {
        p_org_id: targetOrgId,
      });

      if (error) {
        console.error('[useConnectedCount] Public RPC error:', error);
        console.error('[useConnectedCount] Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return 0;
      }

      console.log('[useConnectedCount] Public RPC success, count:', data);
      return data || 0;
    },
    enabled: !!targetOrgId,
    refetchOnWindowFocus: true,
  });
}
