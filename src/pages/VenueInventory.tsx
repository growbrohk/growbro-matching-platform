import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ProductInventory, InventoryLocation } from '@/lib/shop-types';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Package, Store } from 'lucide-react';
import { toast } from 'sonner';

interface InventoryWithProduct extends ProductInventory {
  products: {
    id: string;
    name: string;
    thumbnail_url?: string;
    brand_user_id: string;
    profiles: {
      display_name: string;
    };
  };
}

export default function VenueInventory() {
  const { profile } = useAuth();
  const [inventory, setInventory] = useState<InventoryWithProduct[]>([]);
  const [location, setLocation] = useState<InventoryLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role === 'venue') {
      fetchData();
    }
  }, [profile]);

  async function fetchData() {
    // Get venue's location
    const { data: locData } = await supabase
      .from('inventory_locations')
      .select('*')
      .eq('venue_user_id', profile!.id)
      .eq('type', 'venue')
      .maybeSingle();

    if (locData) {
      setLocation(locData as unknown as InventoryLocation);

      // Get inventory at this location
      const { data: invData } = await supabase
        .from('product_inventory')
        .select(`
          *,
          products(id, name, thumbnail_url, brand_user_id, profiles:profiles!products_brand_user_id_fkey(display_name))
        `)
        .eq('inventory_location_id', locData.id);

      if (invData) {
        setInventory(invData as unknown as InventoryWithProduct[]);
      }
    }
    setLoading(false);
  }

  async function updateStock(inventoryId: string, quantity: number) {
    setSaving(inventoryId);

    const { error } = await supabase
      .from('product_inventory')
      .update({ stock_quantity: quantity })
      .eq('id', inventoryId);

    if (error) {
      toast.error('Failed to update stock');
    } else {
      toast.success('Stock updated');
    }
    setSaving(null);
  }

  if (profile?.role !== 'venue') {
    return (
      <Layout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">This page is for venues only.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">My Venue Inventory</h1>
          <p className="text-muted-foreground">
            Manage stock for products at your venue
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !location ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No inventory location set up for your venue yet.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Locations are created when brands set up consignment with your venue.
              </p>
            </CardContent>
          </Card>
        ) : inventory.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No products stocked at your venue yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                {location.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {inventory.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg"
                  >
                    {inv.products?.thumbnail_url ? (
                      <img
                        src={inv.products.thumbnail_url}
                        alt={inv.products.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{inv.products?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        by {inv.products?.profiles?.display_name}
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
                            updateStock(inv.id, val);
                          }
                        }}
                      />
                      {saving === inv.id && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
