import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, SlidersHorizontal, Settings, Pencil, Plus, X, Save, ShoppingCart } from 'lucide-react';
import { MultiSelectDropdown } from './MultiSelectDropdown';

type Warehouse = {
  id: string;
  name: string;
};

type ProductCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export interface ProductsToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterOpen: boolean;
  setFilterOpen: (open: boolean) => void;
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  setSelectedWarehouseId: (id: string) => void;
  categoryOptions: Array<{ id: string; name: string; count: number }>;
  selectedCategoryIds: string[];
  setSelectedCategoryIds: (ids: string[]) => void;
  rank1: string;
  rank1Options: string[];
  selectedRank1Values: string[];
  setSelectedRank1Values: (values: string[]) => void;
  rank2: string;
  rank2Options: string[];
  selectedRank2Values: string[];
  setSelectedRank2Values: (values: string[]) => void;
  bulkMode: 'none' | 'correction' | 'restock' | 'transfer';
  isBulkEdit: boolean;
  isSaving: boolean;
  pendingEdits: Record<string, { stock?: number; price?: number }>;
  restockEdits: Record<string, number>;
  transferEdits: Record<string, number>;
  transferFromWarehouseId: string;
  transferToWarehouseId: string;
  canCreate: boolean;
  showEditCta: boolean;
  setShowEditCta: (show: boolean) => void;
  onSettingsClick: () => void;
  onBulkModePickerClick: () => void;
  onAddProductClick: () => void;
  onExitBulkMode: () => void;
  onSaveBulkEdit: () => void;
  onSaveRestock: () => void;
  onSaveTransfer: () => void;
  onTransferSetupClick: () => void;
  isPosMode?: boolean;
  cartItemCount?: number;
  onCartClick?: () => void;
}

export function ProductsToolbar({
  searchQuery,
  setSearchQuery,
  filterOpen,
  setFilterOpen,
  warehouses,
  selectedWarehouseId,
  setSelectedWarehouseId,
  categoryOptions,
  selectedCategoryIds,
  setSelectedCategoryIds,
  rank1,
  rank1Options,
  selectedRank1Values,
  setSelectedRank1Values,
  rank2,
  rank2Options,
  selectedRank2Values,
  setSelectedRank2Values,
  bulkMode,
  isBulkEdit,
  isSaving,
  pendingEdits,
  restockEdits,
  transferEdits,
  transferFromWarehouseId,
  transferToWarehouseId,
  canCreate,
  showEditCta,
  setShowEditCta,
  onSettingsClick,
  onBulkModePickerClick,
  onAddProductClick,
  onExitBulkMode,
  onSaveBulkEdit,
  onSaveRestock,
  onSaveTransfer,
  onTransferSetupClick,
  isPosMode = false,
  cartItemCount = 0,
  onCartClick,
}: ProductsToolbarProps) {
  return (
    <>
      {/* Toolbar: Search + Edit + Add Product */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-10 h-9"
          />
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
              >
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {/* Row 1: Warehouse */}
                <div className="space-y-2">
                  <div className="font-semibold text-sm">Warehouse</div>
                  <Select
                    value={selectedWarehouseId}
                    onValueChange={setSelectedWarehouseId}
                    disabled={warehouses.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={warehouses.length === 0 ? "No warehouses" : "Select warehouse"} />
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

                {/* Row 2: Category */}
                <MultiSelectDropdown
                  label="Category"
                  options={categoryOptions.map(opt => ({
                    value: opt.id,
                    label: opt.name,
                    count: opt.count,
                  }))}
                  selected={selectedCategoryIds}
                  setSelected={setSelectedCategoryIds}
                  placeholder="Select categories"
                  isCategory={true}
                />

                {/* Row 3: Variant Filter (rank1) */}
                {rank1 && rank1Options.length > 0 && (
                  <MultiSelectDropdown
                    label={rank1}
                    options={rank1Options.map(opt => ({
                      value: opt,
                      label: opt,
                    }))}
                    selected={selectedRank1Values}
                    setSelected={setSelectedRank1Values}
                    placeholder={`Select ${rank1.toLowerCase()}`}
                  />
                )}

                {/* Row 4: Variant Filter (rank2) */}
                {rank2 && rank2Options.length > 0 && (
                  <MultiSelectDropdown
                    label={rank2}
                    options={rank2Options.map(opt => ({
                      value: opt,
                      label: opt,
                    }))}
                    selected={selectedRank2Values}
                    setSelected={setSelectedRank2Values}
                    placeholder={`Select ${rank2.toLowerCase()}`}
                  />
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      // Reset warehouse to default (prefer "Main" else first)
                      if (warehouses.length > 0) {
                        const mainWh = warehouses.find(w => w.name.toLowerCase().includes('main')) || warehouses[0];
                        setSelectedWarehouseId(mainWh.id);
                      }
                      setSelectedCategoryIds([]);
                      setSelectedRank1Values([]);
                      setSelectedRank2Values([]);
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    className="flex-1"
                    style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                    onClick={() => setFilterOpen(false)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
          {bulkMode === 'none' ? (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={onSettingsClick}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Product settings"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Settings</span>
              </Button>
              {!isPosMode && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onBulkModePickerClick}
                  className="h-9 w-9 sm:w-auto sm:px-3"
                  title="Bulk edit products"
                  disabled={!selectedWarehouseId}
                >
                  <Pencil className="h-4 w-4" />
                  <span className="hidden sm:inline sm:ml-2">Bulk Edit</span>
                </Button>
              )}

              {isPosMode ? (
                <Button
                  onClick={onCartClick}
                  style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                  size="icon"
                  className="h-9 w-9 sm:w-auto sm:px-3 relative"
                  title="Open cart"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {cartItemCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#fff', color: '#0E7A3A' }}>
                      {cartItemCount}
                    </span>
                  )}
                  <span className="hidden sm:inline sm:ml-2">Cart</span>
                </Button>
              ) : (
                <Button
                  onClick={onAddProductClick}
                  disabled={!canCreate}
                  style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                  size="icon"
                  className="h-9 w-9 sm:w-auto sm:px-3"
                  title="Add new product"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline sm:ml-2">Add Product</span>
                </Button>
              )}
            </>
          ) : bulkMode === 'correction' ? (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={onExitBulkMode}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Cancel bulk edit"
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Cancel</span>
              </Button>

              <Button
                onClick={onSaveBulkEdit}
                disabled={isSaving || Object.keys(pendingEdits).length === 0}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                size="icon"
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Save changes"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">{isSaving ? 'Saving...' : 'Save'}</span>
              </Button>
            </>
          ) : bulkMode === 'restock' ? (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={onExitBulkMode}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Cancel restock"
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Cancel</span>
              </Button>

              <Button
                onClick={onSaveRestock}
                disabled={isSaving || !Object.values(restockEdits).some(qty => qty > 0)}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                size="icon"
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Save restock"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">{isSaving ? 'Saving...' : 'Save Restock'}</span>
              </Button>
            </>
          ) : bulkMode === 'transfer' ? (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={onExitBulkMode}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Cancel transfer"
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Cancel</span>
              </Button>

              <Button
                onClick={onSaveTransfer}
                disabled={isSaving || !transferFromWarehouseId || !transferToWarehouseId || transferFromWarehouseId === transferToWarehouseId || !Object.values(transferEdits).some(qty => qty > 0)}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                size="icon"
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Save transfer"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">{isSaving ? 'Saving...' : 'Transfer'}</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Edit-state CTA (only in correction mode) */}
      {isBulkEdit && bulkMode === 'correction' && showEditCta && (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div
              className="inline-flex items-center rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: 'rgba(14,122,58,0.20)',
                backgroundColor: 'rgba(251,248,244,0.95)',
              }}
            >
              <span className="truncate">
                Editing mode — tap a stock cell to update
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 shrink-0"
            onClick={() => setShowEditCta(false)}
          >
            Got it
          </Button>
        </div>
      )}

      {/* Transfer Summary Row */}
      {bulkMode === 'transfer' && (
        <div className="flex items-center gap-2 px-1 sm:px-0">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                 style={{ borderColor:'rgba(14,122,58,0.20)', backgroundColor:'rgba(251,248,244,0.9)' }}>
              <span className="truncate">
                {warehouses.find(w => w.id === transferFromWarehouseId)?.name || 'Unknown'} → {warehouses.find(w => w.id === transferToWarehouseId)?.name || 'Unknown'}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 h-8"
            onClick={onTransferSetupClick}
          >
            Edit
          </Button>
        </div>
      )}
    </>
  );
}
