import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Warehouse, ChevronDown, ChevronRight } from 'lucide-react';
import { ProductWithInventory } from './Inventory';
import { InventoryLocation } from './Inventory';
import { ProductVariation } from '@/lib/types/variable-products';

interface VariableInventoryViewProps {
  products: ProductWithInventory[];
  locations: InventoryLocation[];
  onUpdateStock: (productId: string, locationId: string, quantity: number, variationId?: string) => void;
  saving: string | null;
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
  onUpdateStock,
  saving,
  productVariations,
  variationInventory,
  expandedProducts,
  expandedColors,
  onToggleExpansion,
  onToggleColorExpansion,
}: VariableInventoryViewProps) {
  const warehouses = locations.filter((loc) => loc.type === 'warehouse');

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
                                            <Input
                                              type="number"
                                              value={stock}
                                              onChange={(e) =>
                                                onUpdateStock(product.id, warehouse.id, parseInt(e.target.value) || 0, variation.id)
                                              }
                                              className="w-16 md:w-24 h-7 md:h-10 text-xs md:text-sm"
                                              disabled={saving === key}
                                            />
                                            <span className="text-[10px] md:text-sm text-muted-foreground hidden sm:inline">units</span>
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

