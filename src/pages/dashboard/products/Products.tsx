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
import { getProductVariations } from '@/lib/api/variable-products';
import { Product, PRODUCT_CLASS_LABELS, PRODUCT_CLASS_COLORS } from '@/lib/types';
import { ProductVariation } from '@/lib/types/variable-products';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Loader2, Image as ImageIcon, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedColors, setExpandedColors] = useState<Set<string>>(new Set()); // Format: "productId-color"
  const [productStocks, setProductStocks] = useState<Record<string, number>>({});
  const [productVariations, setProductVariations] = useState<Record<string, ProductVariation[]>>({});

  // Get active tab from URL or default to 'simple'
  const activeTab = searchParams.get('tab') || 'simple';

  useEffect(() => {
    if (profile) {
      fetchProducts();
    }
  }, [profile]);

  const fetchProducts = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Fetch all products (brand and venue if user is venue)
      const { data: brandData, error: brandError } = await getMyProducts(profile, 'brand');
      if (brandError) throw brandError;

      let allProductsData: Product[] = [...(brandData || [])];
      
      // Fetch venue products (only if user is venue)
      if (profile.is_venue) {
        const { data: venueProductsData, error: venueError } = await getMyProducts(profile, 'venue');
        if (venueError) throw venueError;
        allProductsData = [...allProductsData, ...(venueProductsData || [])];
      }

      setAllProducts(allProductsData);

      // Fetch stock and variations for all products
      await fetchProductStocksAndVariations(allProductsData);
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

  const fetchProductStocksAndVariations = async (products: Product[]) => {
    const stocks: Record<string, number> = {};
    const variations: Record<string, ProductVariation[]> = {};

    for (const product of products) {
      if (product.product_type === 'variable') {
        // Fetch variations for variable products
        const { data: varsData } = await getProductVariations(product.id);
        if (varsData) {
          variations[product.id] = varsData;
          // Calculate total stock from all variations
          stocks[product.id] = varsData.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
        }
      } else {
        // Fetch stock from product_inventory for simple products
        const { data: inventoryData } = await supabase
          .from('product_inventory')
          .select('stock_quantity')
          .eq('product_id', product.id);

        if (inventoryData) {
          stocks[product.id] = inventoryData.reduce((sum, inv) => sum + (inv.stock_quantity || 0), 0);
        } else {
          stocks[product.id] = 0;
        }
      }
    }

    setProductStocks(stocks);
    setProductVariations(variations);
  };

  const toggleProductExpansion = (productId: string) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
      // Also collapse all colors when collapsing product
      const newExpandedColors = new Set(expandedColors);
      Array.from(newExpandedColors).forEach((key: string) => {
        if (key.startsWith(`${productId}-`)) {
          newExpandedColors.delete(key);
        }
      });
      setExpandedColors(newExpandedColors);
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
    if (activeTab === 'simple') {
      return allProducts.filter(p => p.product_type === 'simple' || !p.product_type);
    } else if (activeTab === 'variable') {
      return allProducts.filter(p => p.product_type === 'variable');
    }
    return allProducts;
  };

  const handleCreateProduct = () => {
    navigate('/dashboard/products/select-type?owner_type=brand');
  };

  const simpleProducts = allProducts.filter(p => p.product_type === 'simple' || !p.product_type);
  const variableProducts = allProducts.filter(p => p.product_type === 'variable');

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
                <TabsTrigger value="simple">Simple Products ({simpleProducts.length})</TabsTrigger>
                <TabsTrigger value="variable">Variable Products ({variableProducts.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="simple" className="mt-6">
                <CardContent>
                  {simpleProducts.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">No simple products yet</p>
                      <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=brand')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Your First Product
                      </Button>
                    </div>
                  ) : (
                    <ProductTable
                      products={simpleProducts}
                      onEdit={(product) => navigate(`/dashboard/products/${product.id}/edit`)}
                      onDelete={(product) => {
                        setProductToDelete(product);
                        setDeleteDialogOpen(true);
                      }}
                      deletingId={deletingId}
                      formatPrice={formatPrice}
                      productStocks={productStocks}
                      productVariations={productVariations}
                      expandedProducts={expandedProducts}
                      expandedColors={expandedColors}
                      onToggleExpansion={toggleProductExpansion}
                      onToggleColorExpansion={toggleColorExpansion}
                    />
                  )}
                </CardContent>
              </TabsContent>

              <TabsContent value="variable" className="mt-6">
                <CardContent>
                  {variableProducts.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">No variable products yet</p>
                      <Button onClick={() => navigate('/dashboard/products/select-type?owner_type=brand')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Your First Variable Product
                      </Button>
                    </div>
                  ) : (
                    <ProductTable
                      products={variableProducts}
                      onEdit={(product) => navigate(`/dashboard/products/${product.id}/edit`)}
                      onDelete={(product) => {
                        setProductToDelete(product);
                        setDeleteDialogOpen(true);
                      }}
                      deletingId={deletingId}
                      formatPrice={formatPrice}
                      productStocks={productStocks}
                      productVariations={productVariations}
                      expandedProducts={expandedProducts}
                      expandedColors={expandedColors}
                      onToggleExpansion={toggleProductExpansion}
                      onToggleColorExpansion={toggleColorExpansion}
                    />
                  )}
                </CardContent>
              </TabsContent>
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
  productStocks: Record<string, number>;
  productVariations: Record<string, ProductVariation[]>;
  expandedProducts: Set<string>;
  expandedColors: Set<string>;
  onToggleExpansion: (productId: string) => void;
  onToggleColorExpansion: (productId: string, color: string) => void;
}

function ProductTable({
  products,
  onEdit,
  onDelete,
  deletingId,
  formatPrice,
  productStocks,
  productVariations,
  expandedProducts,
  expandedColors,
  onToggleExpansion,
  onToggleColorExpansion,
}: ProductTableProps) {
  const formatVariationAttributes = (attributes: Record<string, string>): string => {
    return Object.entries(attributes)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  };

  // Group variations by color (first variable) and then by size (second variable)
  const groupVariationsByColor = (variations: ProductVariation[]) => {
    // Find color and size variables (assuming color is first, size is second)
    const grouped: Record<string, ProductVariation[]> = {};
    
    variations.forEach((variation) => {
      // Try to find "color" or "Color" as the grouping key
      const colorKey = variation.attributes['color'] || variation.attributes['Color'] || 'Other';
      if (!grouped[colorKey]) {
        grouped[colorKey] = [];
      }
      grouped[colorKey].push(variation);
    });

    return grouped;
  };

  // Get size from variation attributes (assuming size is the second variable)
  const getSizeFromVariation = (variation: ProductVariation): string => {
    // Try common size field names
    return variation.attributes['size'] || 
           variation.attributes['Size'] || 
           variation.attributes['SIZE'] ||
           Object.values(variation.attributes).find((val, idx, arr) => {
             // Return the value that's not the color
             const color = variation.attributes['color'] || variation.attributes['Color'];
             return val !== color;
           }) || 'N/A';
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]"></TableHead>
          <TableHead className="w-[80px]">Image</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Stock</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => {
          const isVariable = product.product_type === 'variable';
          const isExpanded = expandedProducts.has(product.id);
          const stock = productStocks[product.id] ?? 0;
          const variations = productVariations[product.id] || [];

          return (
            <>
              <TableRow key={product.id}>
                <TableCell>
                  {isVariable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleExpansion(product.id)}
                      className="h-6 w-6 p-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </TableCell>
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
                  <Badge variant={isVariable ? 'default' : 'outline'}>
                    {isVariable ? 'Variable' : 'Simple'}
                  </Badge>
                </TableCell>
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
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className={stock === 0 ? 'text-destructive font-medium' : ''}>
                      {stock}
                    </span>
                  </div>
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
              {isVariable && isExpanded && variations.length > 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="bg-muted/30">
                    <div className="py-4 pl-8">
                      <h4 className="font-medium mb-3 text-sm">Variations</h4>
                      <div className="space-y-2">
                        {Object.entries(groupVariationsByColor(variations)).map(([color, colorVariations]) => {
                          const colorKey = `${product.id}-${color}`;
                          const isColorExpanded = expandedColors.has(colorKey);
                          const totalColorStock = colorVariations.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
                          const avgPrice = colorVariations.length > 0
                            ? colorVariations.reduce((sum, v) => sum + (v.price_in_cents || product.price_in_cents || 0), 0) / colorVariations.length
                            : product.price_in_cents || 0;

                          return (
                            <div key={color} className="bg-background rounded border">
                              {/* Color Header - Clickable */}
                              <div
                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => onToggleColorExpansion(product.id, color)}
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  {isColorExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <div>
                                    <div className="font-medium text-sm capitalize">
                                      Color: {color}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {colorVariations.length} size{colorVariations.length !== 1 ? 's' : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-6">
                                  <div className="text-right">
                                    <div className="text-sm font-medium">
                                      {formatPrice(avgPrice, product.currency)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Avg Price</div>
                                  </div>
                                  <div className="text-right">
                                    <div
                                      className={`text-sm font-medium ${
                                        totalColorStock === 0 ? 'text-destructive' : ''
                                      }`}
                                    >
                                      {totalColorStock}
                                    </div>
                                    <div className="text-xs text-muted-foreground">Total Stock</div>
                                  </div>
                                </div>
                              </div>

                              {/* Size Variations - Expandable */}
                              {isColorExpanded && (
                                <div className="border-t bg-muted/20">
                                  <div className="p-3 space-y-2">
                                    {colorVariations.map((variation) => {
                                      const size = getSizeFromVariation(variation);
                                      return (
                                        <div
                                          key={variation.id}
                                          className="flex items-center justify-between p-2 bg-background rounded"
                                        >
                                          <div className="flex-1 pl-6">
                                            <div className="font-medium text-sm">
                                              Size: {size}
                                            </div>
                                            {variation.sku && (
                                              <div className="text-xs text-muted-foreground mt-1">
                                                SKU: {variation.sku}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-6">
                                            <div className="text-right">
                                              <div className="text-sm font-medium">
                                                {variation.price_in_cents
                                                  ? formatPrice(variation.price_in_cents, product.currency)
                                                  : formatPrice(product.price_in_cents || 0, product.currency)}
                                              </div>
                                              <div className="text-xs text-muted-foreground">Price</div>
                                            </div>
                                            <div className="text-right">
                                              <div
                                                className={`text-sm font-medium ${
                                                  variation.stock_quantity === 0 ? 'text-destructive' : ''
                                                }`}
                                              >
                                                {variation.stock_quantity}
                                              </div>
                                              <div className="text-xs text-muted-foreground">Stock</div>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}

