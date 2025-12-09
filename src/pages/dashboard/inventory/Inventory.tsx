import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Package, Plus, Save, Warehouse, Store, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '@/lib/types';
import { ProductVariation } from '@/lib/types/variable-products';
import { getProductVariations, updateVariationInventory } from '@/lib/api/variable-products';
import { VariableInventoryView } from './VariableInventoryView';

interface ProductInventory {
  id: string;
  product_id: string;
  inventory_location_id: string;
  stock_quantity: number;
  reserved_quantity: number;
  inventory_location?: InventoryLocation;
  products?: {
    id: string;
    name: string;
    thumbnail_url?: string;
    owner_type: string;
  };
}

export interface InventoryLocation {
  id: string;
  type: string;
  name: string;
  venue_user_id?: string;
  is_active: boolean;
}

export interface ProductWithInventory extends Product {
  product_inventory: (ProductInventory & { inventory_location: InventoryLocation })[];
}

export default function Inventory() {
  const { profile } = useAuth();
  const [allProducts, setAllProducts] = useState<ProductWithInventory[]>([]);
  const [venueInventory, setVenueInventory] = useState<ProductInventory[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newWarehouseOpen, setNewWarehouseOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [productVariations, setProductVariations] = useState<Record<string, ProductVariation[]>>({});
  const [variationInventory, setVariationInventory] = useState<Record<string, Record<string, number>>>({}); // Format: {variationId: {locationId: stock}}
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedColors, setExpandedColors] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('simple');

  useEffect(() => {
    if (profile) {
      fetchData();
    }
  }, [profile]);

  async function fetchData() {
    if (!profile) return;

    setLoading(true);
    try {
      // Fetch brand products with inventory (all users)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          product_inventory(*, inventory_location:inventory_locations(*))
        `)
        .eq('owner_user_id', profile.id)
        .eq('owner_type', 'brand');

      if (productsError) throw productsError;
      if (productsData) {
        const productsWithInventory = productsData as unknown as ProductWithInventory[];
        setAllProducts(productsWithInventory);
        
        // Fetch variations for variable products in parallel
        const variableProducts = productsWithInventory.filter(p => p.product_type === 'variable');
        const variationsMap: Record<string, ProductVariation[]> = {};
        const variationInvMap: Record<string, Record<string, number>> = {};
        
        // Batch fetch all variations in parallel
        const variationPromises = variableProducts.map(async (product) => {
          const { data: varsData } = await getProductVariations(product.id);
          return { productId: product.id, varsData: varsData || [] };
        });
        
        const variationResults = await Promise.all(variationPromises);
        
        // Collect all variation IDs for batch inventory fetch
        const allVariationIds: string[] = [];
        variationResults.forEach(({ productId, varsData }) => {
          if (varsData.length > 0) {
            variationsMap[productId] = varsData;
            varsData.forEach(v => allVariationIds.push(v.id));
          }
        });
        
        // Batch fetch all variation inventory in one query
        if (allVariationIds.length > 0) {
          const { data: allVariationInvData } = await supabase
            .from('product_variation_inventory')
            .select('product_variation_id, inventory_location_id, stock_quantity')
            .in('product_variation_id', allVariationIds);
          
          if (allVariationInvData) {
            allVariationInvData.forEach((inv) => {
              if (!variationInvMap[inv.product_variation_id]) {
                variationInvMap[inv.product_variation_id] = {};
              }
              variationInvMap[inv.product_variation_id][inv.inventory_location_id] = inv.stock_quantity || 0;
            });
          }
        }
        
        setProductVariations(variationsMap);
        setVariationInventory(variationInvMap);
      }

      // Fetch all active locations
      const { data: locationsData, error: locationsError } = await supabase
        .from('inventory_locations')
        .select('*')
        .eq('is_active', true);

      if (locationsError) throw locationsError;
      if (locationsData) {
        setLocations(locationsData as unknown as InventoryLocation[]);
      }

      // Fetch venue inventory (only if user is venue)
      if (profile.is_venue) {
        const { data: venueInvData, error: venueInvError } = await supabase
          .from('product_inventory')
          .select(`
            *,
            inventory_location:inventory_locations(*),
            products(id, name, thumbnail_url, owner_type)
          `)
          .eq('inventory_locations.venue_user_id', profile.id);

        if (venueInvError) throw venueInvError;
        if (venueInvData) {
          setVenueInventory(venueInvData as unknown as ProductInventory[]);
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }

  async function createWarehouse() {
    if (!newWarehouseName.trim() || !profile) return;

    const { error } = await supabase
      .from('inventory_locations')
      .insert({
        type: 'warehouse',
        name: newWarehouseName.trim(),
        is_active: true,
      });

    if (error) {
      toast.error('Failed to create warehouse');
    } else {
      toast.success('Warehouse created');
      setNewWarehouseName('');
      setNewWarehouseOpen(false);
      fetchData();
    }
  }

  async function updateStock(productId: string, locationId: string, quantity: number, variationId?: string) {
    if (!profile) return;

    const savingKey = variationId ? `${variationId}-${locationId}` : `${productId}-${locationId}`;
    setSaving(savingKey);

    if (variationId) {
      // Update variation inventory using the API
      const { error } = await updateVariationInventory(variationId, locationId, quantity, 0);

      if (error) {
        toast.error('Failed to update variation stock');
      } else {
        toast.success('Variation stock updated');
        fetchData();
      }
    } else {
      // Update simple product inventory
      const { error } = await supabase
        .from('product_inventory')
        .upsert(
          {
            product_id: productId,
            inventory_location_id: locationId,
            stock_quantity: quantity,
          },
          { onConflict: 'product_id,inventory_location_id' }
        );

      if (error) {
        toast.error('Failed to update stock');
      } else {
        toast.success('Stock updated');
        fetchData();
      }
    }
    setSaving(null);
  }

  const toggleProductExpansion = (productId: string) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const toggleColorExpansion = (productId: string, color: string) => {
    const key = `${productId}-${color}`;
    const newExpanded = new Set(expandedColors);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedColors(newExpanded);
  };

  const simpleProducts = allProducts.filter(p => p.product_type === 'simple' || !p.product_type);
  const variableProducts = allProducts.filter(p => p.product_type === 'variable');
  const eventProducts = allProducts.filter(p => p.product_type === 'event');

  async function addProductToLocation() {
    if (!selectedProduct || !selectedLocationId || !profile) return;

    const { error } = await supabase.from('product_inventory').upsert(
      {
        product_id: selectedProduct,
        inventory_location_id: selectedLocationId,
        stock_quantity: 0,
      },
      { onConflict: 'product_id,inventory_location_id' }
    );

    if (error) {
      toast.error('Failed to add product to location');
    } else {
      toast.success('Product added to location');
      setAddLocationOpen(false);
      setSelectedProduct(null);
      setSelectedLocationId('');
      fetchData();
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-4 md:py-8 px-4">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventory</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Manage product inventory across locations
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <TabsList className="inline-flex w-full md:w-auto min-w-max">
                  <TabsTrigger value="simple" className="whitespace-nowrap flex-shrink-0">
                    Simple Products ({simpleProducts.length})
                  </TabsTrigger>
                  <TabsTrigger value="variable" className="whitespace-nowrap flex-shrink-0">
                    Variable Products ({variableProducts.length})
                  </TabsTrigger>
                  <TabsTrigger value="event" className="whitespace-nowrap flex-shrink-0">
                    Event Tickets ({eventProducts.length})
                  </TabsTrigger>
                  {profile?.is_venue && (
                    <TabsTrigger value="venue" className="whitespace-nowrap flex-shrink-0">
                      Venue Inventory ({venueInventory.length})
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <TabsContent value="simple" className="mt-6">
                <CardContent className="p-2 md:p-6">
                  <BrandInventoryView
                    products={simpleProducts}
                    locations={locations}
                    onUpdateStock={updateStock}
                    saving={saving}
                    onCreateWarehouse={createWarehouse}
                    newWarehouseName={newWarehouseName}
                    setNewWarehouseName={setNewWarehouseName}
                    newWarehouseOpen={newWarehouseOpen}
                    setNewWarehouseOpen={setNewWarehouseOpen}
                    onAddProductToLocation={addProductToLocation}
                    addLocationOpen={addLocationOpen}
                    setAddLocationOpen={setAddLocationOpen}
                    selectedProduct={selectedProduct}
                    setSelectedProduct={setSelectedProduct}
                    selectedLocationId={selectedLocationId}
                    setSelectedLocationId={setSelectedLocationId}
                  />
                </CardContent>
              </TabsContent>

              <TabsContent value="variable" className="mt-6">
                <CardContent className="p-2 md:p-6">
                  <VariableInventoryView
                    products={variableProducts}
                    locations={locations}
                    onUpdateStock={updateStock}
                    saving={saving}
                    productVariations={productVariations}
                    variationInventory={variationInventory}
                    expandedProducts={expandedProducts}
                    expandedColors={expandedColors}
                    onToggleExpansion={toggleProductExpansion}
                    onToggleColorExpansion={toggleColorExpansion}
                  />
                </CardContent>
              </TabsContent>

              <TabsContent value="event" className="mt-6">
                <CardContent className="p-2 md:p-6">
                  <BrandInventoryView
                    products={eventProducts}
                    locations={locations}
                    onUpdateStock={updateStock}
                    saving={saving}
                    onCreateWarehouse={createWarehouse}
                    newWarehouseName={newWarehouseName}
                    setNewWarehouseName={setNewWarehouseName}
                    newWarehouseOpen={newWarehouseOpen}
                    setNewWarehouseOpen={setNewWarehouseOpen}
                    onAddProductToLocation={addProductToLocation}
                    addLocationOpen={addLocationOpen}
                    setAddLocationOpen={setAddLocationOpen}
                    selectedProduct={selectedProduct}
                    setSelectedProduct={setSelectedProduct}
                    selectedLocationId={selectedLocationId}
                    setSelectedLocationId={setSelectedLocationId}
                  />
                </CardContent>
              </TabsContent>

              {profile?.is_venue && (
                <TabsContent value="venue" className="mt-6">
                  <CardContent className="p-2 md:p-6">
                    <VenueInventoryView inventory={venueInventory} />
                  </CardContent>
                </TabsContent>
              )}
            </Tabs>
          </CardHeader>
        </Card>
      </div>
    </Layout>
  );
}

// Brand Inventory View Component
interface BrandInventoryViewProps {
  products: ProductWithInventory[];
  locations: InventoryLocation[];
  onUpdateStock: (productId: string, locationId: string, quantity: number) => void;
  saving: string | null;
  onCreateWarehouse: () => void;
  newWarehouseName: string;
  setNewWarehouseName: (name: string) => void;
  newWarehouseOpen: boolean;
  setNewWarehouseOpen: (open: boolean) => void;
  onAddProductToLocation: () => void;
  addLocationOpen: boolean;
  setAddLocationOpen: (open: boolean) => void;
  selectedProduct: string | null;
  setSelectedProduct: (product: string | null) => void;
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
}

function BrandInventoryView({
  products,
  locations,
  onUpdateStock,
  saving,
  onCreateWarehouse,
  newWarehouseName,
  setNewWarehouseName,
  newWarehouseOpen,
  setNewWarehouseOpen,
  onAddProductToLocation,
  addLocationOpen,
  setAddLocationOpen,
  selectedProduct,
  setSelectedProduct,
  selectedLocationId,
  setSelectedLocationId,
}: BrandInventoryViewProps) {
  const warehouses = locations.filter((loc) => loc.type === 'warehouse');

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-0">
        <h2 className="text-lg md:text-xl font-semibold">Product Inventory</h2>
        <div className="flex gap-2">
          <Dialog open={newWarehouseOpen} onOpenChange={setNewWarehouseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs md:text-sm">
                <Warehouse className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">New Warehouse</span>
                <span className="sm:hidden">Warehouse</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Warehouse</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Warehouse Name</Label>
                  <Input
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                    placeholder="Main Warehouse"
                  />
                </div>
                <Button onClick={onCreateWarehouse} className="w-full">
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 md:py-12">
          <p className="text-sm md:text-base text-muted-foreground">No products with inventory yet</p>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          {products.map((product) => (
            <Card key={product.id} className="border">
              <CardHeader className="p-3 md:p-6">
                <div className="flex items-center gap-2 md:gap-3">
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
              <CardContent className="p-3 md:p-6 pt-0">
                <div className="space-y-2 md:space-y-4">
                  {warehouses.length === 0 ? (
                    <p className="text-xs md:text-sm text-muted-foreground">No warehouses available</p>
                  ) : (
                    warehouses.map((warehouse) => {
                      const inventory = product.product_inventory?.find(
                        (inv) => inv.inventory_location_id === warehouse.id
                      );
                      const stock = inventory?.stock_quantity || 0;
                      const key = `${product.id}-${warehouse.id}`;

                      return (
                        <div key={warehouse.id} className="flex items-center gap-2 md:gap-4 py-1 md:py-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 md:gap-2">
                              <Warehouse className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-xs md:text-sm truncate">{warehouse.name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                            <Input
                              type="number"
                              value={stock}
                              onChange={(e) =>
                                onUpdateStock(product.id, warehouse.id, parseInt(e.target.value) || 0)
                              }
                              className="w-16 md:w-24 h-7 md:h-10 text-xs md:text-sm"
                              disabled={saving === key}
                            />
                            <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">units</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Venue Inventory View Component
interface VenueInventoryViewProps {
  inventory: ProductInventory[];
}

function VenueInventoryView({ inventory }: VenueInventoryViewProps) {
  if (inventory.length === 0) {
    return (
      <div className="text-center py-8 md:py-12">
        <p className="text-sm md:text-base text-muted-foreground">No inventory at your venue yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h2 className="text-lg md:text-xl font-semibold">Venue Inventory</h2>
      <div className="space-y-2 md:space-y-4">
        {inventory.map((item) => (
          <Card key={item.id} className="border">
            <CardContent className="p-3 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                  {item.products?.thumbnail_url ? (
                    <img
                      src={item.products.thumbnail_url}
                      alt={item.products.name}
                      className="w-8 h-8 md:w-12 md:h-12 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 md:w-12 md:h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Package className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs md:text-sm truncate">{item.products?.name || 'Unknown Product'}</p>
                    <p className="text-[10px] md:text-sm text-muted-foreground truncate">
                      {item.inventory_location?.name || 'Unknown Location'}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-sm md:text-base">{item.stock_quantity}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">in stock</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

