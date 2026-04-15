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

export function useConnectedOrgs(orgId?: string, _isPublic: boolean = false) {
  const { currentOrg } = useAuth();
  const targetOrgId = orgId || currentOrg?.id;

  return useQuery({
    queryKey: ['connected-orgs', targetOrgId],
    queryFn: async (): Promise<ConnectedOrg[]> => {
      if (!targetOrgId) {
        console.log('[useConnectedOrgs] No targetOrgId provided');
        return [];
      }

      console.log('[useConnectedOrgs] Fetching connected orgs for:', targetOrgId);

      const { data, error } = await (supabase.rpc as any)('get_connected_orgs_public', {
        p_org_id: targetOrgId,
      });

      if (error) {
        console.error('[useConnectedOrgs] Supabase error raw:', error);
        console.error('[useConnectedOrgs] Supabase error json:', JSON.stringify(error, null, 2));
        console.error('[useConnectedOrgs] Supabase error fields:', {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
        });
        throw error;
      }

      console.log('[useConnectedOrgs] Success, data:', data);
      return (data ?? []) as ConnectedOrg[];
    },
    enabled: !!targetOrgId,
    refetchOnWindowFocus: true,
  });
}
