import { Order } from '@/hooks/useOrdersDashboard';
import { format } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface OrderRowProps {
  order: Order;
}

/**
 * OrderRow - Reusable component for displaying order list items
 * Matches the screenshot layout: product | details | qty | status
 */
export function OrderRow({ order }: OrderRowProps) {
  // Format created_at timestamp
  const timestamp = order.created_at
    ? format(new Date(order.created_at), 'MMM d, yyyy h:mm a')
    : '';

  // Get product/event name from metadata or use placeholder
  const productName =
    order.metadata?.product_name ||
    order.metadata?.event_name ||
    order.order_type === 'event'
      ? `Event Order`
      : `Product #${order.id.slice(0, 8)}`;

  // Quantity: default to 1 for now (can be enhanced with order_items join later)
  const quantity = order.metadata?.quantity || 1;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-200">
      {/* Product Column */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-12 h-12 rounded bg-gray-200 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate" style={{ color: '#0F1F17' }}>
            {productName}
          </div>
          <div className="text-xs truncate" style={{ color: 'rgba(15,31,23,0.6)' }}>
            {timestamp}
          </div>
        </div>
      </div>

      {/* Details Column */}
      <div className="flex-shrink-0">
        <Link
          to={`/app/orders/${order.id}`}
          className="text-sm hover:underline"
          style={{ color: '#0F1F17' }}
        >
          details
        </Link>
      </div>

      {/* Qty Column */}
      <div className="flex-shrink-0 text-sm" style={{ color: '#0F1F17' }}>
        {quantity}
      </div>

      {/* Status Column */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {order.payment_status === 'submitted' ? (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-sm" style={{ color: '#0F1F17' }}>
              pending
            </span>
          </>
        ) : order.payment_status === 'paid' || order.fulfillment_status === 'confirmed' ? (
          <>
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm" style={{ color: '#0F1F17' }}>
              completed
            </span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-sm" style={{ color: '#0F1F17' }}>
              {order.payment_status || 'pending'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
