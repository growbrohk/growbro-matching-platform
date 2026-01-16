import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ConnectedOrg {
  org_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  category: string;
  accepted_at: string;
}

export function useConnectedOrgs(orgId?: string, isPublic: boolean = false) {
  const { currentOrg, orgMemberships } = useAuth();
  const targetOrgId = orgId || currentOrg?.id;
  
  // Determine if we should use public RPC
  // Use public RPC if:
  // 1. Explicitly marked as public, OR
  // 2. User is not a member of the target org
  const isMemberOfTargetOrg = targetOrgId && orgMemberships.some((m) => m.org_id === targetOrgId);
  const usePublicRPC = isPublic || !isMemberOfTargetOrg;

  return useQuery({
    queryKey: ['connected-orgs', targetOrgId, usePublicRPC ? 'public' : 'member'],
    queryFn: async (): Promise<ConnectedOrg[]> => {
      if (!targetOrgId) {
        console.log('[useConnectedOrgs] No targetOrgId provided');
        return [];
      }

      console.log('[useConnectedOrgs] Fetching connected orgs for:', {
        targetOrgId,
        usePublicRPC,
        isMemberOfTargetOrg,
      });

      // Try member RPC first if user is a member, fallback to public RPC
      if (!usePublicRPC) {
        console.log('[useConnectedOrgs] Trying member RPC: get_connected_orgs');
        const { data, error } = await (supabase.rpc as any)('get_connected_orgs', {
          p_org_id: targetOrgId,
        });

        if (!error) {
          console.log('[useConnectedOrgs] Member RPC success, data:', data);
          return (data ?? []) as ConnectedOrg[];
        }
        console.log('[useConnectedOrgs] Member RPC failed, falling back to public RPC:', error);
        // If member RPC fails, fallback to public RPC
      }

      // Use public RPC
      console.log('[useConnectedOrgs] Using public RPC: get_connected_orgs_public');
      const { data, error } = await (supabase.rpc as any)('get_connected_orgs_public', {
        p_org_id: targetOrgId,
      });

      if (error) {
        console.error('[useConnectedOrgs] Public RPC error:', error);
        console.error('[useConnectedOrgs] Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          targetOrgId,
          isMember: isMemberOfTargetOrg,
          usePublicRPC,
        });
        return [];
      }

      console.log('[useConnectedOrgs] Public RPC success, data:', data);
      return (data ?? []) as ConnectedOrg[];
    },
    enabled: !!targetOrgId,
    refetchOnWindowFocus: true,
  });
}
