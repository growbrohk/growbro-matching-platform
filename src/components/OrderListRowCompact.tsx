import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export interface OrderListRowCompactProps {
  name: string;
  createdAtLabel: string;
  imageUrl: string | null;
  priceLabel: string;
  onDetails: () => void;
  onConfirm?: () => void;
  showConfirm: boolean;
  orderId: string;
}

/**
 * OrderListRowCompact - Compact row layout for order lists
 * Matches the new design spec: image + title/subtitle | price | details + confirm
 */
export function OrderListRowCompact({
  name,
  createdAtLabel,
  imageUrl,
  priceLabel,
  onDetails,
  onConfirm,
  showConfirm,
  orderId,
}: OrderListRowCompactProps) {
  const [imageError, setImageError] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (isConfirming || !onConfirm) return;

    setIsConfirming(true);
    try {
      const { data, error } = await supabase.rpc('update_order_fulfillment', {
        p_order_id: orderId,
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

      onConfirm?.();
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

  const showImage = imageUrl && !imageError;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-200">
      {/* LEFT BLOCK: Image + Title + Subtitle */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {showImage ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-12 h-12 rounded bg-gray-200 flex-shrink-0 object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-12 h-12 rounded bg-gray-200 flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate" style={{ color: '#0F1F17' }}>
            {name}
          </div>
          <div className="text-xs truncate" style={{ color: 'rgba(15,31,23,0.6)' }}>
            {createdAtLabel}
          </div>
        </div>
      </div>

      {/* MIDDLE: Price */}
      <div className="flex-shrink-0 whitespace-nowrap font-medium text-sm" style={{ color: '#0F1F17' }}>
        {priceLabel}
      </div>

      {/* RIGHT BLOCK: Details + Confirm */}
      <div className="flex items-center justify-end gap-4 flex-shrink-0 pl-4 whitespace-nowrap">
        <button
          onClick={onDetails}
          className="text-sm hover:underline"
          style={{ color: '#0F1F17', textDecoration: 'underline' }}
        >
          details
        </button>
        {showConfirm && (
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="text-sm hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            style={{ color: '#0F1F17', textDecoration: 'underline' }}
          >
            {isConfirming ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                confirming...
              </>
            ) : (
              'confirm'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
