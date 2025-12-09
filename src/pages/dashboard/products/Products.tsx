import { useState, useEffect, useCallback } from 'react';
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
import { Product } from '@/lib/types';
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

  const fetchProductStocksAndVariations = useCallback(async (products: Product[]) => {
    const stocks: Record<string, number> = {};
    const variations: Record<string, ProductVariation[]> = {};

    // Separate products by type
    const variableProducts = products.filter(p => p.product_type === 'variable');
    const simpleProducts = products.filter(p => p.product_type !== 'variable');

    // Batch fetch all variations for variable products in parallel
    const variationPromises = variableProducts.map(async (product) => {
      const { data: varsData } = await getProductVariations(product.id);
      return { productId: product.id, varsData: varsData || [] };
    });

    // Batch fetch all inventory for simple products in one query
    const simpleProductIds = simpleProducts.map(p => p.id);
    let simpleInventoryData: any[] = [];
    if (simpleProductIds.length > 0) {
      const { data } = await supabase
        .from('product_inventory')
        .select('product_id, stock_quantity')
        .in('product_id', simpleProductIds);
      simpleInventoryData = data || [];
    }

    // Process simple products inventory
    simpleProducts.forEach((product) => {
      const inventoryItems = simpleInventoryData.filter(inv => inv.product_id === product.id);
      stocks[product.id] = inventoryItems.reduce((sum, inv) => sum + (inv.stock_quantity || 0), 0);
    });

    // Process variable products variations (in parallel)
    const variationResults = await Promise.all(variationPromises);
    variationResults.forEach(({ productId, varsData }) => {
      if (varsData.length > 0) {
        variations[productId] = varsData;
        stocks[productId] = varsData.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
      } else {
        stocks[productId] = 0;
      }
    });

    // Set default stock to 0 for products without inventory
    products.forEach((product) => {
      if (stocks[product.id] === undefined) {
        stocks[product.id] = 0;
      }
    });

    setProductStocks(stocks);
    setProductVariations(variations);
  }, []);

  const fetchProducts = useCallback(async () => {
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
  }, [profile, fetchProductStocksAndVariations, toast]);

  useEffect(() => {
    if (profile?.id) {
      fetchProducts();
    }
  }, [profile?.id, fetchProducts]);

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
    } else if (activeTab === 'event') {
      return allProducts.filter(p => p.product_type === 'event');
    }
    return allProducts;
  };

  const handleCreateProduct = () => {
    navigate('/dashboard/products/select-type?owner_type=brand');
  };

  const simpleProducts = allProducts.filter(p => p.product_type === 'simple' || !p.product_type);
  const variableProducts = allProducts.filter(p => p.product_type === 'variable');
  const eventProducts = allProducts.filter(p => p.product_type === 'event');

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
          <CardHeader className="pb-0">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <TabsList className="inline-flex w-full md:w-auto min-w-max">
                  <TabsTrigger value="simple" className="whitespace-nowrap flex-shrink-0">Simple Products ({simpleProducts.length})</TabsTrigger>
                  <TabsTrigger value="variable" className="whitespace-nowrap flex-shrink-0">Variable Products ({variableProducts.length})</TabsTrigger>
                  <TabsTrigger value="event" className="whitespace-nowrap flex-shrink-0">Event Tickets ({eventProducts.length})</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="simple" className="mt-6">
                <CardContent className="p-2 md:p-6">
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
                <CardContent className="p-2 md:p-6">
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

              <TabsContent value="event" className="mt-6">
                <CardContent className="p-2 md:p-6">
                  {eventProducts.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">No event tickets yet</p>
                      <Button onClick={() => navigate('/events/new')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Your First Event Ticket
                      </Button>
                    </div>
                  ) : (
                    <ProductTable
                      products={eventProducts}
                      onEdit={(product) => {
                        // For event tickets, navigate to event edit page
                        const eventId = (product as any).event_id;
                        if (eventId) {
                          navigate(`/events/${eventId}/edit`);
                        } else {
                          navigate(`/dashboard/products/${product.id}/edit`);
                        }
                      }}
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
        <TableRow className="border-b">
          <TableHead className="w-[30px] md:w-[50px] p-1 md:p-2"></TableHead>
          <TableHead className="w-[50px] md:w-[80px] p-1 md:p-2 text-xs md:text-sm">Image</TableHead>
          <TableHead className="p-1 md:p-2 text-xs md:text-sm">Name</TableHead>
          <TableHead className="p-1 md:p-2 text-xs md:text-sm">Price</TableHead>
          <TableHead className="p-1 md:p-2 text-xs md:text-sm">Stock</TableHead>
          <TableHead className="p-1 md:p-2 text-xs md:text-sm hidden sm:table-cell">Status</TableHead>
          <TableHead className="text-right p-1 md:p-2 w-[70px] md:w-auto text-xs md:text-sm">Actions</TableHead>
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
              <TableRow key={product.id} className="border-b">
                <TableCell className="p-1 md:p-2">
                  {isVariable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleExpansion(product.id)}
                      className="h-5 w-5 md:h-6 md:w-6 p-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 md:h-4 md:w-4" />
                      ) : (
                        <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                      )}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="p-1 md:p-2">
                  {product.thumbnail_url ? (
                    <img
                      src={product.thumbnail_url}
                      alt={product.name}
                      className="w-8 h-8 md:w-12 md:h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-8 h-8 md:w-12 md:h-12 bg-muted rounded flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium p-1 md:p-2 text-xs md:text-sm">{product.name}</TableCell>
                <TableCell className="p-1 md:p-2 text-xs md:text-sm">
                  {formatPrice(product.price_in_cents || 0, product.currency)}
                </TableCell>
                <TableCell className="p-1 md:p-2">
                  <div className="flex items-center gap-1 md:gap-2">
                    <Package className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
                    <span className={`text-xs md:text-sm ${stock === 0 ? 'text-destructive font-medium' : ''}`}>
                      {stock}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="p-1 md:p-2 hidden sm:table-cell">
                  <div className="flex flex-col gap-0.5 md:gap-1">
                    {product.is_public && (
                      <Badge variant="outline" className="text-[10px] md:text-xs px-1 md:px-2 py-0 md:py-0.5">
                        Public
                      </Badge>
                    )}
                    {product.is_purchasable && (
                      <Badge variant="outline" className="text-[10px] md:text-xs px-1 md:px-2 py-0 md:py-0.5">
                        Purchasable
                      </Badge>
                    )}
                    {!product.is_active && (
                      <Badge variant="destructive" className="text-[10px] md:text-xs px-1 md:px-2 py-0 md:py-0.5">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right p-1 md:p-2">
                  <div className="flex items-center justify-end gap-1 md:gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(product)} className="h-7 w-7 md:h-8 md:w-8 p-0">
                      <Edit className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(product)}
                      disabled={deletingId === product.id}
                      className="h-7 w-7 md:h-8 md:w-8 p-0"
                    >
                      {deletingId === product.id ? (
                        <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3 md:h-4 md:w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {isVariable && isExpanded && variations.length > 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/30 p-2 md:p-4">
                    <div className="py-2 md:py-4 pl-4 md:pl-8">
                      <h4 className="font-medium mb-2 md:mb-3 text-xs md:text-sm">Variations</h4>
                      <div className="space-y-1 md:space-y-2">
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
                                className="flex items-center justify-between p-2 md:p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => onToggleColorExpansion(product.id, color)}
                              >
                                <div className="flex items-center gap-1 md:gap-2 flex-1 min-w-0">
                                  {isColorExpanded ? (
                                    <ChevronDown className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-medium text-xs md:text-sm capitalize truncate">
                                      Color: {color}
                                    </div>
                                    <div className="text-[10px] md:text-xs text-muted-foreground">
                                      {colorVariations.length} size{colorVariations.length !== 1 ? 's' : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 md:gap-6 flex-shrink-0">
                                  <div className="text-right">
                                    <div className="text-xs md:text-sm font-medium">
                                      {formatPrice(avgPrice, product.currency)}
                                    </div>
                                    <div className="text-[10px] md:text-xs text-muted-foreground">Avg</div>
                                  </div>
                                  <div className="text-right">
                                    <div
                                      className={`text-xs md:text-sm font-medium ${
                                        totalColorStock === 0 ? 'text-destructive' : ''
                                      }`}
                                    >
                                      {totalColorStock}
                                    </div>
                                    <div className="text-[10px] md:text-xs text-muted-foreground">Stock</div>
                                  </div>
                                </div>
                              </div>

                              {/* Size Variations - Expandable */}
                              {isColorExpanded && (
                                <div className="border-t bg-muted/20">
                                  <div className="p-2 md:p-3 space-y-1 md:space-y-2">
                                    {colorVariations.map((variation) => {
                                      const size = getSizeFromVariation(variation);
                                      return (
                                        <div
                                          key={variation.id}
                                          className="flex items-center justify-between p-1.5 md:p-2 bg-background rounded"
                                        >
                                          <div className="flex-1 pl-3 md:pl-6 min-w-0">
                                            <div className="font-medium text-xs md:text-sm truncate">
                                              Size: {size}
                                            </div>
                                            {variation.sku && (
                                              <div className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1 truncate">
                                                SKU: {variation.sku}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 md:gap-6 flex-shrink-0">
                                            <div className="text-right">
                                              <div className="text-xs md:text-sm font-medium">
                                                {variation.price_in_cents
                                                  ? formatPrice(variation.price_in_cents, product.currency)
                                                  : formatPrice(product.price_in_cents || 0, product.currency)}
                                              </div>
                                              <div className="text-[10px] md:text-xs text-muted-foreground">Price</div>
                                            </div>
                                            <div className="text-right">
                                              <div
                                                className={`text-xs md:text-sm font-medium ${
                                                  variation.stock_quantity === 0 ? 'text-destructive' : ''
                                                }`}
                                              >
                                                {variation.stock_quantity}
                                              </div>
                                              <div className="text-[10px] md:text-xs text-muted-foreground">Stock</div>
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

