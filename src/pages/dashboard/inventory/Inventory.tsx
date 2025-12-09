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
import { Loader2, Package, Plus, Save, Warehouse, Store } from 'lucide-react';
import { toast } from 'sonner';

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

interface InventoryLocation {
  id: string;
  type: string;
  name: string;
  venue_user_id?: string;
  is_active: boolean;
}

interface ProductWithInventory {
  id: string;
  name: string;
  thumbnail_url?: string;
  owner_type: string;
  product_inventory: (ProductInventory & { inventory_location: InventoryLocation })[];
}

export default function Inventory() {
  const { profile } = useAuth();
  const [brandProducts, setBrandProducts] = useState<ProductWithInventory[]>([]);
  const [venueInventory, setVenueInventory] = useState<ProductInventory[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newWarehouseOpen, setNewWarehouseOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');

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
        setBrandProducts(productsData as unknown as ProductWithInventory[]);
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

  async function updateStock(productId: string, locationId: string, quantity: number) {
    if (!profile) return;

    setSaving(`${productId}-${locationId}`);

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
    setSaving(null);
  }

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
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Inventory</h1>
            <p className="text-muted-foreground mt-1">
              Manage product inventory across locations
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <Tabs defaultValue="brand" className="w-full">
              <TabsList>
                <TabsTrigger value="brand">
                  Brand Inventory ({brandProducts.length} products)
                </TabsTrigger>
                {profile?.is_venue && (
                  <TabsTrigger value="venue">
                    Venue Inventory ({venueInventory.length} items)
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="brand" className="mt-6">
                <CardContent>
                  <BrandInventoryView
                    products={brandProducts}
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
                  <CardContent>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Brand Product Inventory</h2>
        <div className="flex gap-2">
          <Dialog open={newWarehouseOpen} onOpenChange={setNewWarehouseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Warehouse className="mr-2 h-4 w-4" />
                New Warehouse
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
        <div className="text-center py-12">
          <p className="text-muted-foreground">No products with inventory yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {products.map((product) => (
            <Card key={product.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  {product.thumbnail_url ? (
                    <img
                      src={product.thumbnail_url}
                      alt={product.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-lg">{product.name}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {warehouses.map((warehouse) => {
                    const inventory = product.product_inventory?.find(
                      (inv) => inv.inventory_location_id === warehouse.id
                    );
                    const stock = inventory?.stock_quantity || 0;
                    const key = `${product.id}-${warehouse.id}`;

                    return (
                      <div key={warehouse.id} className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Warehouse className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{warehouse.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={stock}
                            onChange={(e) =>
                              onUpdateStock(product.id, warehouse.id, parseInt(e.target.value) || 0)
                            }
                            className="w-24"
                            disabled={saving === key}
                          />
                          <span className="text-sm text-muted-foreground">units</span>
                        </div>
                      </div>
                    );
                  })}
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
      <div className="text-center py-12">
        <p className="text-muted-foreground">No inventory at your venue yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Venue Inventory</h2>
      <div className="space-y-4">
        {inventory.map((item) => (
          <Card key={item.id}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {item.products?.thumbnail_url ? (
                    <img
                      src={item.products.thumbnail_url}
                      alt={item.products.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{item.products?.name || 'Unknown Product'}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.inventory_location?.name || 'Unknown Location'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{item.stock_quantity}</p>
                  <p className="text-xs text-muted-foreground">in stock</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

