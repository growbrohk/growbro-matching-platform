import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ShopProduct as ShopProductType, ProductInventory, formatPrice } from '@/lib/shop-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Store, ChevronDown, ChevronUp, MapPin, ShoppingBag, Package, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function ShopProduct() {
  const { slug } = useParams();
  const [product, setProduct] = useState<ShopProductType | null>(null);
  const [inventory, setInventory] = useState<ProductInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  useEffect(() => {
    if (slug) fetchProduct();
  }, [slug]);

  async function fetchProduct() {
    // Try slug first, then id
    let query = supabase
      .from('products')
      .select(`
        *,
        brand:profiles!products_brand_user_id_fkey(display_name, handle, avatar_url)
      `)
      .eq('is_public', true)
      .eq('is_purchasable', true);

    const { data: bySlug } = await query.eq('slug', slug).maybeSingle();
    let productData = bySlug;

    if (!productData) {
      const { data: byId } = await supabase
        .from('products')
        .select(`
          *,
          brand:profiles!products_brand_user_id_fkey(display_name, handle, avatar_url)
        `)
        .eq('id', slug)
        .eq('is_public', true)
        .eq('is_purchasable', true)
        .maybeSingle();
      productData = byId;
    }

    if (productData) {
      setProduct(productData as unknown as ShopProductType);
      // Fetch inventory
      const { data: invData } = await supabase
        .from('product_inventory')
        .select(`
          *,
          inventory_location:inventory_locations(*)
        `)
        .eq('product_id', productData.id);

      if (invData) {
        setInventory(invData as unknown as ProductInventory[]);
      }
    }
    setLoading(false);
  }

  const totalStock = inventory.reduce((sum, inv) => sum + (inv.stock_quantity || 0), 0);
  const warehouseStock = inventory
    .filter(inv => inv.inventory_location?.type === 'warehouse')
    .reduce((sum, inv) => sum + (inv.stock_quantity || 0), 0);
  const venueInventory = inventory.filter(inv => inv.inventory_location?.type === 'venue' && inv.stock_quantity > 0);

  async function handleCheckout() {
    if (!product) return;

    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shop-checkout', {
        body: {
          product_id: product.id,
          quantity: 1,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      } else if (data?.order_id) {
        // Free order created
        toast.success('Order placed successfully!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setCheckoutLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Product not found</h1>
        <Link to="/shop">
          <Button variant="outline">Back to Shop</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/shop" className="flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">Growbro Shop</span>
          </Link>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Sign In
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Back link */}
        <Link to="/shop" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Shop
        </Link>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Product Image */}
          <div className="aspect-square bg-muted rounded-2xl overflow-hidden">
            {product.thumbnail_url ? (
              <img
                src={product.thumbnail_url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ShoppingBag className="h-20 w-20 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="flex flex-col">
            {product.brand && (
              <p className="text-sm text-muted-foreground mb-1">
                {product.brand.display_name}
              </p>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">{product.name}</h1>
            <p className="text-2xl sm:text-3xl font-bold text-primary mb-4">
              {formatPrice(product.price_in_cents, product.currency)}
            </p>

            {product.short_description && (
              <p className="text-muted-foreground mb-4">{product.short_description}</p>
            )}

            {product.category && (
              <Badge variant="secondary" className="w-fit mb-4">
                {product.category}
              </Badge>
            )}

            {/* Buy Button */}
            <Button
              size="lg"
              className="w-full mb-6"
              onClick={handleCheckout}
              disabled={checkoutLoading || totalStock === 0}
            >
              {checkoutLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {totalStock === 0 ? 'Out of Stock' : product.price_in_cents === 0 ? 'Get for Free' : 'Buy Now'}
            </Button>

            {/* Stock Locations */}
            <Card>
              <Collapsible open={stockOpen} onOpenChange={setStockOpen}>
                <CollapsibleTrigger asChild>
                  <button className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors rounded-lg">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">在門市尋找產品</p>
                        <p className="text-sm text-muted-foreground">
                          {totalStock > 0
                            ? `有存貨於 ${inventory.filter(i => i.stock_quantity > 0).length} 個地點 · ${totalStock} 件存貨`
                            : '暫無存貨'}
                        </p>
                      </div>
                    </div>
                    {stockOpen ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4">
                    <div className="border-t pt-4 space-y-3">
                      <p className="text-sm font-medium text-muted-foreground">分店</p>
                      
                      {/* Warehouse stock */}
                      {warehouseStock > 0 && (
                        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                          <Package className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">貨倉</p>
                            <p className="text-sm text-muted-foreground">
                              有存貨於 貨倉 {warehouseStock} 件存貨
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Venue stock */}
                      {venueInventory.map((inv) => (
                        <div key={inv.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                          <Store className="h-5 w-5 text-secondary-foreground" />
                          <div className="flex-1">
                            <p className="font-medium">{inv.inventory_location?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {inv.inventory_location?.area && `${inv.inventory_location.area} · `}
                              有存貨 {inv.stock_quantity} 件
                            </p>
                          </div>
                        </div>
                      ))}

                      {totalStock === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          暫無存貨
                        </p>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Full Description */}
            {product.full_description && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {product.full_description}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
