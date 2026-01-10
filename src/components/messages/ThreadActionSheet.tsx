import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ThreadActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otherOrgId: string;
  otherOrgSlug: string | null;
}

export default function ThreadActionSheet({ open, onOpenChange, otherOrgId, otherOrgSlug }: ThreadActionSheetProps) {
  const navigate = useNavigate();

  const handleViewProfile = () => {
    onOpenChange(false);
    if (otherOrgSlug) {
      navigate(`/profile/${otherOrgSlug}`);
    } else {
      // Fallback: could navigate to a profile page by ID if needed
      toast.info('Profile slug not available');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-left">Options</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start h-14 rounded-2xl text-base font-normal text-blue-600"
            onClick={handleViewProfile}
            style={{ backgroundColor: 'rgba(15,31,23,0.05)' }}
          >
            View Profile
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

