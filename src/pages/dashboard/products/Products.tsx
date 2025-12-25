import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, ChevronDown, ChevronRight, ChevronsDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCategories, getTags, getProductTagIds, type ProductCategory, type ProductTag } from '@/lib/api/categories-and-tags';
import { getProducts, type Product } from '@/lib/api/products';
import { getVariantConfig } from '@/lib/api/variant-config';
import { getVariantOptionValue } from '@/lib/utils/variant-parser';

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

type Warehouse = {
  id: string;
  name: string;
};

interface ProductWithDetails extends Product {
  variants: ProductVariant[];
  tags: ProductTag[];
  inventoryItems: InventoryItem[];
}

export default function Products() {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [allTags, setAllTags] = useState<ProductTag[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  
  // Filters
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedTab, setSelectedTab] = useState<'physical' | 'event_tickets' | 'space_booking'>('physical');
  
  // Variant rank config
  const [rank1, setRank1] = useState('Color');
  const [rank2, setRank2] = useState('Size');
  
  // Expansion state
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedRank1Groups, setExpandedRank1Groups] = useState<Set<string>>(new Set());

  const canCreate = !!currentOrg?.id;

  const productTypeLabel = useMemo(() => {
    return {
      physical: 'Physical',
      venue_asset: 'Venue Asset',
    } as const;
  }, []);

  useEffect(() => {
    if (!currentOrg) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch categories, tags, warehouses, and variant config in parallel
        const [categoriesData, tagsData, warehousesResult, variantConfigData] = await Promise.all([
          getCategories(currentOrg.id),
          getTags(currentOrg.id),
          supabase
            .from('warehouses')
            .select('id, name')
            .eq('org_id', currentOrg.id)
            .order('created_at', { ascending: true }),
          getVariantConfig(currentOrg.id),
        ]);

        setCategories(categoriesData);
        setAllTags(tagsData);
        setRank1(variantConfigData.rank1);
        setRank2(variantConfigData.rank2);
        
        const whs = (warehousesResult.data || []) as Warehouse[];
        setWarehouses(whs);
        
        // Select default warehouse: prefer "Main" (case-insensitive), else first
        if (whs.length > 0) {
          const mainWh = whs.find(w => w.name.toLowerCase().includes('main')) || whs[0];
          setSelectedWarehouseId(mainWh.id);
        }

        // Fetch products using the products API
        const productsData = await getProducts(currentOrg.id);

        // Fetch variants, tags, and inventory for all products
        const productIds = productsData.map(p => p.id);
        
        let allVariants: ProductVariant[] = [];
        let allInventoryItems: InventoryItem[] = [];
        
        if (productIds.length > 0) {
          const [variantsResult, inventoryResult] = await Promise.all([
            supabase
              .from('product_variants')
              .select('id, product_id, name, sku, price, active')
              .in('product_id', productIds)
              .is('archived_at', null)
              .order('created_at', { ascending: true }),
            supabase
              .from('inventory_items')
              .select('id, variant_id, warehouse_id, quantity')
              .eq('org_id', currentOrg.id),
          ]);
          
          if (variantsResult.error) throw variantsResult.error;
          if (inventoryResult.error) throw inventoryResult.error;
          
          allVariants = (variantsResult.data || []) as ProductVariant[];
          allInventoryItems = (inventoryResult.data || []) as InventoryItem[];
        }
        
        // Fetch tags for each product
        const productsWithDetails = await Promise.all(
          productsData.map(async (product) => {
            const tagIds = await getProductTagIds(product.id);
            const productTags = allTags.filter(t => tagIds.includes(t.id));
            const productVariants = allVariants.filter(v => v.product_id === product.id);
            const variantIds = productVariants.map(v => v.id);
            const productInventory = allInventoryItems.filter(i => variantIds.includes(i.variant_id));
            
            return {
              ...product,
              variants: productVariants,
              tags: productTags,
              inventoryItems: productInventory,
            };
          })
        );
        
        setProducts(productsWithDetails);
        setError(null);
      } catch (e: any) {
        const msg = e?.message || 'Failed to load products';
        setError(msg);
        toast({ title: 'Error', description: msg, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentOrg, toast, allTags]);

  // Filter products by selected category and tab
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    // Filter by type based on tab
    if (selectedTab === 'physical') {
      filtered = filtered.filter(p => p.type === 'physical');
    } else if (selectedTab === 'event_tickets') {
      // Event tickets would be a different type or have specific metadata
      filtered = []; // Placeholder - no event tickets in current schema
    } else if (selectedTab === 'space_booking') {
      filtered = filtered.filter(p => p.type === 'venue_asset');
    }
    
    // Filter by category
    if (selectedCategoryId !== 'all') {
      if (selectedCategoryId === 'uncategorized') {
        filtered = filtered.filter(p => !p.category_id);
      } else {
        filtered = filtered.filter(p => p.category_id === selectedCategoryId);
      }
    }
    
    return filtered;
  }, [products, selectedCategoryId, selectedTab]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    
    // Count products by type for the selected tab
    let relevantProducts = products;
    if (selectedTab === 'physical') {
      relevantProducts = products.filter(p => p.type === 'physical');
    } else if (selectedTab === 'space_booking') {
      relevantProducts = products.filter(p => p.type === 'venue_asset');
    }
    
    counts.set('all', relevantProducts.length);
    
    relevantProducts.forEach(p => {
      const catId = p.category_id || 'uncategorized';
      counts.set(catId, (counts.get(catId) || 0) + 1);
    });
    
    return counts;
  }, [products, selectedTab]);

  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        // Also collapse all rank1 groups for this product
        setExpandedRank1Groups(prevGroups => {
          const nextGroups = new Set(prevGroups);
          Array.from(nextGroups).forEach(key => {
            if (key.startsWith(`${productId}:`)) {
              nextGroups.delete(key);
            }
          });
          return nextGroups;
        });
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const expandAllVariants = (productId: string, variants: ProductVariant[]) => {
    setExpandedProducts(prev => new Set(prev).add(productId));
    
    // Group by rank1 and expand all
    const rank1Values = new Set<string>();
    variants.forEach(v => {
      const rank1Val = getVariantOptionValue(v.name, rank1);
      if (rank1Val) rank1Values.add(rank1Val);
    });
    
    setExpandedRank1Groups(prev => {
      const next = new Set(prev);
      rank1Values.forEach(val => {
        next.add(`${productId}:${val}`);
      });
      return next;
    });
  };

  const toggleRank1Group = (groupKey: string) => {
    setExpandedRank1Groups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Get total quantity for a product
  const getProductQuantity = (product: ProductWithDetails): number => {
    if (!selectedWarehouseId) return 0;
    return product.inventoryItems
      .filter(i => i.warehouse_id === selectedWarehouseId)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  // Get quantity for a specific variant
  const getVariantQuantity = (variantId: string, inventoryItems: InventoryItem[]): number => {
    if (!selectedWarehouseId) return 0;
    return inventoryItems
      .filter(i => i.variant_id === variantId && i.warehouse_id === selectedWarehouseId)
      .reduce((sum, i) => sum + i.quantity, 0);
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
      <div className="max-w-7xl">
        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardContent className="flex flex-col items-center justify-center py-12 p-4 md:p-6">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Products
          </h1>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/app/settings/catalog')}
            className="h-9"
          >
            Edit
          </Button>
          <Button 
            onClick={() => navigate('/app/products/new')} 
            disabled={!canCreate} 
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            size="sm"
            className="h-9"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add new
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-grid">
          <TabsTrigger value="physical">Products</TabsTrigger>
          <TabsTrigger value="event_tickets">Event Tickets</TabsTrigger>
          <TabsTrigger value="space_booking">Space Booking</TabsTrigger>
        </TabsList>

        <TabsContent value="physical" className="mt-4 space-y-4">
          <ProductsContent
            products={filteredProducts}
            categories={categories}
            categoryCounts={categoryCounts}
            selectedCategoryId={selectedCategoryId}
            setSelectedCategoryId={setSelectedCategoryId}
            warehouses={warehouses}
            selectedWarehouseId={selectedWarehouseId}
            setSelectedWarehouseId={setSelectedWarehouseId}
            expandedProducts={expandedProducts}
            expandedRank1Groups={expandedRank1Groups}
            toggleProduct={toggleProduct}
            toggleRank1Group={toggleRank1Group}
            expandAllVariants={expandAllVariants}
            getProductQuantity={getProductQuantity}
            getVariantQuantity={getVariantQuantity}
            productTypeLabel={productTypeLabel}
            rank1={rank1}
            rank2={rank2}
            navigate={navigate}
          />
        </TabsContent>

        <TabsContent value="event_tickets" className="mt-4">
          <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardContent className="text-center py-12 px-4">
              <p className="text-muted-foreground">Event Tickets coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="space_booking" className="mt-4">
          <ProductsContent
            products={filteredProducts}
            categories={categories}
            categoryCounts={categoryCounts}
            selectedCategoryId={selectedCategoryId}
            setSelectedCategoryId={setSelectedCategoryId}
            warehouses={warehouses}
            selectedWarehouseId={selectedWarehouseId}
            setSelectedWarehouseId={setSelectedWarehouseId}
            expandedProducts={expandedProducts}
            expandedRank1Groups={expandedRank1Groups}
            toggleProduct={toggleProduct}
            toggleRank1Group={toggleRank1Group}
            expandAllVariants={expandAllVariants}
            getProductQuantity={getProductQuantity}
            getVariantQuantity={getVariantQuantity}
            productTypeLabel={productTypeLabel}
            rank1={rank1}
            rank2={rank2}
            navigate={navigate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Products content component (shared between tabs)
interface ProductsContentProps {
  products: ProductWithDetails[];
  categories: ProductCategory[];
  categoryCounts: Map<string, number>;
  selectedCategoryId: string;
  setSelectedCategoryId: (id: string) => void;
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
  productTypeLabel: Record<string, string>;
  rank1: string;
  rank2: string;
  navigate: (path: string) => void;
}

function ProductsContent({
  products,
  categories,
  categoryCounts,
  selectedCategoryId,
  setSelectedCategoryId,
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
  productTypeLabel,
  rank1,
  rank2,
  navigate,
}: ProductsContentProps) {
  return (
    <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
      <CardHeader className="p-4 md:p-6 pb-0">
        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
          <button
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              selectedCategoryId === 'all'
                ? 'bg-[#0E7A3A] text-white'
                : 'bg-white border border-gray-300 hover:bg-gray-50'
            }`}
          >
            All ({categoryCounts.get('all') || 0})
          </button>
          {categories
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-[#0E7A3A] text-white'
                    : 'bg-white border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {cat.name} ({categoryCounts.get(cat.id) || 0})
              </button>
            ))}
          {(categoryCounts.get('uncategorized') || 0) > 0 && (
            <button
              onClick={() => setSelectedCategoryId('uncategorized')}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedCategoryId === 'uncategorized'
                  ? 'bg-[#0E7A3A] text-white'
                  : 'bg-white border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Uncategorized ({categoryCounts.get('uncategorized') || 0})
            </button>
          )}
        </div>

        {/* Warehouse Selector */}
        {warehouses.length > 0 && (
          <div className="flex items-center gap-3 pt-4">
            <span className="text-sm font-medium text-muted-foreground">Warehouse:</span>
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(wh => (
                  <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 md:p-6">
        {products.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-muted-foreground mb-4">No products in this category</p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((product) => {
              const isExpanded = expandedProducts.has(product.id);
              const totalQty = getProductQuantity(product);
              const minPrice = product.variants.length > 0 
                ? Math.min(...product.variants.map(v => v.price || 0).filter(p => p > 0))
                : product.base_price || 0;

              return (
                <div key={product.id} className="border rounded-lg overflow-hidden" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                  {/* Product Header */}
                  <div className="p-3 md:p-4 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => toggleProduct(product.id)}
                        className="flex items-start gap-2 flex-1 text-left min-w-0"
                      >
                        {product.variants.length > 1 ? (
                          isExpanded ? (
                            <ChevronDown className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#0E7A3A' }} />
                          ) : (
                            <ChevronRight className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#0E7A3A' }} />
                          )
                        ) : (
                          <div className="h-5 w-5 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate" style={{ color: '#0F1F17' }}>
                            {product.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {product.tags.map(tag => (
                              <Badge key={tag.id} variant="secondary" className="text-xs">
                                {tag.name}
                              </Badge>
                            ))}
                            <Badge variant="outline" className="text-xs">
                              {productTypeLabel[product.type] || product.type}
                            </Badge>
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="font-semibold" style={{ color: '#0F1F17' }}>
                            HK${minPrice.toFixed(2)}
                          </div>
                          {warehouses.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              Qty: {totalQty}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {!isExpanded && product.variants.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                expandAllVariants(product.id, product.variants);
                              }}
                              title="Expand all variants"
                            >
                              <ChevronsDown className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/app/products/${product.id}/edit`)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Variants */}
                  {isExpanded && product.variants.length > 0 && (
                    <div className="border-t px-3 md:px-8 py-2" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.3)' }}>
                      <VariantHierarchy
                        productId={product.id}
                        variants={product.variants}
                        inventoryItems={product.inventoryItems}
                        rank1={rank1}
                        rank2={rank2}
                        expandedRank1Groups={expandedRank1Groups}
                        toggleRank1Group={toggleRank1Group}
                        getVariantQuantity={getVariantQuantity}
                        showQuantity={warehouses.length > 0}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Component for rendering hierarchical variant view
interface VariantHierarchyProps {
  productId: string;
  variants: ProductVariant[];
  inventoryItems: InventoryItem[];
  rank1: string;
  rank2: string;
  expandedRank1Groups: Set<string>;
  toggleRank1Group: (key: string) => void;
  getVariantQuantity: (variantId: string, inventoryItems: InventoryItem[]) => number;
  showQuantity: boolean;
}

function VariantHierarchy({
  productId,
  variants,
  inventoryItems,
  rank1,
  rank2,
  expandedRank1Groups,
  toggleRank1Group,
  getVariantQuantity,
  showQuantity,
}: VariantHierarchyProps) {
  // Group variants by rank1
  const rank1Groups = useMemo(() => {
    const groups = new Map<string, ProductVariant[]>();
    
    for (const variant of variants) {
      const rank1Value = getVariantOptionValue(variant.name, rank1) || 'Other';
      if (!groups.has(rank1Value)) {
        groups.set(rank1Value, []);
      }
      groups.get(rank1Value)!.push(variant);
    }
    
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [variants, rank1]);

  if (rank1Groups.length === 0) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        No variants available
      </div>
    );
  }

  // If only one variant, show it directly
  if (variants.length === 1) {
    const variant = variants[0];
    const qty = getVariantQuantity(variant.id, inventoryItems);
    return (
      <div className="py-2 flex items-center justify-between">
        <span className="text-sm">{variant.name}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">HK${(variant.price || 0).toFixed(2)}</span>
          {showQuantity && <span className="text-sm text-muted-foreground">Qty: {qty}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2">
      {rank1Groups.map(([rank1Value, groupVariants]) => {
        const groupKey = `${productId}:${rank1Value}`;
        const isExpanded = expandedRank1Groups.has(groupKey);
        const groupTotal = groupVariants.reduce((sum, v) => sum + getVariantQuantity(v.id, inventoryItems), 0);

        return (
          <div key={groupKey} className="border rounded-lg overflow-hidden" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'white' }}>
            {/* Rank1 Header */}
            <button
              onClick={() => toggleRank1Group(groupKey)}
              className="w-full flex items-center justify-between p-2 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" style={{ color: '#0E7A3A' }} />
                ) : (
                  <ChevronRight className="h-4 w-4" style={{ color: '#0E7A3A' }} />
                )}
                <span className="text-sm font-medium">
                  {rank1}: {rank1Value}
                </span>
              </div>
              {showQuantity && <span className="text-sm font-semibold">({groupTotal})</span>}
            </button>

            {/* Rank2 or Leaf Variants */}
            {isExpanded && (
              <div className="border-t px-6 py-2 space-y-1" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                {(() => {
                  // Group by rank2
                  const rank2Groups = new Map<string, ProductVariant[]>();
                  for (const variant of groupVariants) {
                    const rank2Value = getVariantOptionValue(variant.name, rank2) || 'Other';
                    if (!rank2Groups.has(rank2Value)) {
                      rank2Groups.set(rank2Value, []);
                    }
                    rank2Groups.get(rank2Value)!.push(variant);
                  }
                  
                  return Array.from(rank2Groups.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([rank2Value, rank2Variants]) => {
                      const rank2Total = rank2Variants.reduce((sum, v) => sum + getVariantQuantity(v.id, inventoryItems), 0);
                      const avgPrice = rank2Variants.reduce((sum, v) => sum + (v.price || 0), 0) / rank2Variants.length;
                      
                      return (
                        <div key={rank2Value} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/20">
                          <span className="text-sm">
                            {rank2}: {rank2Value}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">HK${avgPrice.toFixed(2)}</span>
                            {showQuantity && <span className="text-sm text-muted-foreground">({rank2Total})</span>}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
