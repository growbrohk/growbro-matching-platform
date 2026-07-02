import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateOrderQueries } from '@/lib/queryInvalidation';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const TEXT = '#0F1F17';
const MUTED = 'rgba(15,31,23,0.6)';

export function ProductOrderDispatchPanel({
  orderId,
  addonItemId,
  shippedAt,
  carrierTrackingNumber,
  paymentStatus,
  fulfillmentStatus,
  canEdit,
}: {
  orderId: string;
  /** When set, dispatch applies to a single event add-on line instead of the whole product order. */
  addonItemId?: string;
  shippedAt: string | null | undefined;
  carrierTrackingNumber: string | null | undefined;
  paymentStatus: string;
  fulfillmentStatus: string | null | undefined;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [trackingDraft, setTrackingDraft] = useState(carrierTrackingNumber ?? '');
  const [savingTracking, setSavingTracking] = useState(false);
  const [togglingShipped, setTogglingShipped] = useState(false);

  useEffect(() => {
    setTrackingDraft(carrierTrackingNumber ?? '');
  }, [carrierTrackingNumber]);

  const paymentConfirmed =
    paymentStatus === 'paid' || fulfillmentStatus === 'confirmed';

  if (!paymentConfirmed) {
    return (
      <p className="text-xs pt-1" style={{ color: MUTED }}>
        Dispatch (mark sent and carrier tracking) is available after payment is confirmed.
      </p>
    );
  }

  if (!canEdit) {
    return (
      <div className="pt-1 space-y-1 text-sm border-t border-gray-100 mt-2" style={{ color: TEXT }}>
        {shippedAt ? (
          <p>
            <span style={{ color: MUTED }}>Sent </span>
            {format(new Date(shippedAt), 'MMM d, yyyy h:mm a')}
          </p>
        ) : (
          <p style={{ color: MUTED }}>Not marked sent</p>
        )}
        {carrierTrackingNumber ? (
          <p>
            <span style={{ color: MUTED }}>Tracking </span>
            {carrierTrackingNumber}
          </p>
        ) : null}
      </div>
    );
  }

  const onToggleShipped = async (next: boolean) => {
    if (togglingShipped) return;
    setTogglingShipped(true);
    try {
      const { data: ok, error } = addonItemId
        ? await supabase.rpc('set_addon_item_shipped', {
            p_addon_item_id: addonItemId,
            p_shipped: next,
          })
        : await supabase.rpc('set_order_shipped', {
            p_order_id: orderId,
            p_shipped: next,
          });
      if (error) throw error;
      if (ok !== true) throw new Error('Could not update sent status');
      toast({ title: next ? 'Marked as sent' : 'Sent status cleared' });
      await invalidateOrderQueries(queryClient, orderId);
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Update failed',
        variant: 'destructive',
      });
    } finally {
      setTogglingShipped(false);
    }
  };

  const saveTracking = async () => {
    if (savingTracking) return;
    setSavingTracking(true);
    try {
      const { data: ok, error } = addonItemId
        ? await supabase.rpc('set_addon_item_carrier_tracking', {
            p_addon_item_id: addonItemId,
            p_carrier_tracking_number: trackingDraft.trim() || null,
          })
        : await supabase.rpc('set_order_carrier_tracking', {
            p_order_id: orderId,
            p_carrier_tracking_number: trackingDraft.trim() || null,
          });
      if (error) throw error;
      if (ok !== true) throw new Error('Could not save tracking');
      toast({ title: 'Tracking saved' });
      await invalidateOrderQueries(queryClient, orderId);
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSavingTracking(false);
    }
  };

  return (
    <div className="pt-2 space-y-3 border-t border-gray-100 mt-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 accent-gray-800 rounded border-gray-300"
          checked={!!shippedAt}
          disabled={togglingShipped}
          onChange={(e) => void onToggleShipped(e.target.checked)}
        />
        <span className="text-sm" style={{ color: TEXT }}>
          {togglingShipped ? 'Updating…' : 'Marked as sent / dispatched'}
        </span>
      </label>
      <div className="space-y-1.5">
        <span className="text-xs uppercase tracking-wide block" style={{ color: MUTED }}>
          Carrier / tracking no.
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={trackingDraft}
            onChange={(e) => setTrackingDraft(e.target.value)}
            placeholder="e.g. SF Express number"
            className="text-sm flex-1"
            disabled={savingTracking}
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => void saveTracking()} disabled={savingTracking}>
            {savingTracking ? 'Saving…' : 'Save tracking'}
          </Button>
        </div>
      </div>
    </div>
  );
}
