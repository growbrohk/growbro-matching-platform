import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HostOrderDetailContent } from '@/components/orders/HostOrderDetailView';

export interface HostOrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}

export function HostOrderDetailDialog({ open, onOpenChange, orderId }: HostOrderDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ color: '#0F1F17' }}>Order details</DialogTitle>
        </DialogHeader>
        {orderId ? <HostOrderDetailContent orderId={orderId} /> : null}
      </DialogContent>
    </Dialog>
  );
}
