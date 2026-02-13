import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number | null;
  active: boolean;
};

type InventoryItem = {
  id: string;
  variant_id: string;
  warehouse_id: string;
  quantity: number;
};

// Component for rendering Excel-style variant combinations table (read-only or editable)
export interface VariantCombinationsTableProps {
  variants: ProductVariant[];
  inventoryItems: InventoryItem[];
  getVariantQuantity: (variantId: string, inventoryItems: InventoryItem[]) => number;
  basePrice: number | null;
  bulkMode?: 'none' | 'correction' | 'restock' | 'transfer';
  isBulkEdit?: boolean;
  selectedWarehouseId?: string;
  pendingEdits?: Record<string, { stock?: number; price?: number }>;
  setPendingEdits?: React.Dispatch<React.SetStateAction<Record<string, { stock?: number; price?: number }>>>;
  getCurrentStock?: (variantId: string, warehouseId: string) => number;
  getCurrentPrice?: (variantId: string) => number;
  restockEdits?: Record<string, number>;
  setRestockEdits?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  transferEdits?: Record<string, number>;
  setTransferEdits?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  transferFromWarehouseId?: string;
  transferToWarehouseId?: string;
  onBeginEditing?: () => void;
}

export function VariantCombinationsTable({
  variants,
  inventoryItems,
  getVariantQuantity,
  basePrice,
  bulkMode = 'none',
  isBulkEdit = false,
  selectedWarehouseId = '',
  pendingEdits = {},
  setPendingEdits,
  getCurrentStock,
  getCurrentPrice,
  restockEdits = {},
  setRestockEdits,
  transferEdits = {},
  setTransferEdits,
  transferFromWarehouseId = '',
  transferToWarehouseId = '',
  onBeginEditing,
}: VariantCombinationsTableProps) {
  // Helper function to format variant name by removing option type labels
  const formatVariantName = (variantName: string): string => {
    return variantName
      .split('/')
      .map(segment => {
        const colonIndex = segment.indexOf(':');
        if (colonIndex === -1) {
          return segment.trim();
        }
        return segment.substring(colonIndex + 1).trim();
      })
      .join(' / ');
  };

  if (variants.length === 0) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        No variants available
      </div>
    );
  }

  const isRestockMode = bulkMode === 'restock';
  const isTransferMode = bulkMode === 'transfer';
  const isCorrectionMode = bulkMode === 'correction' || isBulkEdit;

  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="bg-muted/50 border-t">
            <th className="sticky top-0 z-10 bg-muted/50 p-0 border text-[11px] w-[88px]">Variant</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[48px]">Stock</th>
            {isRestockMode && (
              <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[56px]">Restock</th>
            )}
            {isTransferMode && (
              <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[56px]">Transfer</th>
            )}
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[56px]">Price</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 border text-[11px] w-[96px]">SKU</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-center text-muted-foreground w-[40px]">Active</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant, idx) => {
            const stockKey = `${variant.id}:${selectedWarehouseId}`;
            const priceKey = `${variant.id}`;
            
            // Get display values - use pending edits if available, otherwise current values
            const stock = isBulkEdit && pendingEdits[stockKey]?.stock !== undefined
              ? pendingEdits[stockKey].stock!
              : getVariantQuantity(variant.id, inventoryItems);
            
            const price = isBulkEdit && pendingEdits[priceKey]?.price !== undefined
              ? pendingEdits[priceKey].price!
              : (variant.price ?? basePrice ?? 0);
            
            const handleStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!setPendingEdits || !selectedWarehouseId) return;
              
              const inputValue = e.target.value;
              // Allow empty string while typing, convert to 0 for storage
              if (inputValue === '') {
                setPendingEdits(prev => ({
                  ...prev,
                  [stockKey]: {
                    ...prev[stockKey],
                    stock: 0,
                  },
                }));
              } else {
                const value = parseFloat(inputValue);
                const numValue = isNaN(value) ? 0 : Math.max(0, value);
                setPendingEdits(prev => ({
                  ...prev,
                  [stockKey]: {
                    ...prev[stockKey],
                    stock: numValue,
                  },
                }));
              }
            };

            const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!setPendingEdits) return;
              
              const inputValue = e.target.value;
              // Allow empty string while typing, convert to 0 for storage
              if (inputValue === '') {
                setPendingEdits(prev => ({
                  ...prev,
                  [priceKey]: {
                    ...prev[priceKey],
                    price: 0,
                  },
                }));
              } else {
                const value = parseFloat(inputValue);
                const numValue = isNaN(value) ? 0 : Math.max(0, value);
                setPendingEdits(prev => ({
                  ...prev,
                  [priceKey]: {
                    ...prev[priceKey],
                    price: numValue,
                  },
                }));
              }
            };

            const handleRestockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!setRestockEdits) return;
              
              const inputValue = e.target.value;
              // Allow empty string while typing, convert to 0 for storage
              if (inputValue === '') {
                setRestockEdits(prev => ({
                  ...prev,
                  [variant.id]: 0,
                }));
              } else {
                const value = parseFloat(inputValue);
                const numValue = isNaN(value) ? 0 : Math.max(0, value);
                setRestockEdits(prev => ({
                  ...prev,
                  [variant.id]: numValue,
                }));
              }
            };
            
            const handleTransferChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!setTransferEdits || !transferFromWarehouseId || !getCurrentStock) return;
              
              const inputValue = e.target.value;
              const fromStock = getCurrentStock(variant.id, transferFromWarehouseId);
              
              // Allow empty string while typing, convert to 0 for storage
              if (inputValue === '') {
                setTransferEdits(prev => ({
                  ...prev,
                  [variant.id]: 0,
                }));
              } else {
                const value = parseFloat(inputValue);
                const numValue = isNaN(value) ? 0 : Math.max(0, Math.min(value, fromStock)); // Clamp to max available
                setTransferEdits(prev => ({
                  ...prev,
                  [variant.id]: numValue,
                }));
              }
            };
            
            return (
              <tr key={variant.id} className="border-t hover:bg-muted/30 even:bg-muted/10">
                <td className="p-0 border w-[88px]">
                  <span className="block px-1 py-0 text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {formatVariantName(variant.name)}
                  </span>
                </td>
                <td className="p-0 border w-[48px]">
                  {isCorrectionMode && selectedWarehouseId ? (
                    <Input
                      type="number"
                      min="0"
                      value={pendingEdits[stockKey]?.stock !== undefined ? pendingEdits[stockKey].stock! : stock}
                      onChange={handleStockChange}
                      onFocus={onBeginEditing}
                      onClick={onBeginEditing}
                      className="h-6 px-1 py-0 text-xs border-0 rounded-none focus-visible:ring-1 focus-visible:ring-offset-0"
                    />
                  ) : (
                    <span className="block px-1 py-0 text-xs leading-tight">
                      {stock}
                    </span>
                  )}
                </td>
                {isRestockMode && (
                  <td className="p-0 border w-[56px]">
                    <Input
                      type="number"
                      min="0"
                      value={restockEdits[variant.id] !== undefined && restockEdits[variant.id] !== 0 ? restockEdits[variant.id] : ''}
                      onChange={handleRestockChange}
                      placeholder="0"
                      className="h-6 px-1 py-0 text-xs border-0 rounded-none focus-visible:ring-1 focus-visible:ring-offset-0"
                    />
                  </td>
                )}
                {isTransferMode && (
                  <td className="p-0 border w-[56px]">
                    <Input
                      type="number"
                      min="0"
                      max={transferFromWarehouseId && getCurrentStock ? getCurrentStock(variant.id, transferFromWarehouseId) : undefined}
                      value={transferEdits[variant.id] !== undefined && transferEdits[variant.id] !== 0 ? transferEdits[variant.id] : ''}
                      onChange={handleTransferChange}
                      placeholder="0"
                      className="h-6 px-1 py-0 text-xs border-0 rounded-none focus-visible:ring-1 focus-visible:ring-offset-0"
                    />
                  </td>
                )}
                <td className="p-0 border w-[56px]">
                  {isCorrectionMode && !isTransferMode ? (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pendingEdits[priceKey]?.price !== undefined ? pendingEdits[priceKey].price! : price}
                      onChange={handlePriceChange}
                      onFocus={onBeginEditing}
                      onClick={onBeginEditing}
                      className="h-6 px-1 py-0 text-xs border-0 rounded-none focus-visible:ring-1 focus-visible:ring-offset-0"
                    />
                  ) : (
                    <span className="block px-1 py-0 text-xs leading-tight">
                      {price.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="p-0 border w-[96px]">
                  <span className="block px-1 py-0 text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {variant.sku || '-'}
                  </span>
                </td>
                <td className="p-0 border w-[40px]">
                  <div className="flex items-center justify-center py-0.5">
                    {variant.active ? (
                      <Badge variant="default" className="text-[10px] px-1 py-0 h-4">On</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Off</Badge>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
