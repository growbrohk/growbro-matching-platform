import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, ChevronDown, ChevronRight, ChevronsDown, Pencil } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCategories, getTags, getProductTagIds, type ProductCategory, type ProductTag } from '@/lib/api/categories-and-tags';
import { getProducts } from '@/lib/api/products';
import { getVariantConfig } from '@/lib/api/variant-config';
import { getVariantOptionValue, parseVariantName, getUniqueVariantOptionNames } from '@/lib/utils/variant-parser';
import type { Product } from '@/lib/types';

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

interface ProductsProps {
  // Products is a sub-view under Catalog.
  // Do not render standalone page headers or pillar tabs when embedded.
  isEmbeddedInCatalog?: boolean;
}

export default function Products({ isEmbeddedInCatalog = false }: ProductsProps = {}) {
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
  const [selectedPillar, setSelectedPillar] = useState<'catalog' | 'inventory'>('catalog');
  
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
            const productTags = tagsData.filter(t => tagIds.includes(t.id));
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
  }, [currentOrg, toast]);

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
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4 md:space-y-6">
      {/* Header and Pillar Tabs - Only show when NOT embedded in Catalog */}
      {!isEmbeddedInCatalog && (
        <>
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight truncate" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
                Products
              </h1>
            </div>
            <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => navigate('/app/settings/catalog')}
                className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                title="Edit catalog settings"
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Edit</span>
              </Button>
              <Button 
                onClick={() => navigate('/app/products/new')} 
                disabled={!canCreate} 
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                title="Add new product"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Add Product</span>
              </Button>
            </div>
          </div>

          <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="w-full">
            <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-grid">
              <TabsTrigger value="physical">Products</TabsTrigger>
              <TabsTrigger value="event_tickets">Event Tickets</TabsTrigger>
              <TabsTrigger value="space_booking">Space Booking</TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      )}

      {/* Content - Always show, but wrapped in Tabs only when NOT embedded */}
      {!isEmbeddedInCatalog ? (
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="w-full">

          <TabsContent value="physical" className="mt-4 space-y-4">
            <ProductsContent
              products={filteredProducts}
              categories={categories}
              categoryCounts={categoryCounts}
              selectedCategoryId={selectedCategoryId}
              setSelectedCategoryId={setSelectedCategoryId}
              selectedPillar={selectedPillar}
              setSelectedPillar={setSelectedPillar}
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
              selectedPillar={selectedPillar}
              setSelectedPillar={setSelectedPillar}
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
      ) : (
        // When embedded in Catalog, render content directly without the Tabs wrapper
        <div className="mt-0">
          <ProductsContent
            products={filteredProducts}
            categories={categories}
            categoryCounts={categoryCounts}
            selectedCategoryId={selectedCategoryId}
            setSelectedCategoryId={setSelectedCategoryId}
            selectedPillar={selectedPillar}
            setSelectedPillar={setSelectedPillar}
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
        </div>
      )}
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
  selectedPillar: 'catalog' | 'inventory';
  setSelectedPillar: (pillar: 'catalog' | 'inventory') => void;
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
  selectedPillar,
  setSelectedPillar,
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
    <Card className="rounded-3xl border overflow-hidden" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
      <CardHeader className="p-3 sm:p-4 md:p-6 pb-0">
        {/* Pillar Tabs (Catalog / Inventory) */}
        <Tabs value={selectedPillar} onValueChange={(v) => setSelectedPillar(v as 'catalog' | 'inventory')} className="w-full">
          <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-grid mb-4">
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Category Pills */}
        {/* TODO: Wire up real-time category counts from database aggregation */}
        <div className="flex gap-2 overflow-x-auto pb-3 sm:pb-4 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => setSelectedCategoryId('all')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
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
                className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
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
              className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
                selectedCategoryId === 'uncategorized'
                  ? 'bg-[#0E7A3A] text-white'
                  : 'bg-white border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Uncategorized ({categoryCounts.get('uncategorized') || 0})
            </button>
          )}
        </div>

        {/* Warehouse Selector (only in Inventory pillar) */}
        {/* TODO: Connect to multi-warehouse inventory once warehouse management is fully implemented */}
        {selectedPillar === 'inventory' && warehouses.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pt-3 sm:pt-4">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground flex-shrink-0">Warehouse:</span>
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="w-full sm:w-48 h-9 text-sm">
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

      <CardContent className="p-3 sm:p-4 md:p-6">
        {products.length === 0 ? (
          <div className="text-center py-8 sm:py-12 px-4">
            <p className="text-sm sm:text-base text-muted-foreground mb-4">No products in this category</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {products.map((product) => {
              const isExpanded = expandedProducts.has(product.id);
              const totalQty = getProductQuantity(product);
              const minPrice = product.variants.length > 0 
                ? Math.min(...product.variants.map(v => v.price || 0).filter(p => p > 0))
                : product.base_price || 0;

              return (
                <div key={product.id} className="border rounded-lg overflow-hidden" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                  {/* Product Header */}
                  <div className="p-2.5 sm:p-3 md:p-4 bg-white">
                    <div className="flex items-start justify-between gap-2 sm:gap-3">
                      <button
                        onClick={() => toggleProduct(product.id)}
                        className="flex items-start gap-1.5 sm:gap-2 flex-1 text-left min-w-0"
                      >
                        {product.variants.length > 1 ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" style={{ color: '#0E7A3A' }} />
                          ) : (
                            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" style={{ color: '#0E7A3A' }} />
                          )
                        ) : (
                          <div className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-base font-semibold truncate" style={{ color: '#0F1F17' }}>
                            {product.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
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
                      <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                        <div className="text-right">
                          {selectedPillar === 'catalog' ? (
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
                          ) : (
                            <>
                              <div className="text-sm sm:text-base font-semibold whitespace-nowrap" style={{ color: '#0F1F17' }}>
                                ({totalQty})
                              </div>
                              <div className="text-xs text-muted-foreground whitespace-nowrap">
                                Stock
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex gap-0.5 sm:gap-1">
                          {!isExpanded && product.variants.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
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
                            onClick={() => navigate(`/app/products/${product.id}/edit`)}
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
                        selectedPillar={selectedPillar}
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
  selectedPillar: 'catalog' | 'inventory';
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
  selectedPillar,
}: VariantHierarchyProps) {
  // Helper function for case-insensitive option name matching
  const findMatchingOptionName = (optionNames: string[], targetName: string): string | null => {
    const exactMatch = optionNames.find(name => name === targetName);
    if (exactMatch) return exactMatch;
    
    // Try case-insensitive match
    const lowerTarget = targetName.toLowerCase();
    return optionNames.find(name => name.toLowerCase() === lowerTarget) || null;
  };
  
  // Helper function to get option value with case-insensitive fallback
  const getOptionValue = (variantName: string, optionName: string, availableNames: string[]): string | null => {
    // Try exact match first
    const exactValue = getVariantOptionValue(variantName, optionName);
    if (exactValue) return exactValue;
    
    // Try case-insensitive match
    const matchedName = findMatchingOptionName(availableNames, optionName);
    if (matchedName && matchedName !== optionName) {
      return getVariantOptionValue(variantName, matchedName);
    }
    
    return null;
  };
  
  // Compute effective rank options per product
  const { effectiveRank1, effectiveRank2, availableOptionNames } = useMemo(() => {
    const variantNames = variants.map(v => v.name).filter(Boolean);
    const optionNames = getUniqueVariantOptionNames(variantNames);
    
    // Pick effectiveRank1
    let rank1Effective: string | null = null;
    const matchedRank1 = findMatchingOptionName(optionNames, rank1);
    if (matchedRank1) {
      rank1Effective = matchedRank1;
    } else if (optionNames.length > 0) {
      rank1Effective = optionNames[0];
    }
    
    // Pick effectiveRank2
    let rank2Effective: string | null = null;
    const matchedRank2 = findMatchingOptionName(optionNames, rank2);
    if (matchedRank2 && matchedRank2 !== rank1Effective) {
      rank2Effective = matchedRank2;
    } else {
      // Use the next available optionName not equal to effectiveRank1
      const nextOption = optionNames.find(name => name !== rank1Effective);
      if (nextOption) {
        rank2Effective = nextOption;
      }
    }
    
    return {
      effectiveRank1: rank1Effective,
      effectiveRank2: rank2Effective,
      availableOptionNames: optionNames,
    };
  }, [variants, rank1, rank2]);

  if (variants.length === 0) {
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
      <div className="py-2 flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm min-w-0 truncate">{variant.name}</span>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {selectedPillar === 'catalog' ? (
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">HK${(variant.price || 0).toFixed(2)}</span>
          ) : (
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">({qty})</span>
          )}
        </div>
      </div>
    );
  }

  // Group variants by rank1 with smart detection
  const rank1Groups = useMemo(() => {
    if (!effectiveRank1) {
      // No structured options detected, show flat list
      return null;
    }
    
    const groups = new Map<string, ProductVariant[]>();
    const missingGroup: ProductVariant[] = [];
    
    for (const variant of variants) {
      const rank1Value = getOptionValue(variant.name, effectiveRank1, availableOptionNames);
      if (rank1Value) {
        if (!groups.has(rank1Value)) {
          groups.set(rank1Value, []);
        }
        groups.get(rank1Value)!.push(variant);
      } else {
        missingGroup.push(variant);
      }
    }
    
    const hasSomeValues = groups.size > 0;
    const hasMissing = missingGroup.length > 0;
    
    // If no variants have rank1 values, return null to render flat list
    if (!hasSomeValues) {
      return null;
    }
    
    // If some variants are missing rank1, add them to "Default" group
    if (hasMissing) {
      groups.set('Default', missingGroup);
    }
    
    return Array.from(groups.entries()).sort(([a], [b]) => {
      // Sort "Default" to the end
      if (a === 'Default') return 1;
      if (b === 'Default') return -1;
      return a.localeCompare(b);
    });
  }, [variants, effectiveRank1, availableOptionNames]);

  // If no rank1 grouping possible, show flat list
  if (!rank1Groups) {
    return (
      <div className="space-y-1 py-2">
        {variants.map(variant => {
          const qty = getVariantQuantity(variant.id, inventoryItems);
          return (
            <div key={variant.id} className="flex items-center justify-between py-1 sm:py-1.5 px-1.5 sm:px-2 rounded hover:bg-muted/20 gap-2">
              <span className="text-xs sm:text-sm min-w-0 truncate">{variant.name}</span>
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {selectedPillar === 'catalog' ? (
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">HK${(variant.price || 0).toFixed(2)}</span>
                ) : (
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">({qty})</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 sm:space-y-2 py-2">
      {rank1Groups.map(([rank1Value, groupVariants]) => {
        const groupKey = `${productId}:${rank1Value}`;
        const isExpanded = expandedRank1Groups.has(groupKey);
        const groupTotal = groupVariants.reduce((sum, v) => sum + getVariantQuantity(v.id, inventoryItems), 0);

        return (
          <div key={groupKey} className="border rounded-lg overflow-hidden" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'white' }}>
            {/* Rank1 Header */}
            <button
              onClick={() => toggleRank1Group(groupKey)}
              className="w-full flex items-center justify-between p-1.5 sm:p-2 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" style={{ color: '#0E7A3A' }} />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" style={{ color: '#0E7A3A' }} />
                )}
                <span className="text-xs sm:text-sm font-medium truncate">
                  {effectiveRank1}: {rank1Value}
                </span>
              </div>
              {showQuantity && <span className="text-xs sm:text-sm font-semibold flex-shrink-0 whitespace-nowrap">({groupTotal})</span>}
            </button>

            {/* Rank2 or Leaf Variants */}
            {isExpanded && (
              <div className="border-t px-3 sm:px-6 py-1.5 sm:py-2 space-y-1" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                {(() => {
                  // Check if rank2 grouping is possible
                  if (!effectiveRank2) {
                    // No rank2, render leaf variant rows
                    return groupVariants.map(variant => {
                      const qty = getVariantQuantity(variant.id, inventoryItems);
                      // Extract remaining option for display (skip rank1)
                      const options = parseVariantName(variant.name);
                      const remainingOption = options.find(opt => opt.name !== effectiveRank1);
                      const displayLabel = remainingOption 
                        ? `${remainingOption.name}: ${remainingOption.value}`
                        : variant.name;
                      
                      return (
                        <div key={variant.id} className="flex items-center justify-between py-1 sm:py-1.5 px-1.5 sm:px-2 rounded hover:bg-muted/20 gap-2">
                          <span className="text-xs sm:text-sm min-w-0 truncate">{displayLabel}</span>
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            {selectedPillar === 'catalog' ? (
                              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">HK${(variant.price || 0).toFixed(2)}</span>
                            ) : (
                              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">({qty})</span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  }
                  
                  // Group by rank2
                  const rank2Groups = new Map<string, ProductVariant[]>();
                  const rank2MissingGroup: ProductVariant[] = [];
                  
                  for (const variant of groupVariants) {
                    const rank2Value = getOptionValue(variant.name, effectiveRank2, availableOptionNames);
                    if (rank2Value) {
                      if (!rank2Groups.has(rank2Value)) {
                        rank2Groups.set(rank2Value, []);
                      }
                      rank2Groups.get(rank2Value)!.push(variant);
                    } else {
                      rank2MissingGroup.push(variant);
                    }
                  }
                  
                  const hasRank2Values = rank2Groups.size > 0;
                  const hasRank2Missing = rank2MissingGroup.length > 0;
                  
                  // If no variants have rank2 values, render leaf variant rows
                  if (!hasRank2Values) {
                    return groupVariants.map(variant => {
                      const qty = getVariantQuantity(variant.id, inventoryItems);
                      const options = parseVariantName(variant.name);
                      const remainingOption = options.find(opt => opt.name !== effectiveRank1);
                      const displayLabel = remainingOption 
                        ? `${remainingOption.name}: ${remainingOption.value}`
                        : variant.name;
                      
                      return (
                        <div key={variant.id} className="flex items-center justify-between py-1 sm:py-1.5 px-1.5 sm:px-2 rounded hover:bg-muted/20 gap-2">
                          <span className="text-xs sm:text-sm min-w-0 truncate">{displayLabel}</span>
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            {selectedPillar === 'catalog' ? (
                              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">HK${(variant.price || 0).toFixed(2)}</span>
                            ) : (
                              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">({qty})</span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  }
                  
                  // Add missing rank2 variants to "Default" group if needed
                  if (hasRank2Missing) {
                    rank2Groups.set('Default', rank2MissingGroup);
                  }
                  
                  return Array.from(rank2Groups.entries())
                    .sort(([a], [b]) => {
                      // Sort "Default" to the end
                      if (a === 'Default') return 1;
                      if (b === 'Default') return -1;
                      return a.localeCompare(b);
                    })
                    .map(([rank2Value, rank2Variants]) => {
                      const rank2Total = rank2Variants.reduce((sum, v) => sum + getVariantQuantity(v.id, inventoryItems), 0);
                      const avgPrice = rank2Variants.reduce((sum, v) => sum + (v.price || 0), 0) / rank2Variants.length;
                      
                      return (
                        <div key={rank2Value} className="flex items-center justify-between py-1 sm:py-1.5 px-1.5 sm:px-2 rounded hover:bg-muted/20 gap-2">
                          <span className="text-xs sm:text-sm min-w-0 truncate">
                            {effectiveRank2}: {rank2Value}
                          </span>
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            {selectedPillar === 'catalog' ? (
                              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">HK${avgPrice.toFixed(2)}</span>
                            ) : (
                              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">({rank2Total})</span>
                            )}
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
