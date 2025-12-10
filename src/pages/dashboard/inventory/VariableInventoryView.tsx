import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Edit2, Check, X, Plus } from 'lucide-react';
import { ProductWithInventory } from './Inventory';
import { InventoryLocation } from './Inventory';
import { ProductVariation } from '@/lib/types/variable-products';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface VariableInventoryViewProps {
  products: ProductWithInventory[];
  locations: InventoryLocation[];
  selectedWarehouses: Set<string>;
  onUpdateStock: (productId: string, locationId: string, quantity: number, variationId?: string) => void;
  saving: string | null;
  editMode: Record<string, { editing: boolean; tempValue: number }>;
  onStartEdit: (key: string, currentValue: number) => void;
  onCancelEdit: (key: string) => void;
  onConfirmEdit: (key: string, productId: string, locationId: string, variationId?: string) => void;
  productVariations: Record<string, ProductVariation[]>;
  variationInventory: Record<string, Record<string, number>>; // {variationId: {locationId: stock}}
  expandedProducts: Set<string>;
  expandedColors: Set<string>;
  onToggleExpansion: (productId: string) => void;
  onToggleColorExpansion: (productId: string, color: string) => void;
  isGlobalEditMode: boolean;
  onStockValueChange: (key: string, value: number) => void;
}

export function VariableInventoryView({
  products,
  locations,
  selectedWarehouses,
  onUpdateStock,
  saving,
  editMode,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  productVariations,
  variationInventory,
  expandedProducts,
  expandedColors,
  onToggleExpansion,
  onToggleColorExpansion,
  isGlobalEditMode,
  onStockValueChange,
}: VariableInventoryViewProps) {
  // Filter warehouses to only show selected ones
  const warehouses = locations.filter((loc) => loc.type === 'warehouse' && selectedWarehouses.has(loc.id));

  // Group variations by color
  const groupVariationsByColor = (variations: ProductVariation[]) => {
    const grouped: Record<string, ProductVariation[]> = {};
    variations.forEach((variation) => {
      const colorKey = variation.attributes['color'] || variation.attributes['Color'] || 'Other';
      if (!grouped[colorKey]) {
        grouped[colorKey] = [];
      }
      grouped[colorKey].push(variation);
    });
    return grouped;
  };

  const getSizeFromVariation = (variation: ProductVariation): string => {
    return variation.attributes['size'] || 
           variation.attributes['Size'] || 
           variation.attributes['SIZE'] ||
           Object.values(variation.attributes).find((val) => {
             const color = variation.attributes['color'] || variation.attributes['Color'];
             return val !== color;
           }) || 'N/A';
  };

  if (products.length === 0) {
    return (
      <div className="text-center py-8 md:py-12">
        <p className="text-sm md:text-base text-muted-foreground">No variable products with inventory yet</p>
      </div>
    );
  }

  if (selectedWarehouses.size === 0 || warehouses.length === 0) {
    return (
      <div className="text-center py-8 md:py-12">
        <p className="text-sm md:text-base text-muted-foreground">Please select at least one warehouse</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs md:text-sm w-[80px] md:w-[100px]">Category</TableHead>
              <TableHead className="text-xs md:text-sm min-w-[120px] md:min-w-[150px]">Product</TableHead>
              <TableHead className="text-xs md:text-sm w-[80px] md:w-[100px]">Variation</TableHead>
              <TableHead className="text-xs md:text-sm w-[80px] md:w-[100px]">Size</TableHead>
              {warehouses.map((warehouse) => (
                <TableHead key={warehouse.id} className="text-xs md:text-sm text-center w-[100px] md:w-[120px]">
                  {warehouse.name}
                </TableHead>
              ))}
              <TableHead className="text-xs md:text-sm text-center w-[80px] md:w-[100px]">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const variations = productVariations[product.id] || [];
              const isProductExpanded = expandedProducts.has(product.id);
              const groupedByColor = groupVariationsByColor(variations);

              // Calculate total stock for all variations
              let productTotal = 0;
              variations.forEach((variation) => {
                warehouses.forEach((warehouse) => {
                  productTotal += variationInventory[variation.id]?.[warehouse.id] || 0;
                });
              });

              return (
                <>
                  {/* Product Row - Shows total of all variations */}
                  <TableRow key={product.id} className="border-b bg-muted/30">
                    <TableCell className="text-xs md:text-sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleExpansion(product.id)}
                        className="h-5 w-5 md:h-6 md:w-6 p-0"
                      >
                        {isProductExpanded ? (
                          <ChevronDown className="h-3 w-3 md:h-4 md:w-4" />
                        ) : (
                          <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-xs md:text-sm font-medium">{product.name}</TableCell>
                    <TableCell className="text-xs md:text-sm">Total</TableCell>
                    <TableCell className="text-xs md:text-sm">-</TableCell>
                    {warehouses.map((warehouse) => {
                      // Calculate total for this warehouse across all variations
                      let warehouseTotal = 0;
                      variations.forEach((variation) => {
                        warehouseTotal += variationInventory[variation.id]?.[warehouse.id] || 0;
                      });
                      return (
                        <TableCell key={warehouse.id} className="text-center text-xs md:text-sm">
                          {warehouseTotal}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center text-xs md:text-sm font-semibold">{productTotal}</TableCell>
                  </TableRow>

                  {/* Color Rows - Expandable */}
                  {isProductExpanded && Object.entries(groupedByColor).map(([color, colorVariations]) => {
                    const colorKey = `${product.id}-${color}`;
                    const isColorExpanded = expandedColors.has(colorKey);

                    // Calculate totals for this color
                    let colorTotal = 0;
                    colorVariations.forEach((variation) => {
                      warehouses.forEach((warehouse) => {
                        colorTotal += variationInventory[variation.id]?.[warehouse.id] || 0;
                      });
                    });

                    return (
                      <>
                        {/* Color Row */}
                        <TableRow key={colorKey} className="border-b bg-muted/10">
                          <TableCell className="text-xs md:text-sm"></TableCell>
                          <TableCell className="text-xs md:text-sm"></TableCell>
                          <TableCell className="text-xs md:text-sm">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onToggleColorExpansion(product.id, color)}
                              className="h-5 w-5 md:h-6 md:w-6 p-0"
                            >
                              {isColorExpanded ? (
                                <ChevronDown className="h-3 w-3 md:h-4 md:w-4" />
                              ) : (
                                <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="text-xs md:text-sm font-medium capitalize">{color}</TableCell>
                          {warehouses.map((warehouse) => {
                            // Calculate total for this color in this warehouse
                            let colorWarehouseTotal = 0;
                            colorVariations.forEach((variation) => {
                              colorWarehouseTotal += variationInventory[variation.id]?.[warehouse.id] || 0;
                            });
                            return (
                              <TableCell key={warehouse.id} className="text-center text-xs md:text-sm">
                                {colorWarehouseTotal}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center text-xs md:text-sm font-semibold">{colorTotal}</TableCell>
                        </TableRow>

                        {/* Size Rows - Under each color */}
                        {isColorExpanded && colorVariations.map((variation) => {
                          const size = getSizeFromVariation(variation);
                          let sizeTotal = 0;
                          warehouses.forEach((warehouse) => {
                            sizeTotal += variationInventory[variation.id]?.[warehouse.id] || 0;
                          });

                          return (
                            <TableRow key={variation.id} className="border-b">
                              <TableCell className="text-xs md:text-sm"></TableCell>
                              <TableCell className="text-xs md:text-sm"></TableCell>
                              <TableCell className="text-xs md:text-sm"></TableCell>
                              <TableCell className="text-xs md:text-sm pl-4 md:pl-6">{size}</TableCell>
                              {warehouses.map((warehouse) => {
                                const key = `${variation.id}-${warehouse.id}`;
                                const stock = variationInventory[variation.id]?.[warehouse.id] || 0;
                                const isEditing = editMode[key]?.editing || false;
                                const tempValue = editMode[key]?.tempValue ?? stock;

                                return (
                                  <TableCell key={warehouse.id} className="text-center p-1 md:p-2">
                                    {isEditing ? (
                                      <div className="flex items-center justify-center gap-1">
                                        <Input
                                          type="number"
                                          value={tempValue}
                                          onChange={(e) => {
                                            const newValue = parseInt(e.target.value) || 0;
                                            onStartEdit(key, newValue);
                                          }}
                                          className="w-12 md:w-16 h-6 md:h-8 text-xs md:text-sm text-center"
                                          disabled={saving === key}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              onConfirmEdit(key, product.id, warehouse.id, variation.id);
                                            } else if (e.key === 'Escape') {
                                              onCancelEdit(key);
                                            }
                                          }}
                                          autoFocus
                                        />
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onConfirmEdit(key, product.id, warehouse.id, variation.id);
                                          }}
                                          disabled={saving === key}
                                          className="h-5 w-5 md:h-6 md:w-6 p-0"
                                        >
                                          <Check className="h-3 w-3 md:h-4 md:w-4 text-green-600" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onCancelEdit(key);
                                          }}
                                          disabled={saving === key}
                                          className="h-5 w-5 md:h-6 md:w-6 p-0"
                                        >
                                          <X className="h-3 w-3 md:h-4 md:w-4 text-red-600" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-1">
                                        <span className="text-xs md:text-sm">{stock}</span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onStartEdit(key, stock);
                                          }}
                                          className="h-5 w-5 md:h-6 md:w-6 p-0"
                                        >
                                          <Edit2 className="h-3 w-3 md:h-4 md:w-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-center text-xs md:text-sm font-semibold">{sizeTotal}</TableCell>
                            </TableRow>
                          );
                        })}
                      </>
                    );
                  })}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
