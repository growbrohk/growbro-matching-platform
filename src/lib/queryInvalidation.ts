import type { QueryClient } from '@tanstack/react-query';

/** Invalidate all pipeline-related caches after create/edit tracking links. */
export async function invalidatePipelineQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['pipeline-rows'] }),
    queryClient.invalidateQueries({ queryKey: ['pipeline-revenue-rows'] }),
    queryClient.invalidateQueries({ queryKey: ['tracking-channels-count'] }),
    queryClient.invalidateQueries({ queryKey: ['tracking-collab-count'] }),
  ]);
}

/** Invalidate connection caches after accept/reject/request actions. */
export async function invalidateConnectionQueries(
  queryClient: QueryClient,
  currentOrgId?: string | null,
  otherOrgId?: string | null
) {
  const tasks: Promise<void>[] = [
    queryClient.invalidateQueries({ queryKey: ['connected-orgs'] }),
    queryClient.invalidateQueries({ queryKey: ['pending-connections-count'] }),
    queryClient.invalidateQueries({ queryKey: ['connectionStatus'] }),
    queryClient.invalidateQueries({ queryKey: ['connected-count'] }),
    queryClient.invalidateQueries({ queryKey: ['suggested-orgs'] }),
  ];

  if (currentOrgId) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: ['connected-orgs', currentOrgId] }),
      queryClient.invalidateQueries({ queryKey: ['pending-connections-count', currentOrgId] }),
      queryClient.invalidateQueries({ queryKey: ['connected-count', currentOrgId] })
    );
  }

  if (otherOrgId) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: ['connectionStatus', currentOrgId, otherOrgId] }),
      queryClient.invalidateQueries({ queryKey: ['pending-connections-count', otherOrgId] }),
      queryClient.invalidateQueries({ queryKey: ['connected-count', otherOrgId] }),
      queryClient.invalidateQueries({ queryKey: ['connected-orgs', otherOrgId] })
    );
  }

  await Promise.all(tasks);
}

/** Invalidate order-related caches after confirm, dispatch, or payment updates. */
export async function invalidateOrderQueries(
  queryClient: QueryClient,
  orderId?: string | null,
  eventId?: string | null
) {
  const tasks: Promise<void>[] = [
    queryClient.invalidateQueries({ queryKey: ['orders-dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['product-orders-table'] }),
  ];

  if (orderId) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: ['host-order-detail', orderId] }),
      queryClient.invalidateQueries({ queryKey: ['collab-order-detail-access', orderId] }),
      queryClient.invalidateQueries({ queryKey: ['collab-can-mark-shipped', orderId] })
    );
  }

  if (eventId) {
    tasks.push(queryClient.invalidateQueries({ queryKey: ['event-tickets', eventId] }));
  } else {
    tasks.push(queryClient.invalidateQueries({ queryKey: ['event-tickets'] }));
  }

  await Promise.all(tasks);
}
