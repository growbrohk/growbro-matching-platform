import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, ChevronDown, ChevronRight, ChevronsDown, Pencil, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCategories, type ProductCategory } from '@/lib/api/categories-and-tags';
import { getProducts } from '@/lib/api/products';
import { getVariantConfig } from '@/lib/api/variant-config';
import { getVariantOptionValue, parseVariantName, getUniqueVariantOptionNames } from '@/lib/utils/variant-parser';
import type { Product } from '@/lib/types';
import { InventoryPanel } from '@/components/catalog/InventoryPanel';

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
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
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
    } as const;
  }, []);

  useEffect(() => {
    if (!currentOrg) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch categories, warehouses, and variant config in parallel
        const [categoriesData, warehousesResult, variantConfigData] = await Promise.all([
          getCategories(currentOrg.id),
          supabase
            .from('warehouses')
            .select('id, name')
            .eq('org_id', currentOrg.id)
            .order('created_at', { ascending: true }),
          getVariantConfig(currentOrg.id),
        ]);

        setCategories(categoriesData);
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
        
        // Build products with details
        const productsWithDetails = productsData.map((product) => {
          const productVariants = allVariants.filter(v => v.product_id === product.id);
          const variantIds = productVariants.map(v => v.id);
          const productInventory = allInventoryItems.filter(i => variantIds.includes(i.variant_id));
          
          return {
            ...product,
            variants: productVariants,
            inventoryItems: productInventory,
          };
        });
        
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

  // Filter products by selected category, tab, and search query
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    // Filter by type based on tab
    if (selectedTab === 'physical') {
      filtered = filtered.filter(p => p.type === 'physical');
    } else if (selectedTab === 'event_tickets') {
      // Event tickets would be a different type or have specific metadata
      filtered = []; // Placeholder - no event tickets in current schema
    } else if (selectedTab === 'space_booking') {
      // Space booking removed - no venue_asset products anymore
      filtered = [];
    }
    
    // Filter by category
    if (selectedCategoryId !== 'all') {
      if (selectedCategoryId === 'uncategorized') {
        filtered = filtered.filter(p => !p.category_id);
      } else {
        filtered = filtered.filter(p => p.category_id === selectedCategoryId);
      }
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.variants.some(v => v.sku?.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [products, selectedCategoryId, selectedTab, searchQuery]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    
    // Count products by type for the selected tab
    let relevantProducts = products;
    if (selectedTab === 'physical') {
      relevantProducts = products.filter(p => p.type === 'physical');
    } else if (selectedTab === 'space_booking') {
      // Space booking removed - no venue_asset products anymore
      relevantProducts = [];
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
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
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
    <div className={`w-full min-w-0 ${isEmbeddedInCatalog ? 'px-4 py-6' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} space-y-4 md:space-y-6`}>
      {/* Tabs - Only show when NOT embedded in Catalog */}
      {!isEmbeddedInCatalog && (
        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)} className="w-full">
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-grid">
            <TabsTrigger value="physical">Products</TabsTrigger>
            <TabsTrigger value="event_tickets">Event Tickets</TabsTrigger>
            <TabsTrigger value="space_booking">Space Booking</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Toolbar: Search + Edit + Add Product */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/app/settings/catalog')}
            className="h-9 w-9 sm:w-auto sm:px-3"
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
            className="h-9 w-9 sm:w-auto sm:px-3"
            title="Add new product"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline sm:ml-2">Add Product</span>
          </Button>
        </div>
      </div>

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
  const { currentOrg } = useAuth();

  // If inventory pillar is selected, render InventoryPanel
  if (selectedPillar === 'inventory') {
    return (
      <div className="space-y-4 md:space-y-6">
        <Card className="rounded-3xl border overflow-hidden" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader className="p-3 sm:p-4 md:p-6 pb-0">
            {/* Pillar Tabs (Catalog / Inventory) */}
            <Tabs value={selectedPillar} onValueChange={(v) => setSelectedPillar(v as 'catalog' | 'inventory')} className="w-full">
              <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-grid mb-4">
                <TabsTrigger value="catalog">Catalog</TabsTrigger>
                <TabsTrigger value="inventory">Inventory</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
        </Card>
        {currentOrg?.id ? (
          <InventoryPanel orgId={currentOrg.id} />
        ) : (
          <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardContent className="flex flex-col items-center justify-center py-12 p-4 md:p-6">
              <p className="text-muted-foreground">No organization selected</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Catalog pillar - render existing catalog view
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
                            <Badge variant="outline" className="text-xs">
                              {productTypeLabel[product.type] || product.type}
                            </Badge>
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                        <div className="text-right">
                          {/* Catalog pillar - show price */}
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
                      <VariantCombinationsTable
                        variants={product.variants}
                        inventoryItems={product.inventoryItems}
                        getVariantQuantity={getVariantQuantity}
                        basePrice={product.base_price}
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

// Component for rendering Excel-style variant combinations table (read-only)
interface VariantCombinationsTableProps {
  variants: ProductVariant[];
  inventoryItems: InventoryItem[];
  getVariantQuantity: (variantId: string, inventoryItems: InventoryItem[]) => number;
  basePrice: number | null;
}

function VariantCombinationsTable({
  variants,
  inventoryItems,
  getVariantQuantity,
  basePrice,
}: VariantCombinationsTableProps) {
  if (variants.length === 0) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        No variants available
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="bg-muted/50 border-t">
            <th className="sticky top-0 z-10 bg-muted/50 p-0 border text-[11px] w-[88px]">Variant</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[48px]">Stock</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[56px]">Price</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 border text-[11px] w-[96px]">SKU</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-center text-muted-foreground w-[40px]">Active</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => {
            const stock = getVariantQuantity(variant.id, inventoryItems);
            const price = variant.price ?? basePrice ?? 0;
            
            return (
              <tr key={variant.id} className="border-t hover:bg-muted/30 even:bg-muted/10">
                <td className="p-0 border w-[88px]">
                  <span className="block px-1 py-0 text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {variant.name}
                  </span>
                </td>
                <td className="p-0 border w-[48px]">
                  <span className="block px-1 py-0 text-xs leading-tight">
                    {stock}
                  </span>
                </td>
                <td className="p-0 border w-[56px]">
                  <span className="block px-1 py-0 text-xs leading-tight">
                    {price.toFixed(2)}
                  </span>
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
