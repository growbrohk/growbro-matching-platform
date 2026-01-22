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
type QrCodeFilter = 'all' | 'with' | 'without';
type StatusFilter = 'all' | 'active' | 'inactive';

interface ChannelsFilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collabPartnerFilter: CollabPartnerFilter;
  qrCodeFilter: QrCodeFilter;
  statusFilter: StatusFilter;
  onApply: (collabPartner: CollabPartnerFilter, qrCode: QrCodeFilter, status: StatusFilter) => void;
}

export function ChannelsFilterDrawer({
  open,
  onOpenChange,
  collabPartnerFilter,
  qrCodeFilter,
  statusFilter,
  onApply,
}: ChannelsFilterDrawerProps) {
  // Draft state for filters (local to drawer)
  const [draftCollabPartner, setDraftCollabPartner] = useState<CollabPartnerFilter>(collabPartnerFilter);
  const [draftQrCode, setDraftQrCode] = useState<QrCodeFilter>(qrCodeFilter);
  const [draftStatus, setDraftStatus] = useState<StatusFilter>(statusFilter);

  // Reset draft state when drawer opens or when props change
  useEffect(() => {
    if (open) {
      setDraftCollabPartner(collabPartnerFilter);
      setDraftQrCode(qrCodeFilter);
      setDraftStatus(statusFilter);
    }
  }, [open, collabPartnerFilter, qrCodeFilter, statusFilter]);

  const handleReset = () => {
    setDraftCollabPartner('all');
    setDraftQrCode('all');
    setDraftStatus('all');
  };

  const handleApply = () => {
    onApply(draftCollabPartner, draftQrCode, draftStatus);
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

          {/* QR Code Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: '#0F1F17' }}>
              QR Code
            </label>
            <Select
              value={draftQrCode}
              onValueChange={(value) => setDraftQrCode(value as QrCodeFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="QR Code" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="with">With QR Code</SelectItem>
                <SelectItem value="without">Without QR Code</SelectItem>
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
