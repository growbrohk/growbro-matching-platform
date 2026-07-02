import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchDashboardSummary, type DashboardSummaryData } from '@/lib/api/dashboard-summary';
import type { RangeKey } from '@/hooks/useOrdersDashboard';

export function useDashboardSummary(
  rangeKey: RangeKey = '30d',
  options?: { enabled?: boolean }
) {
  const { currentOrg } = useAuth();
  const enabled = options?.enabled !== false;

  return useQuery({
    queryKey: ['dashboard-summary', currentOrg?.id, rangeKey],
    queryFn: async (): Promise<DashboardSummaryData> => {
      if (!currentOrg) {
        return {
          revenueTotal: 0,
          ordersCountSubmittedPaid: 0,
          pendingCountSubmitted: 0,
          pendingShippingCount: 0,
          pendingOrders: [],
          pendingShippingOrders: [],
        };
      }
      return fetchDashboardSummary(currentOrg.id, rangeKey);
    },
    enabled: enabled && !!currentOrg,
  });
}
