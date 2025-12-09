import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Warehouse, ChevronDown, ChevronRight, Edit2, Check, X } from 'lucide-react';
import { ProductWithInventory } from './Inventory';
import { InventoryLocation } from './Inventory';
import { ProductVariation } from '@/lib/types/variable-products';

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

  return (
    <div className="space-y-3 md:space-y-6">
      {products.map((product) => {
        const variations = productVariations[product.id] || [];
        const isExpanded = expandedProducts.has(product.id);

        return (
          <Card key={product.id}>
            <CardHeader className="p-3 md:p-6">
              <div className="flex items-center gap-2 md:gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleExpansion(product.id)}
                  className="h-5 w-5 md:h-6 md:w-6 p-0 flex-shrink-0"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 md:h-4 md:w-4" />
                  ) : (
                    <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                  )}
                </Button>
                {product.thumbnail_url ? (
                  <img
                    src={product.thumbnail_url}
                    alt={product.name}
                    className="w-8 h-8 md:w-12 md:h-12 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 md:w-12 md:h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm md:text-lg truncate">{product.name}</CardTitle>
                </div>
              </div>
            </CardHeader>
            {isExpanded && variations.length > 0 && (
              <CardContent className="p-3 md:p-6 pt-0">
                <div className="space-y-2 md:space-y-4">
                  <h4 className="font-medium text-xs md:text-sm mb-2 md:mb-3">Variations</h4>
                  {Object.entries(groupVariationsByColor(variations)).map(([color, colorVariations]) => {
                    const colorKey = `${product.id}-${color}`;
                    const isColorExpanded = expandedColors.has(colorKey);

                    return (
                      <div key={color} className="bg-muted/30 rounded border">
                        <div
                          className="flex items-center justify-between p-2 md:p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => onToggleColorExpansion(product.id, color)}
                        >
                          <div className="flex items-center gap-1 md:gap-2 flex-1 min-w-0">
                            {isColorExpanded ? (
                              <ChevronDown className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="font-medium text-xs md:text-sm capitalize truncate">
                              Color: {color}
                            </span>
                            <span className="text-[10px] md:text-xs text-muted-foreground">
                              ({colorVariations.length} sizes)
                            </span>
                          </div>
                        </div>
                        {isColorExpanded && (
                          <div className="border-t p-2 md:p-3 space-y-1 md:space-y-2">
                            {colorVariations.map((variation) => {
                              const size = getSizeFromVariation(variation);
                              return (
                                <div key={variation.id} className="space-y-2 md:space-y-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs md:text-sm font-medium min-w-[60px] md:min-w-[80px]">
                                      Size: {size}
                                    </span>
                                    {variation.sku && (
                                      <span className="text-[10px] md:text-xs text-muted-foreground truncate">
                                        SKU: {variation.sku}
                                      </span>
                                    )}
                                  </div>
                                  <div className="space-y-1 md:space-y-2 pl-4 md:pl-6">
                                    {warehouses.map((warehouse) => {
                                      const key = `${variation.id}-${warehouse.id}`;
                                      const stock = variationInventory[variation.id]?.[warehouse.id] || 0;
                                      const isEditing = editMode[key]?.editing || false;
                                      const tempValue = editMode[key]?.tempValue ?? stock;

                                      return (
                                        <div key={warehouse.id} className="flex items-center gap-2 md:gap-4">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1 md:gap-2">
                                              <Warehouse className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                                              <span className="font-medium text-xs md:text-sm truncate">
                                                {warehouse.name}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                                            {isEditing ? (
                                              <>
                                                <Input
                                                  type="number"
                                                  value={tempValue}
                                                  onChange={(e) => {
                                                    const newValue = parseInt(e.target.value) || 0;
                                                    onStartEdit(key, newValue);
                                                  }}
                                                  className="w-16 md:w-24 h-7 md:h-10 text-xs md:text-sm"
                                                  disabled={saving === key}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      onConfirmEdit(key, product.id, warehouse.id, variation.id);
                                                    } else if (e.key === 'Escape') {
                                                      onCancelEdit(key);
                                                    }
                                                  }}
                                                />
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onConfirmEdit(key, product.id, warehouse.id, variation.id);
                                                  }}
                                                  disabled={saving === key}
                                                  className="h-7 w-7 md:h-8 md:w-8 p-0"
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
                                                  className="h-7 w-7 md:h-8 md:w-8 p-0"
                                                >
                                                  <X className="h-3 w-3 md:h-4 md:w-4 text-red-600" />
                                                </Button>
                                              </>
                                            ) : (
                                              <>
                                                <span className="text-xs md:text-sm font-medium w-12 md:w-16 text-right">{stock}</span>
                                                <span className="text-[10px] md:text-sm text-muted-foreground hidden sm:inline">units</span>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onStartEdit(key, stock);
                                                  }}
                                                  className="h-7 w-7 md:h-8 md:w-8 p-0"
                                                >
                                                  <Edit2 className="h-3 w-3 md:h-4 md:w-4" />
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
