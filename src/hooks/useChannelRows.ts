import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ChannelRow {
  tracking_link_id: string;
  label: string;
  slug: string;
  clicks: number;
  orders: number;
  revenue: number;
  destination_url: string;
  collab_partner_org_id: string | null;
  collab_partner_name: string | null;
  status: 'active' | 'inactive';
}

/**
 * Hook to fetch channel rows using the get_channel_rows RPC function
 * Returns tracking channels with aggregated stats (clicks, orders, revenue)
 */
export function useChannelRows() {
  const { currentOrg } = useAuth();

  return useQuery({
    queryKey: ['channel-rows', currentOrg?.id],
    queryFn: async (): Promise<ChannelRow[]> => {
      if (!currentOrg) {
        return [];
      }

      const { data, error } = await (supabase.rpc as any)('get_channel_rows');

      if (error) {
        console.error('Error fetching channel rows:', error);
        throw error;
      }

      return (data ?? []) as ChannelRow[];
    },
    enabled: !!currentOrg,
  });
}
