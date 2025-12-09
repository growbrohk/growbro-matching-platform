import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getMyProducts, deleteProduct } from '@/lib/api/products';
import { Product, PRODUCT_CLASS_LABELS, PRODUCT_CLASS_COLORS } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Products() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [brandProducts, setBrandProducts] = useState<Product[]>([]);
  const [venueProducts, setVenueProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Get active tab from URL or default to 'brand'
  const activeTab = searchParams.get('tab') || 'brand';

  useEffect(() => {
    if (profile) {
      fetchProducts();
    }
  }, [profile]);

  const fetchProducts = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Fetch brand products (all users)
      const { data: brandData, error: brandError } = await getMyProducts(profile, 'brand');
      if (brandError) throw brandError;
      setBrandProducts(brandData || []);

      // Fetch venue products (only if user is venue)
      if (profile.is_venue) {
        const { data: venueData, error: venueError } = await getMyProducts(profile, 'venue');
        if (venueError) throw venueError;
        setVenueProducts(venueData || []);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load products',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete || !profile) return;

    setDeletingId(productToDelete.id);
    try {
      const { error } = await deleteProduct(productToDelete.id, profile);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Product deleted successfully',
      });
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      fetchProducts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete product',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatPrice = (cents: number, currency: string = 'hkd'): string => {
    if (cents === 0) return 'Free';
    const amount = cents / 100;
    const symbols: Record<string, string> = {
      hkd: 'HK$',
      usd: '$',
      eur: '€',
      gbp: '£',
    };
    const symbol = symbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
    return `${symbol}${amount.toFixed(2)}`;
  };

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const getCurrentProducts = () => {
    return activeTab === 'brand' ? brandProducts : venueProducts;
  };

  const handleCreateProduct = () => {
    if (activeTab === 'venue' && profile?.is_venue) {
      navigate('/dashboard/products/select-type?owner_type=venue');
    } else {
      navigate('/dashboard/products/select-type?owner_type=brand');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const currentProducts = getCurrentProducts();

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Products</h1>
            <p className="text-muted-foreground mt-1">
              Manage your product catalog
            </p>
          </div>
          <Button onClick={handleCreateProduct}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>

        <Card>
          <CardHeader>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList>
                <TabsTrigger value="brand">Brand Products ({brandProducts.length})</TabsTrigger>
                {profile?.is_venue && (
                  <TabsTrigger value="venue">Venue Products ({venueProducts.length})</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="brand" className="mt-6">
                <CardContent>
                  {brandProducts.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">No brand products yet</p>
                      <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=brand')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Your First Product
                      </Button>
                    </div>
                  ) : (
                    <ProductTable
                      products={brandProducts}
                      onEdit={(product) => navigate(`/dashboard/products/${product.id}/edit`)}
                      onDelete={(product) => {
                        setProductToDelete(product);
                        setDeleteDialogOpen(true);
                      }}
                      deletingId={deletingId}
                      formatPrice={formatPrice}
                    />
                  )}
                </CardContent>
              </TabsContent>

              {profile?.is_venue && (
                <TabsContent value="venue" className="mt-6">
                  <CardContent>
                    {venueProducts.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground mb-4">No venue products yet</p>
                        <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=venue')}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create Your First Venue Product
                        </Button>
                      </div>
                    ) : (
                      <ProductTable
                        products={venueProducts}
                        onEdit={(product) => navigate(`/dashboard/products/${product.id}/edit`)}
                        onDelete={(product) => {
                          setProductToDelete(product);
                          setDeleteDialogOpen(true);
                        }}
                        deletingId={deletingId}
                        formatPrice={formatPrice}
                      />
                    )}
                  </CardContent>
                </TabsContent>
              )}
            </Tabs>
          </CardHeader>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Product</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{productToDelete?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

// Product Table Component
interface ProductTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  deletingId: string | null;
  formatPrice: (cents: number, currency?: string) => string;
}

function ProductTable({ products, onEdit, onDelete, deletingId, formatPrice }: ProductTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px]">Image</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell>
              {product.thumbnail_url ? (
                <img
                  src={product.thumbnail_url}
                  alt={product.name}
                  className="w-12 h-12 object-cover rounded"
                />
              ) : (
                <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </TableCell>
            <TableCell className="font-medium">{product.name}</TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={PRODUCT_CLASS_COLORS[product.product_class]}
              >
                {PRODUCT_CLASS_LABELS[product.product_class]}
              </Badge>
            </TableCell>
            <TableCell>
              {formatPrice(product.price_in_cents || 0, product.currency)}
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                {product.is_public && (
                  <Badge variant="outline" className="text-xs">
                    Public
                  </Badge>
                )}
                {product.is_purchasable && (
                  <Badge variant="outline" className="text-xs">
                    Purchasable
                  </Badge>
                )}
                {!product.is_active && (
                  <Badge variant="destructive" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => onEdit(product)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(product)}
                  disabled={deletingId === product.id}
                >
                  {deletingId === product.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

