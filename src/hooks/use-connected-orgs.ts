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

export function useConnectedOrgs(orgId?: string) {
  const { currentOrg, orgMemberships } = useAuth();
  const targetOrgId = orgId || currentOrg?.id;

  return useQuery({
    queryKey: ['connected-orgs', targetOrgId],
    queryFn: async (): Promise<ConnectedOrg[]> => {
      if (!targetOrgId) return [];

      const { data, error } = await (supabase.rpc as any)('get_connected_orgs', {
        p_org_id: targetOrgId,
      });

      if (error) {
        console.error('Error fetching connected orgs:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          targetOrgId,
          isMember: orgMemberships.some((m) => m.org_id === targetOrgId),
        });
        return [];
      }

      return (data ?? []) as ConnectedOrg[];
    },
    enabled: !!targetOrgId,
    refetchOnWindowFocus: true,
  });
}
