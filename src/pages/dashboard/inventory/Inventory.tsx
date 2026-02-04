import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, RefreshCw, ChevronDown, ChevronRight, ChevronsDown, Upload } from 'lucide-react';
import { getVariantHierarchy, parseVariantName, getVariantOptionValue } from '@/lib/utils/variant-parser';
import { getVariantConfig } from '@/lib/api/variant-config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type Warehouse = { id: string; org_id: string; name: string; address: string | null };
type Product = { id: string; org_id: string; title: string };
type Variant = { id: string; product_id: string; name: string; sku: string | null };
type InventoryItem = { id: string; org_id: string; warehouse_id: string; variant_id: string; quantity: number };

interface ProductInventoryData {
  product: Product;
  variants: Variant[];
  inventoryItems: InventoryItem[];
}

export default function Inventory() {
  const { currentOrg, user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [productInventoryData, setProductInventoryData] = useState<ProductInventoryData[]>([]);
  const [variantOptionOrder, setVariantOptionOrder] = useState<string[]>([]);

  // Expansion state
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedVariantGroups, setExpandedVariantGroups] = useState<Set<string>>(new Set());

  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>(() => {
    if (!currentOrg) return 'grouped';
    const saved = localStorage.getItem(`inventory:viewMode:${currentOrg.id}`);
    return (saved === 'list' || saved === 'grouped') ? saved : 'grouped';
  });

  // Bulk update modal state
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkUpdateMode, setBulkUpdateMode] = useState<'set' | 'delta'>('set');
  const [bulkUpdateCsv, setBulkUpdateCsv] = useState('');
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(false);

  const reload = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      // Fetch warehouses
      const { data: whData, error: whErr } = await supabase
        .from('warehouses')
        .select('id, org_id, name, address')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: true });
      if (whErr) throw whErr;

      // Fetch products
      const { data: productsData, error: productsErr } = await supabase
        .from('products')
        .select('id, org_id, title')
        .eq('org_id', currentOrg.id)
        .order('title', { ascending: true });
      if (productsErr) throw productsErr;

      const products = (productsData as any as Product[]) || [];
      const productIds = products.map(p => p.id);

      // Fetch variants
      const { data: variantsData, error: variantsErr } = await supabase
        .from('product_variants')
        .select('id, product_id, name, sku')
        .in('product_id', productIds.length > 0 ? productIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: true });
      if (variantsErr) throw variantsErr;

      const variants = (variantsData as any as Variant[]) || [];

      // Fetch inventory items
      const { data: invData, error: invErr } = await supabase
        .from('inventory_items')
        .select('id, org_id, warehouse_id, variant_id, quantity')
        .eq('org_id', currentOrg.id);
      if (invErr) throw invErr;

      const inventoryItems = (invData as any as InventoryItem[]) || [];

      // Load variant option order from org_variant_config table
      const config = await getVariantConfig(currentOrg.id);
      const savedOrder = [config.rank1, config.rank2].filter(Boolean);
      setVariantOptionOrder(savedOrder);

      // Group data by product
      const productDataMap = new Map<string, ProductInventoryData>();
      for (const product of products) {
        productDataMap.set(product.id, {
          product,
          variants: variants.filter(v => v.product_id === product.id),
          inventoryItems: [],
        });
      }

      // Assign inventory items to products
      for (const item of inventoryItems) {
        const variant = variants.find(v => v.id === item.variant_id);
        if (variant) {
          const productData = productDataMap.get(variant.product_id);
          if (productData) {
            productData.inventoryItems.push(item);
          }
        }
      }

      setWarehouses((whData as any as Warehouse[]) || []);
      setProductInventoryData(Array.from(productDataMap.values()));
      setError(null);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load inventory';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentOrg) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  // Sync viewMode with localStorage when org changes
  useEffect(() => {
    if (!currentOrg) return;
    const saved = localStorage.getItem(`inventory:viewMode:${currentOrg.id}`);
    if (saved === 'list' || saved === 'grouped') {
      setViewMode(saved);
    }
  }, [currentOrg?.id]);

  // Save viewMode to localStorage when it changes
  useEffect(() => {
    if (!currentOrg) return;
    localStorage.setItem(`inventory:viewMode:${currentOrg.id}`, viewMode);
  }, [viewMode, currentOrg?.id]);

  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const expandAllVariants = (productId: string, variantNames: string[]) => {
    setExpandedProducts(prev => new Set(prev).add(productId));
    
    // Expand all variant groups for this product
    const hierarchy = getVariantHierarchy(variantNames, variantOptionOrder);
    if (hierarchy.length > 0) {
      const rank1Option = hierarchy[0];
      const uniqueRank1Values = new Set(
        variantNames.map(name => getVariantOptionValue(name, rank1Option)).filter(Boolean)
      );
      
      setExpandedVariantGroups(prev => {
        const next = new Set(prev);
        uniqueRank1Values.forEach(value => {
          next.add(`${productId}:${rank1Option}:${value}`);
        });
        return next;
      });
    }
  };

  const toggleVariantGroup = (groupKey: string) => {
    setExpandedVariantGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Calculate total stock for a product
  const getProductTotal = (productData: ProductInventoryData): number => {
    const variantIds = new Set(productData.variants.map(v => v.id));
    return productData.inventoryItems
      .filter(item => {
        if (selectedWarehouseId === 'all') return variantIds.has(item.variant_id);
        return variantIds.has(item.variant_id) && item.warehouse_id === selectedWarehouseId;
      })
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  // Calculate stock for a specific variant
  const getVariantStock = (variantId: string, inventoryItems: InventoryItem[]): number => {
    return inventoryItems
      .filter(item => {
        if (selectedWarehouseId === 'all') return item.variant_id === variantId;
        return item.variant_id === variantId && item.warehouse_id === selectedWarehouseId;
      })
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  // Parse CSV rows into { sku, value } pairs
  const parseCsvRows = (csvText: string): Array<{ sku: string; value: number }> => {
    const lines = csvText.split('\n');
    const parsed: Array<{ sku: string; value: number }> = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Try comma-separated first, then tab-separated, then space-separated
      const parts = trimmed.includes(',') 
        ? trimmed.split(',').map(s => s.trim())
        : trimmed.includes('\t')
        ? trimmed.split('\t').map(s => s.trim())
        : trimmed.split(/\s+/).map(s => s.trim());
      
      if (parts.length >= 2) {
        const sku = parts[0];
        const value = parseFloat(parts[1]);
        if (sku && !isNaN(value) && isFinite(value)) {
          parsed.push({ sku, value });
        }
      }
    }
    
    return parsed;
  };

  // Get preview summary for bulk update
  const getBulkUpdatePreview = () => {
    if (!bulkUpdateCsv.trim() || !currentOrg) {
      return { matched: 0, unknown: [] };
    }
    
    const parsed = parseCsvRows(bulkUpdateCsv);
    const skuMap = new Map<string, Variant>();
    
    // Build SKU -> Variant map from all loaded variants
    for (const productData of productInventoryData) {
      for (const variant of productData.variants) {
        if (variant.sku) {
          skuMap.set(variant.sku, variant);
        }
      }
    }
    
    const matched: string[] = [];
    const unknown: string[] = [];
    
    for (const { sku } of parsed) {
      if (skuMap.has(sku)) {
        matched.push(sku);
      } else {
        unknown.push(sku);
      }
    }
    
    return { matched: matched.length, unknown };
  };

  // Apply bulk update
  const applyBulkUpdate = async () => {
    if (!currentOrg || !user || selectedWarehouseId === 'all') return;
    
    const parsed = parseCsvRows(bulkUpdateCsv);
    if (parsed.length === 0) return;
    
    setBulkUpdateLoading(true);
    
    try {
      // Build SKU -> Variant map
      const skuMap = new Map<string, Variant>();
      for (const productData of productInventoryData) {
        for (const variant of productData.variants) {
          if (variant.sku) {
            skuMap.set(variant.sku, variant);
          }
        }
      }
      
      let updatedCount = 0;
      const unknownSkus: string[] = [];
      
      for (const { sku, value } of parsed) {
        const variant = skuMap.get(sku);
        if (!variant) {
          unknownSkus.push(sku);
          continue;
        }
        
        // Find or create inventory_item
        let inventoryItem: InventoryItem | null = null;
        const existingItem = productInventoryData
          .flatMap(pd => pd.inventoryItems)
          .find(item => item.variant_id === variant.id && item.warehouse_id === selectedWarehouseId);
        
        if (existingItem) {
          inventoryItem = existingItem;
        } else {
          // Create new inventory_item
          const { data: newItem, error: createErr } = await supabase
            .from('inventory_items')
            .insert({
              org_id: currentOrg.id,
              warehouse_id: selectedWarehouseId,
              variant_id: variant.id,
              quantity: 0,
            })
            .select()
            .single();
          
          if (createErr) throw createErr;
          inventoryItem = newItem as InventoryItem;
        }
        
        // Calculate new quantity
        const oldQty = inventoryItem.quantity;
        const newQty = bulkUpdateMode === 'set' ? value : oldQty + value;
        const delta = newQty - oldQty;
        
        // Update inventory_item
        const { error: updateErr } = await supabase
          .from('inventory_items')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', inventoryItem.id);
        
        if (updateErr) throw updateErr;
        
        // Create inventory_movement
        const { error: movementErr } = await supabase
          .from('inventory_movements')
          .insert({
            inventory_item_id: inventoryItem.id,
            delta,
            reason: 'bulk_update',
            note: 'Bulk update',
            created_by: user.id,
          });
        
        if (movementErr) throw movementErr;
        
        updatedCount++;
      }
      
      toast({
        title: 'Bulk update complete',
        description: `${updatedCount} updated, ${unknownSkus.length} unknown SKU${unknownSkus.length !== 1 ? 's' : ''}`,
      });
      
      setBulkUpdateOpen(false);
      setBulkUpdateCsv('');
      await reload();
    } catch (e: any) {
      const msg = e?.message || 'Failed to apply bulk update';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setBulkUpdateLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Inventory
          </h1>
          <p className="mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Hierarchical stock view for {currentOrg?.name || 'your org'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={reload} className="w-full sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setBulkUpdateOpen(true)} className="w-full sm:w-auto">
            <Upload className="mr-2 h-4 w-4" />
            Bulk Update
          </Button>
        </div>
      </div>

      {/* Warehouse Filter and View Mode Toggle */}
      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <Label className="text-sm font-medium min-w-[100px]">Warehouse:</Label>
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Warehouses</SelectItem>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-sm font-medium">View:</Label>
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as 'grouped' | 'list')}>
                <ToggleGroupItem value="grouped" aria-label="Grouped view">Grouped</ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view">List</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hierarchical Inventory View */}
      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle>Stock by Product</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          {productInventoryData.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No products with inventory found.
            </p>
          ) : viewMode === 'list' ? (
            // List view: flat list of all variants
            <div className="space-y-1">
              {productInventoryData.flatMap(productData =>
                productData.variants.map(variant => {
                  const stock = getVariantStock(variant.id, productData.inventoryItems);
                  return (
                    <div key={variant.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted/30 border-b" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" style={{ color: '#0F1F17' }}>
                          {productData.product.title}
                        </div>
                        <div className="text-sm truncate" style={{ color: 'rgba(15,31,23,0.6)' }}>
                          {variant.name} {variant.sku && `(${variant.sku})`}
                        </div>
                      </div>
                      <span className="text-sm font-semibold ml-4">{stock}</span>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            // Grouped view: hierarchical structure
            <div className="space-y-2">
              {productInventoryData.map(productData => {
                const isExpanded = expandedProducts.has(productData.product.id);
                const totalStock = getProductTotal(productData);
                const variantNames = productData.variants.map(v => v.name);
                const hierarchy = getVariantHierarchy(variantNames, variantOptionOrder);

                return (
                  <div key={productData.product.id} className="border rounded-lg" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                    {/* Product Header */}
                    <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                      <button
                        onClick={() => toggleProduct(productData.product.id)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 flex-shrink-0" style={{ color: '#0E7A3A' }} />
                        ) : (
                          <ChevronRight className="h-5 w-5 flex-shrink-0" style={{ color: '#0E7A3A' }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate" style={{ color: '#0F1F17' }}>
                            {productData.product.title}
                          </div>
                          <div className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
                            Total: {totalStock}
                          </div>
                        </div>
                      </button>
                      {!isExpanded && productData.variants.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            expandAllVariants(productData.product.id, variantNames);
                          }}
                          className="ml-2"
                        >
                          <ChevronsDown className="h-4 w-4 mr-1" />
                          Expand All
                        </Button>
                      )}
                    </div>

                    {/* Variant Hierarchy */}
                    {isExpanded && productData.variants.length > 0 && (
                      <div className="border-t pl-8 pr-3 py-2" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                        {hierarchy.length === 0 ? (
                          // No hierarchy detected, show flat list
                          <div className="space-y-1">
                            {productData.variants.map(variant => {
                              const stock = getVariantStock(variant.id, productData.inventoryItems);
                              return (
                                <div key={variant.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted/30">
                                  <span className="text-sm">{variant.name}</span>
                                  <span className="text-sm font-semibold">{stock}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          // Render hierarchy
                          <HierarchicalVariantView
                            productId={productData.product.id}
                            variants={productData.variants}
                            inventoryItems={productData.inventoryItems}
                            hierarchy={hierarchy}
                            expandedGroups={expandedVariantGroups}
                            toggleGroup={toggleVariantGroup}
                            getVariantStock={getVariantStock}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Update Modal */}
      <Dialog open={bulkUpdateOpen} onOpenChange={setBulkUpdateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Update Inventory</DialogTitle>
            <DialogDescription>
              Paste CSV data with SKU and quantity values. Format: SKU, value (one per line)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="space-y-2">
              <Label>Update Mode:</Label>
              <RadioGroup value={bulkUpdateMode} onValueChange={(v) => setBulkUpdateMode(v as 'set' | 'delta')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="set" id="mode-set" />
                  <Label htmlFor="mode-set" className="font-normal cursor-pointer">
                    Set quantity (replace current value)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="delta" id="mode-delta" />
                  <Label htmlFor="mode-delta" className="font-normal cursor-pointer">
                    Adjust by delta (add/subtract from current value)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Warehouse Warning */}
            {selectedWarehouseId === 'all' && (
              <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  Select a warehouse to bulk update
                </p>
              </div>
            )}

            {/* CSV Textarea */}
            <div className="space-y-2">
              <Label htmlFor="csv-input">CSV Data:</Label>
              <Textarea
                id="csv-input"
                placeholder="SKU001, 100&#10;SKU002, 50&#10;SKU003, -10"
                value={bulkUpdateCsv}
                onChange={(e) => setBulkUpdateCsv(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </div>

            {/* Preview Summary */}
            {bulkUpdateCsv.trim() && (
              <div className="p-3 rounded-lg bg-muted">
                <div className="text-sm space-y-1">
                  <div>
                    <span className="font-medium">Matched SKUs:</span> {getBulkUpdatePreview().matched}
                  </div>
                  {getBulkUpdatePreview().unknown.length > 0 && (
                    <div>
                      <span className="font-medium">Unknown SKUs:</span>{' '}
                      <span className="text-destructive">
                        {getBulkUpdatePreview().unknown.slice(0, 5).join(', ')}
                        {getBulkUpdatePreview().unknown.length > 5 && ` +${getBulkUpdatePreview().unknown.length - 5} more`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkUpdateOpen(false);
                setBulkUpdateCsv('');
              }}
              disabled={bulkUpdateLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={applyBulkUpdate}
              disabled={
                bulkUpdateLoading ||
                !bulkUpdateCsv.trim() ||
                selectedWarehouseId === 'all' ||
                getBulkUpdatePreview().matched === 0
              }
            >
              {bulkUpdateLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Component for rendering hierarchical variant view
interface HierarchicalVariantViewProps {
  productId: string;
  variants: Variant[];
  inventoryItems: InventoryItem[];
  hierarchy: string[];
  expandedGroups: Set<string>;
  toggleGroup: (key: string) => void;
  getVariantStock: (variantId: string, items: InventoryItem[]) => number;
}

function HierarchicalVariantView({
  productId,
  variants,
  inventoryItems,
  hierarchy,
  expandedGroups,
  toggleGroup,
  getVariantStock,
}: HierarchicalVariantViewProps) {
  if (hierarchy.length === 0) return null;

  const rank1Option = hierarchy[0];
  const rank2Option = hierarchy.length > 1 ? hierarchy[1] : null;

  // Group variants by rank 1 option
  const rank1Groups = useMemo(() => {
    const groups = new Map<string, Variant[]>();
    
    for (const variant of variants) {
      const rank1Value = getVariantOptionValue(variant.name, rank1Option);
      if (rank1Value) {
        if (!groups.has(rank1Value)) {
          groups.set(rank1Value, []);
        }
        groups.get(rank1Value)!.push(variant);
      }
    }
    
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [variants, rank1Option]);

  return (
    <div className="space-y-2">
      {rank1Groups.map(([rank1Value, groupVariants]) => {
        const groupKey = `${productId}:${rank1Option}:${rank1Value}`;
        const isExpanded = expandedGroups.has(groupKey);
        const groupTotal = groupVariants.reduce((sum, v) => sum + getVariantStock(v.id, inventoryItems), 0);

        return (
          <div key={groupKey} className="border rounded-lg" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.3)' }}>
            {/* Rank 1 Header */}
            <button
              onClick={() => toggleGroup(groupKey)}
              className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" style={{ color: '#0E7A3A' }} />
                ) : (
                  <ChevronRight className="h-4 w-4" style={{ color: '#0E7A3A' }} />
                )}
                <span className="text-sm font-medium">
                  {rank1Option}: {rank1Value}
                </span>
              </div>
              <span className="text-sm font-semibold">({groupTotal})</span>
            </button>

            {/* Rank 2 or Leaf Variants */}
            {isExpanded && (
              <div className="pl-6 pr-2 pb-2 space-y-1">
                {rank2Option ? (
                  // Group by rank 2
                  (() => {
                    const rank2Groups = new Map<string, Variant[]>();
                    for (const variant of groupVariants) {
                      const rank2Value = getVariantOptionValue(variant.name, rank2Option);
                      if (rank2Value) {
                        if (!rank2Groups.has(rank2Value)) {
                          rank2Groups.set(rank2Value, []);
                        }
                        rank2Groups.get(rank2Value)!.push(variant);
                      }
                    }
                    
                    return Array.from(rank2Groups.entries())
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([rank2Value, rank2Variants]) => {
                        const rank2Total = rank2Variants.reduce((sum, v) => sum + getVariantStock(v.id, inventoryItems), 0);
                        
                        return (
                          <div key={rank2Value} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/20">
                            <span className="text-sm">
                              {rank2Option}: {rank2Value}
                            </span>
                            <span className="text-sm font-semibold">{rank2Total}</span>
                          </div>
                        );
                      });
                  })()
                ) : (
                  // No rank 2, show variants directly
                  groupVariants.map(variant => {
                    const stock = getVariantStock(variant.id, inventoryItems);
                    return (
                      <div key={variant.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/20">
                        <span className="text-sm">{variant.name}</span>
                        <span className="text-sm font-semibold">{stock}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

