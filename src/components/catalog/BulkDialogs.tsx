import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type Warehouse = {
  id: string;
  name: string;
};

type Product = {
  id: string;
};

export interface BulkDialogsProps {
  // Bulk Mode Picker Dialog
  isBulkModeDialogOpen: boolean;
  setIsBulkModeDialogOpen: (open: boolean) => void;
  onEnterBulkEdit: () => void;
  onEnterRestock: () => void;
  onEnterTransfer: () => void;

  // Transfer Setup Dialog
  isTransferSetupOpen: boolean;
  setIsTransferSetupOpen: (open: boolean) => void;
  warehouses: Warehouse[];
  transferFromWarehouseId: string;
  setTransferFromWarehouseId: (id: string) => void;
  transferToWarehouseId: string;
  setTransferToWarehouseId: (id: string) => void;
  transferReferenceNote: string;
  setTransferReferenceNote: (note: string) => void;
  bulkMode: 'none' | 'correction' | 'restock' | 'transfer';
  setBulkMode: (mode: 'none' | 'correction' | 'restock' | 'transfer') => void;
  onConfirmTransferSetup: () => void;

  // Product Settings Dialog
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  defaultView: 'list' | 'group';
  setDefaultView: (view: 'list' | 'group') => void;
  defaultExpand: 'collapsed' | 'expanded';
  setDefaultExpand: (expand: 'collapsed' | 'expanded') => void;
  currentOrgId: string | undefined;
  products: Product[];
  setExpandedProducts: (products: Set<string>) => void;
  setExpandedRank1Groups: (groups: Set<string>) => void;
  navigate: (path: string) => void;
}

export function BulkDialogs({
  isBulkModeDialogOpen,
  setIsBulkModeDialogOpen,
  onEnterBulkEdit,
  onEnterRestock,
  onEnterTransfer,
  isTransferSetupOpen,
  setIsTransferSetupOpen,
  warehouses,
  transferFromWarehouseId,
  setTransferFromWarehouseId,
  transferToWarehouseId,
  setTransferToWarehouseId,
  transferReferenceNote,
  setTransferReferenceNote,
  bulkMode,
  setBulkMode,
  onConfirmTransferSetup,
  settingsOpen,
  setSettingsOpen,
  defaultView,
  setDefaultView,
  defaultExpand,
  setDefaultExpand,
  currentOrgId,
  products,
  setExpandedProducts,
  setExpandedRank1Groups,
  navigate,
}: BulkDialogsProps) {
  const { toast } = useToast();

  return (
    <>
      {/* Bulk Action Mode Picker Dialog */}
      <Dialog open={isBulkModeDialogOpen} onOpenChange={setIsBulkModeDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] sm:w-full max-w-[520px] max-h-[85vh] overflow-hidden p-0">
          <div className="flex flex-col max-h-[85vh]">
            <header className="px-5 pt-5 pb-3 shrink-0">
              <DialogHeader>
                <DialogTitle>Bulk Action</DialogTitle>
                <DialogDescription>
                  Choose the type of bulk action you want to perform.
                </DialogDescription>
              </DialogHeader>
            </header>
            
            <div className="px-5 pb-4 flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full text-left whitespace-normal break-words h-auto py-4"
                  onClick={() => {
                    setIsBulkModeDialogOpen(false);
                    onEnterBulkEdit();
                  }}
                >
                  <div className="text-left w-full">
                    <div className="font-semibold">Correction</div>
                    <div className="text-sm text-muted-foreground leading-snug whitespace-normal break-words">Set absolute stock + optional price updates</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full text-left whitespace-normal break-words h-auto py-4"
                  onClick={onEnterRestock}
                >
                  <div className="text-left w-full">
                    <div className="font-semibold">Restock</div>
                    <div className="text-sm text-muted-foreground leading-snug whitespace-normal break-words">Add quantities + movement reason restock</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full text-left whitespace-normal break-words h-auto py-4"
                  onClick={onEnterTransfer}
                >
                  <div className="text-left w-full">
                    <div className="font-semibold">Transfer</div>
                    <div className="text-sm text-muted-foreground leading-snug whitespace-normal break-words">Move quantities between warehouses + movement reason transfer</div>
                  </div>
                </Button>
              </div>
            </div>
            
            <footer className="px-5 pb-6 sm:pb-5 pt-3 shrink-0">
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsBulkModeDialogOpen(false)}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </DialogFooter>
            </footer>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Setup Dialog */}
      <Dialog open={isTransferSetupOpen} onOpenChange={setIsTransferSetupOpen}>
        <DialogContent className="w-[calc(100vw-24px)] sm:w-full max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Transfer Stock</DialogTitle>
            <DialogDescription>
              Select the source and destination warehouses for the transfer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-from">From warehouse *</Label>
              <Select
                value={transferFromWarehouseId}
                onValueChange={setTransferFromWarehouseId}
              >
                <SelectTrigger id="transfer-from">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(wh => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="transfer-to">To warehouse *</Label>
              <Select
                value={transferToWarehouseId}
                onValueChange={setTransferToWarehouseId}
              >
                <SelectTrigger id="transfer-to">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(wh => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="transfer-note">Reference (optional)</Label>
              <Input
                id="transfer-note"
                placeholder="e.g. Event Booth"
                value={transferReferenceNote}
                onChange={(e) => setTransferReferenceNote(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsTransferSetupOpen(false);
                // Only exit transfer mode if we're not already in transfer mode (i.e., initial setup)
                if (bulkMode !== 'transfer') {
                  setBulkMode('none');
                }
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirmTransferSetup}
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              disabled={!transferFromWarehouseId || !transferToWarehouseId || transferFromWarehouseId === transferToWarehouseId}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Product Settings</DialogTitle>
            <DialogDescription>
              Manage product display defaults and configuration options.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Management Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Management</h3>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/app/settings');
                    setSettingsOpen(false);
                    toast({
                      title: 'Warehouse Management',
                      description: 'Warehouse management is coming soon.',
                    });
                  }}
                >
                  Manage Warehouses
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/app/settings/catalog');
                    setSettingsOpen(false);
                  }}
                >
                  Manage Categories
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/app/settings/catalog');
                    setSettingsOpen(false);
                  }}
                >
                  Variant Configuration (rank1 / rank2)
                </Button>
              </div>
            </div>

            {/* Defaults Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Product Display Defaults</h3>
              
              {/* Default View */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Default view</Label>
                <RadioGroup
                  value={defaultView}
                  onValueChange={(value) => setDefaultView(value as 'list' | 'group')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="list" id="view-list" />
                    <Label htmlFor="view-list" className="font-normal cursor-pointer">List</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="group" id="view-group" />
                    <Label htmlFor="view-group" className="font-normal cursor-pointer">Group</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Default Expand Behavior */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Default expand behavior</Label>
                <RadioGroup
                  value={defaultExpand}
                  onValueChange={(value) => setDefaultExpand(value as 'collapsed' | 'expanded')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="collapsed" id="expand-collapsed" />
                    <Label htmlFor="expand-collapsed" className="font-normal cursor-pointer">Collapsed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="expanded" id="expand-expanded" />
                    <Label htmlFor="expand-expanded" className="font-normal cursor-pointer">Expanded</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (currentOrgId) {
                  localStorage.setItem(`gb:${currentOrgId}:products_default_view`, defaultView);
                  localStorage.setItem(`gb:${currentOrgId}:products_default_expand`, defaultExpand);
                  
                  // Apply expand behavior immediately
                  if (defaultExpand === 'expanded' && products.length > 0) {
                    const allProductIds = new Set(products.map(p => p.id));
                    setExpandedProducts(allProductIds);
                  } else if (defaultExpand === 'collapsed') {
                    setExpandedProducts(new Set());
                    setExpandedRank1Groups(new Set());
                  }
                  
                  toast({
                    title: 'Settings saved',
                    description: 'Product display defaults have been updated.',
                  });
                }
                setSettingsOpen(false);
              }}
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
