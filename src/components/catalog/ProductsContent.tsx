import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight, ChevronsDown, Edit } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { VariantCombinationsTable } from './VariantCombinationsTable';
import { VariantPicker } from '@/components/pos/VariantPicker';
import type { ProductCategory } from '@/lib/api/categories-and-tags';
import type { ProductWithDetails, Warehouse, InventoryItem, ProductVariant } from '@/pages/dashboard/products/Products';
import { getVariantOptionValue } from '@/lib/utils/variant-parser';

export interface ProductsContentProps {
  products: ProductWithDetails[];
  categories: ProductCategory[];
  categoryCounts: Map<string, number>;
  selectedSubtab: 'catalog' | 'pos' | 'orders';
  setSelectedSubtab: (subtab: 'catalog' | 'pos' | 'orders') => void;
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  setSelectedWarehouseId: (id: string) => void;
  expandedProducts: Set<string>;
  expandedRank1Groups: Set<string>;
  toggleProduct: (id: string) => void;
  toggleRank1Group: (key: string) => void;
  expandAllVariants: (productId: string, variants: any[]) => void;
  getProductQuantity: (product: ProductWithDetails) => number;
  getVariantQuantity: (variantId: string, inventoryItems: InventoryItem[]) => number;
  rank1: string;
  rank2: string;
  navigate: (path: string) => void;
  bulkMode: 'none' | 'correction' | 'restock' | 'transfer';
  isBulkEdit: boolean;
  pendingEdits: Record<string, { stock?: number; price?: number }>;
  setPendingEdits: React.Dispatch<React.SetStateAction<Record<string, { stock?: number; price?: number }>>>;
  getCurrentStock: (variantId: string, warehouseId: string) => number;
  getCurrentPrice: (variantId: string) => number;
  restockEdits: Record<string, number>;
  setRestockEdits: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  restockReferenceNote: string;
  setRestockReferenceNote: (note: string) => void;
  transferEdits: Record<string, number>;
  setTransferEdits: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  transferFromWarehouseId: string;
  transferToWarehouseId: string;
  onBeginEditing?: () => void;
  cart?: Array<{ productId: string; variantId?: string; name: string; variantLabel?: string; qty: number; unitPrice: number }>;
  onAddToCart?: (item: { productId: string; variantId?: string; name: string; variantLabel?: string; qty: number; unitPrice: number }) => void;
}

export function ProductsContent({
  products,
  categories,
  categoryCounts,
  selectedSubtab,
  setSelectedSubtab,
  warehouses,
  selectedWarehouseId,
  setSelectedWarehouseId,
  expandedProducts,
  expandedRank1Groups,
  toggleProduct,
  toggleRank1Group,
  expandAllVariants,
  getProductQuantity,
  getVariantQuantity,
  rank1,
  rank2,
  navigate,
  bulkMode,
  isBulkEdit,
  pendingEdits,
  setPendingEdits,
  getCurrentStock,
  getCurrentPrice,
  restockEdits,
  setRestockEdits,
  restockReferenceNote,
  setRestockReferenceNote,
  transferEdits,
  setTransferEdits,
  transferFromWarehouseId,
  transferToWarehouseId,
  onBeginEditing,
  cart,
  onAddToCart,
}: ProductsContentProps) {
  const { currentOrg } = useAuth();
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<{ product: ProductWithDetails; variants: ProductVariant[] } | null>(null);

  const formatVariantLabel = (variant: ProductVariant): string => {
    return variant.name
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

  const handleProductClick = (product: ProductWithDetails, e: React.MouseEvent) => {
    // In POS mode, clicking product row adds to cart (unless clicking edit icon)
    if (selectedSubtab === 'pos' && onAddToCart) {
      // Check if click was on edit icon or its parent
      const target = e.target as HTMLElement;
      if (target.closest('button[title*="edit"], button[title*="Edit"]')) {
        return; // Let edit button handle it
      }

      if (product.variants.length === 0) {
        // No variants - add directly
        onAddToCart({
          productId: product.id,
          name: product.title,
          qty: 1,
          unitPrice: product.base_price || 0,
        });
      } else if (product.variants.length === 1) {
        // Single variant - add directly
        const variant = product.variants[0];
        onAddToCart({
          productId: product.id,
          variantId: variant.id,
          name: product.title,
          variantLabel: formatVariantLabel(variant),
          qty: 1,
          unitPrice: variant.price || product.base_price || 0,
        });
      } else {
        // Multiple variants - open picker
        setSelectedProductForVariant({ product, variants: product.variants });
        setVariantPickerOpen(true);
      }
    }
  };

  const handleVariantSelect = (variant: ProductVariant) => {
    if (selectedProductForVariant && onAddToCart) {
      onAddToCart({
        productId: selectedProductForVariant.product.id,
        variantId: variant.id,
        name: selectedProductForVariant.product.title,
        variantLabel: formatVariantLabel(variant),
        qty: 1,
        unitPrice: variant.price || selectedProductForVariant.product.base_price || 0,
      });
    }
  };

  // If orders subtab is selected, render placeholder
  if (selectedSubtab === 'orders') {
    return (
      <div className="space-y-4 md:space-y-6">
        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">Coming soon.</p>
            <Button disabled style={{ backgroundColor: '#0E7A3A', color: 'white' }}>
              Create Order
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Catalog subtab - render existing catalog view
  return (
    <>
      {products.length === 0 ? (
        <div className="text-center py-8 sm:py-12 px-4">
          <p className="text-sm sm:text-base text-muted-foreground mb-4">No products in this category</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {products.map((product, productIdx) => {
            const isExpanded = expandedProducts.has(product.id);
            const totalQty = getProductQuantity(product);
            const minPrice = product.variants.length > 0 
              ? Math.min(...product.variants.map(v => v.price || 0).filter(p => p > 0))
              : product.base_price || 0;

            return (
              <div key={product.id} className="border rounded-lg overflow-hidden" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                {/* Product Header */}
                <div 
                  className={`p-2.5 sm:p-3 md:p-4 bg-white ${selectedSubtab === 'pos' ? 'cursor-pointer' : ''}`}
                  onClick={selectedSubtab === 'pos' ? (e) => {
                    // Check if click was on a control button (they should stopPropagation, but double-check)
                    const target = e.target as HTMLElement;
                    if (target.closest('button')) {
                      return; // Let button handle it
                    }
                    handleProductClick(product, e);
                  } : undefined}
                  onKeyDown={selectedSubtab === 'pos' ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleProductClick(product, e as any);
                    }
                  } : undefined}
                  role={selectedSubtab === 'pos' ? 'button' : undefined}
                  tabIndex={selectedSubtab === 'pos' ? 0 : undefined}
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    {/* Left chevron button - separate from row click to prevent event bubbling
                        In POS mode: chevron toggles expand/collapse, row adds to cart
                        In Catalog mode: both chevron and row toggle expand/collapse */}
                    {product.variants.length > 1 ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent row click handler from firing
                          e.preventDefault();
                          toggleProduct(product.id);
                        }}
                        className="flex-shrink-0 mt-0.5 p-1 hover:bg-muted/50 rounded transition-colors"
                        title={isExpanded ? "Collapse variants" : "Expand variants"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: '#0E7A3A' }} />
                        ) : (
                          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: '#0E7A3A' }} />
                        )}
                      </button>
                    ) : (
                      <div className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                    )}
                    {/* Product row content - clickable for add-to-cart in POS (via parent), expand/collapse in Catalog */}
                    {selectedSubtab === 'pos' ? (
                      <div className="flex items-start gap-1.5 sm:gap-2 flex-1 text-left min-w-0">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-base font-semibold truncate" style={{ color: '#0F1F17' }}>
                            {product.title}
                          </h3>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          toggleProduct(product.id);
                        }}
                        className="flex items-start gap-1.5 sm:gap-2 flex-1 text-left min-w-0"
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-base font-semibold truncate" style={{ color: '#0F1F17' }}>
                            {product.title}
                          </h3>
                        </div>
                      </button>
                    )}
                    <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                      <div className="text-right">
                        {/* Catalog subtab - show price */}
                        <>
                          <div className="text-sm sm:text-base font-semibold whitespace-nowrap" style={{ color: '#0F1F17' }}>
                            HK${minPrice.toFixed(2)}
                          </div>
                          {product.variants.length > 1 && (
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {product.variants.length} variants
                            </div>
                          )}
                        </>
                      </div>
                      <div className="flex gap-0.5 sm:gap-1">
                        {!isExpanded && product.variants.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              expandAllVariants(product.id, product.variants);
                            }}
                            title="Expand all variants"
                            className="h-8 w-8 p-0"
                          >
                            <ChevronsDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            navigate(`/app/products/${product.id}/edit`);
                          }}
                          title="Edit product"
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Variants */}
                {isExpanded && product.variants.length > 0 && (
                  <div className="border-t px-2.5 sm:px-3 md:px-8 py-2" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.3)' }}>
                    <VariantCombinationsTable
                      variants={product.variants}
                      inventoryItems={product.inventoryItems}
                      getVariantQuantity={getVariantQuantity}
                      basePrice={product.base_price}
                      bulkMode={bulkMode}
                      isBulkEdit={isBulkEdit}
                      selectedWarehouseId={selectedWarehouseId}
                      pendingEdits={pendingEdits}
                      setPendingEdits={setPendingEdits}
                      getCurrentStock={getCurrentStock}
                      getCurrentPrice={getCurrentPrice}
                      restockEdits={restockEdits}
                      setRestockEdits={setRestockEdits}
                      transferEdits={transferEdits}
                      setTransferEdits={setTransferEdits}
                      transferFromWarehouseId={transferFromWarehouseId}
                      transferToWarehouseId={transferToWarehouseId}
                      onBeginEditing={onBeginEditing}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Variant Picker for POS */}
      {selectedSubtab === 'pos' && selectedProductForVariant && (
        <VariantPicker
          open={variantPickerOpen}
          onOpenChange={setVariantPickerOpen}
          productName={selectedProductForVariant.product.title}
          variants={selectedProductForVariant.variants}
          rank1={rank1}
          rank2={rank2}
          onSelect={handleVariantSelect}
          activeWarehouseId={selectedWarehouseId || null}
          inventoryItems={selectedProductForVariant.product.inventoryItems}
          cart={cart || []}
        />
      )}
    </>
  );
}
