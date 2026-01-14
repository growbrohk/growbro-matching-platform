import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
export interface HostOrderCardData {
  order_id: string;
  order_no: string | null;
  fulfillment_status: 'pending_confirmation' | 'confirmed' | 'cancelled';
  confirmed_at: string | null;
  updated_at: string;
  payment_method: string | null;
  receipt_url: string | null;
  metadata: Record<string, any> | null;
  buyer_first_name: string | null;
  buyer_last_name: string | null;
  buyer_phone: string | null;
  total_amount: number;
  currency: string;
  event_id: string;
  event_title: string;
  event_start_at: string;
  event_location_text: string | null;
  event_cover_image_url: string | null;
  org_id: string;
  tickets_count: number;
}

interface HostEnquiryOrderCardProps {
  order: HostOrderCardData;
  onConfirmed?: () => void;
}

/**
 * Format amount in HKD (or specified currency)
 */
function formatAmount(amount: number, currency: string = 'HKD'): string {
  if (!amount || amount === 0) return 'FREE';
  
  const currencySymbols: Record<string, string> = {
    HKD: 'HK$',
    USD: '$',
    GBP: '£',
    EUR: '€',
  };
  
  const symbol = currencySymbols[currency.toUpperCase()] || currency;
  return `${symbol}${amount.toFixed(0)}`;
}

/**
 * Format time ago (e.g., "2m ago")
 */
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Get payment proof URL from order data
 */
function getPaymentProofUrl(order: HostOrderCardData): string | null {
  // First try receipt_url
  if (order.receipt_url) {
    return order.receipt_url;
  }
  
  // Fallback to metadata.payment_proof_url
  if (order.metadata && typeof order.metadata === 'object' && 'payment_proof_url' in order.metadata) {
    return order.metadata.payment_proof_url as string;
  }
  
  return null;
}

/**
 * Get receipt link text based on payment method
 */
function getReceiptLinkText(paymentMethod: string | null): string {
  if (!paymentMethod) return 'Receipt';
  const method = paymentMethod.toLowerCase();
  if (method === 'payme') return 'PayMe Receipt';
  if (method === 'fps') return 'FPS Receipt';
  return 'Receipt';
}

export default function HostEnquiryOrderCard({ order, onConfirmed }: HostEnquiryOrderCardProps) {
  const { toast } = useToast();
  const [isConfirming, setIsConfirming] = useState(false);
  const [showProofDialog, setShowProofDialog] = useState(false);
  
  const paymentProofUrl = getPaymentProofUrl(order);
  const showReceiptLink = !!paymentProofUrl;
  const receiptLinkText = getReceiptLinkText(order.payment_method);
  const isConfirmed = order.fulfillment_status === 'confirmed';
  const isPending = order.fulfillment_status === 'pending_confirmation';
  
  // Format buyer name
  const buyerName = [order.buyer_first_name, order.buyer_last_name]
    .filter(Boolean)
    .join(' ') || 'Guest';
  
  const handleConfirm = async () => {
    if (isConfirmed || isConfirming) return;
    
    setIsConfirming(true);
    try {
      // Use the RPC function to safely update fulfillment
      const { data, error } = await supabase.rpc('update_order_fulfillment', {
        p_order_id: order.order_id,
        p_fulfillment_status: 'confirmed',
        p_confirmed_at: new Date().toISOString(),
      });
      
      if (error) {
        console.error('Error confirming order:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to confirm order',
          variant: 'destructive',
        });
        return;
      }
      
      if (data !== true) {
        console.error('Unexpected response from update_order_fulfillment:', data);
        toast({
          title: 'Error',
          description: 'Failed to confirm order',
          variant: 'destructive',
        });
        return;
      }
      
      toast({
        title: 'Confirmed ✅',
        description: 'Order confirmed and email will be sent.',
      });
      
      // Call callback to refresh list
      if (onConfirmed) {
        onConfirmed();
      }
    } catch (error: any) {
      console.error('Error confirming order:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to confirm order',
        variant: 'destructive',
      });
    } finally {
      setIsConfirming(false);
    }
  };
  
  return (
    <>
      <div className="flex flex-col gap-3 p-3 bg-white rounded-2xl border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
        {/* ROW 1: Header */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-700 truncate min-w-0">
            Event Ticket — {order.event_title}
          </span>
          <span className="text-xs text-gray-400 shrink-0">
            {formatTimeAgo(order.updated_at)}
          </span>
        </div>
        
        {/* ROW 2: Body */}
        <div className="flex gap-3">
          {/* LEFT SECTION */}
          <div className="flex-1 min-w-0 flex gap-3">
            {/* Event Photo with Status Overlay */}
            <div className="flex-shrink-0 relative">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                {order.event_cover_image_url ? (
                  <img
                    src={order.event_cover_image_url}
                    alt={order.event_title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-gray-400">No photo</span>
                )}
              </div>
              {/* Status Pill Overlay */}
              <Badge
                className={`absolute bottom-1 left-1 text-xs px-2 py-0.5 ${
                  isConfirmed
                    ? 'bg-green-500 text-white border-green-600'
                    : 'bg-yellow-100 text-black border-yellow-300'
                }`}
                variant="outline"
              >
                {isConfirmed ? 'Confirmed' : 'Pending'}
              </Badge>
            </div>
            
            {/* Buyer Info and Details */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {/* Receipt Link (inline with status area, same row) */}
              {showReceiptLink && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowProofDialog(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    {receiptLinkText}
                  </button>
                </div>
              )}
              
              {/* Buyer Name + Phone */}
              <div className="text-sm text-gray-700 truncate">
                {buyerName}
                {order.buyer_phone && ` • ${order.buyer_phone}`}
              </div>
              
              {/* Tickets Count + Price */}
              <div className="text-sm text-gray-500 truncate">
                {order.tickets_count} ticket{order.tickets_count !== 1 ? 's' : ''} • {formatAmount(order.total_amount, order.currency)}
              </div>
            </div>
          </div>
          
          {/* RIGHT SECTION */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Total Price */}
            <div className="text-lg font-bold text-black">
              {formatAmount(order.total_amount, order.currency)}
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled
                className="text-gray-400"
              >
                Details
              </Button>
              {isPending && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleConfirm}
                  disabled={isConfirming}
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Confirming...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Payment Proof Dialog */}
      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{receiptLinkText}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {paymentProofUrl ? (
              <img
                src={paymentProofUrl}
                alt="Payment proof"
                className="w-full h-auto rounded-lg border"
                style={{ borderColor: 'rgba(14,122,58,0.14)' }}
              />
            ) : (
              <p className="text-sm text-gray-500">No payment proof available</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

