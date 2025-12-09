import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ShopProduct, ProductInventory, InventoryLocation } from '@/lib/shop-types';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Package, Plus, Save, Warehouse, Store } from 'lucide-react';
import { toast } from 'sonner';

interface ProductWithInventory extends ShopProduct {
  product_inventory: (ProductInventory & { inventory_location: InventoryLocation })[];
}

export default function BrandInventory() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newWarehouseOpen, setNewWarehouseOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');

  useEffect(() => {
    if (profile?.role === 'brand') {
      fetchData();
    }
  }, [profile]);

  async function fetchData() {
    const [productsRes, locationsRes] = await Promise.all([
      supabase
        .from('products')
        .select(`
          *,
          product_inventory(*, inventory_location:inventory_locations(*))
        `)
        .eq('owner_user_id', profile!.id)
        .eq('owner_type', 'brand'),
      supabase
        .from('inventory_locations')
        .select('*')
        .eq('is_active', true),
    ]);

    if (productsRes.data) {
      setProducts(productsRes.data as unknown as ProductWithInventory[]);
    }
    if (locationsRes.data) {
      setLocations(locationsRes.data as unknown as InventoryLocation[]);
    }
    setLoading(false);
  }

  async function createWarehouse() {
    if (!newWarehouseName.trim()) return;

    const { data, error } = await supabase
      .from('inventory_locations')
      .insert({
        type: 'warehouse',
        name: newWarehouseName.trim(),
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create warehouse');
    } else {
      toast.success('Warehouse created');
      setLocations([...locations, data as unknown as InventoryLocation]);
      setNewWarehouseName('');
      setNewWarehouseOpen(false);
    }
  }

  async function updateStock(productId: string, locationId: string, quantity: number) {
    setSaving(`${productId}-${locationId}`);

    const { error } = await supabase
      .from('product_inventory')
      .upsert({
        product_id: productId,
        inventory_location_id: locationId,
        stock_quantity: quantity,
      }, { onConflict: 'product_id,inventory_location_id' });

    if (error) {
      toast.error('Failed to update stock');
    } else {
      toast.success('Stock updated');
      fetchData();
    }
    setSaving(null);
  }

  async function addLocationToProduct(productId: string) {
    if (!selectedLocationId) return;

    const { error } = await supabase
      .from('product_inventory')
      .insert({
        product_id: productId,
        inventory_location_id: selectedLocationId,
        stock_quantity: 0,
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('This location already exists for this product');
      } else {
        toast.error('Failed to add location');
      }
    } else {
      toast.success('Location added');
      fetchData();
    }
    setAddLocationOpen(false);
    setSelectedProduct(null);
    setSelectedLocationId('');
  }

  if (profile?.role !== 'brand') {
    return (
      <Layout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">This page is for brands only.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Inventory Management</h1>
            <p className="text-muted-foreground">Manage stock for your products across locations</p>
          </div>
          <Dialog open={newWarehouseOpen} onOpenChange={setNewWarehouseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Warehouse
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Warehouse Location</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Warehouse Name</Label>
                  <Input
                    placeholder="e.g. Central Warehouse"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                  />
                </div>
                <Button onClick={createWarehouse} disabled={!newWarehouseName.trim()}>
                  Create Warehouse
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : products.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No products yet. Create products first.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {products.map((product) => (
              <Card key={product.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      {product.thumbnail_url ? (
                        <img
                          src={product.thumbnail_url}
                          alt={product.name}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-lg">{product.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Total stock: {product.product_inventory?.reduce((sum, inv) => sum + inv.stock_quantity, 0) || 0}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedProduct(product.id);
                        setAddLocationOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Location
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {product.product_inventory?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No inventory locations yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {product.product_inventory?.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg"
                        >
                          {inv.inventory_location?.type === 'warehouse' ? (
                            <Warehouse className="h-5 w-5 text-primary" />
                          ) : (
                            <Store className="h-5 w-5 text-secondary-foreground" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{inv.inventory_location?.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {inv.inventory_location?.type}
                              {inv.inventory_location?.area && ` · ${inv.inventory_location.area}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              defaultValue={inv.stock_quantity}
                              className="w-20"
                              onBlur={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (val !== inv.stock_quantity) {
                                  updateStock(product.id, inv.inventory_location_id, val);
                                }
                              }}
                            />
                            {saving === `${product.id}-${inv.inventory_location_id}` && (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Location Dialog */}
        <Dialog open={addLocationOpen} onOpenChange={setAddLocationOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Inventory Location</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Select Location</Label>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name} ({loc.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => selectedProduct && addLocationToProduct(selectedProduct)}
                disabled={!selectedLocationId}
              >
                Add Location
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
