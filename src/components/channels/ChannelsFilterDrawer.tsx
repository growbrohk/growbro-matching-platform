import { useState, useEffect } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

type CollabPartnerFilter = 'all' | 'without' | 'with';
type StatusFilter = 'all' | 'active' | 'inactive';

interface ChannelsFilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collabPartnerFilter: CollabPartnerFilter;
  statusFilter: StatusFilter;
  onApply: (collabPartner: CollabPartnerFilter, status: StatusFilter) => void;
}

export function ChannelsFilterDrawer({
  open,
  onOpenChange,
  collabPartnerFilter,
  statusFilter,
  onApply,
}: ChannelsFilterDrawerProps) {
  // Draft state for filters (local to drawer)
  const [draftCollabPartner, setDraftCollabPartner] = useState<CollabPartnerFilter>(collabPartnerFilter);
  const [draftStatus, setDraftStatus] = useState<StatusFilter>(statusFilter);

  // Reset draft state when drawer opens or when props change
  useEffect(() => {
    if (open) {
      setDraftCollabPartner(collabPartnerFilter);
      setDraftStatus(statusFilter);
    }
  }, [open, collabPartnerFilter, statusFilter]);

  const handleReset = () => {
    setDraftCollabPartner('all');
    setDraftStatus('all');
  };

  const handleApply = () => {
    onApply(draftCollabPartner, draftStatus);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-6">
          {/* Collab Partner Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: '#0F1F17' }}>
              Collab partner
            </label>
            <Select
              value={draftCollabPartner}
              onValueChange={(value) => setDraftCollabPartner(value as CollabPartnerFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Collab partner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="without">Without collab partner</SelectItem>
                <SelectItem value="with">With collab partner</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: '#0F1F17' }}>
              Status
            </label>
            <Select
              value={draftStatus}
              onValueChange={(value) => setDraftStatus(value as StatusFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DrawerFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            className="flex-1"
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleApply}
            className="flex-1"
          >
            Apply
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
