import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

export default function ActionSheet({ open, onOpenChange, conversationId }: ActionSheetProps) {
  const navigate = useNavigate();

  const handleOfferSpace = () => {
    onOpenChange(false);
    // Stub: navigate to offer space route
    navigate(`/offers/new?conversationId=${conversationId}`);
    toast.info('Coming soon');
  };

  const handleRequestSpace = () => {
    onOpenChange(false);
    // Stub: navigate to request space route
    navigate(`/requests/new?conversationId=${conversationId}`);
    toast.info('Coming soon');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-left">Actions</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start h-14 rounded-2xl text-base font-normal"
            onClick={handleOfferSpace}
            style={{ backgroundColor: 'rgba(15,31,23,0.05)' }}
          >
            Offer Space
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start h-14 rounded-2xl text-base font-normal"
            onClick={handleRequestSpace}
            style={{ backgroundColor: 'rgba(15,31,23,0.05)' }}
          >
            Request Space
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start h-14 rounded-2xl text-base font-normal text-blue-600"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

