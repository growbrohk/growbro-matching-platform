import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ShopProduct, formatPrice } from '@/lib/shop-types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ShoppingBag, Store } from 'lucide-react';

export default function Shop() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        brand:profiles!products_brand_user_id_fkey(display_name, handle, avatar_url)
      `)
      .eq('is_public', true)
      .eq('is_purchasable', true)
      .eq('is_active', true);

    if (!error && data) {
      setProducts(data as unknown as ShopProduct[]);
    }
    setLoading(false);
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.brand?.display_name?.toLowerCase().includes(search.toLowerCase())
  );

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

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            Discover Local Brand Products
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Shop unique products from creative local brands, available at venues near you.
          </p>
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products or brands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No products found</h2>
            <p className="text-muted-foreground">
              {search ? 'Try a different search term.' : 'Check back soon for new products!'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((product) => (
              <Link key={product.id} to={`/shop/products/${product.slug || product.id}`}>
                <Card className="overflow-hidden card-hover h-full">
                  <div className="aspect-square bg-muted relative">
                    {product.thumbnail_url ? (
                      <img
                        src={product.thumbnail_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="h-12 w-12 text-muted-foreground/50" />
                      </div>
                    )}
                    {product.price_in_cents === 0 && (
                      <Badge className="absolute top-2 right-2 bg-secondary text-secondary-foreground">
                        Free
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-3 sm:p-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      {product.brand?.display_name}
                    </p>
                    <h3 className="font-semibold text-sm sm:text-base line-clamp-2 mb-1">
                      {product.name}
                    </h3>
                    <p className="font-bold text-primary">
                      {formatPrice(product.price_in_cents, product.currency)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-muted-foreground">
          <p>Growbro Shop — Connecting brands, venues, and customers.</p>
        </div>
      </footer>
    </div>
  );
}
