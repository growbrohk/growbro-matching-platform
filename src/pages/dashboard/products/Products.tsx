import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Edit, ChevronDown, ChevronRight } from 'lucide-react';
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
import { getCategories, type ProductCategory } from '@/lib/api/categories-and-tags';

type OrgProduct = {
  id: string;
  org_id: string;
  type: 'physical' | 'venue_asset';
  title: string;
  description: string | null;
  base_price: number | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

export default function Products() {
  const { currentOrg } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<OrgProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<OrgProduct | null>(null);

  const canCreate = !!currentOrg?.id;

  const productTypeLabel = useMemo(() => {
    return {
      physical: 'Physical',
      venue_asset: 'Venue Asset',
    } as const;
  }, []);

  useEffect(() => {
    if (!currentOrg) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch categories
        const categoriesData = await getCategories(currentOrg.id);
        setCategories(categoriesData);

        // Expand all categories by default
        const allCategoryIds = new Set(categoriesData.map(c => c.id));
        allCategoryIds.add('uncategorized');
        setExpandedCategories(allCategoryIds);

        // Fetch products
        const { data, error: fetchError } = await supabase
          .from('products')
          .select('id, org_id, type, title, description, base_price, category_id, created_at, updated_at')
          .eq('org_id', currentOrg.id)
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setProducts((data as any as OrgProduct[]) || []);
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

  // Group products by category
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, { category: ProductCategory | null; products: OrgProduct[] }>();

    // Group products by category
    products.forEach((product) => {
      const categoryId = product.category_id || 'uncategorized';
      
      if (!groups.has(categoryId)) {
        const category = categoryId === 'uncategorized' 
          ? null 
          : categories.find(c => c.id === categoryId) || null;
        groups.set(categoryId, { category, products: [] });
      }
      
      groups.get(categoryId)!.products.push(product);
    });

    // Sort: categories by sort_order, then uncategorized last
    const sortedEntries = Array.from(groups.entries()).sort(([keyA, groupA], [keyB, groupB]) => {
      if (keyA === 'uncategorized') return 1;
      if (keyB === 'uncategorized') return -1;
      const catA = groupA.category;
      const catB = groupB.category;
      if (!catA || !catB) return 0;
      return catA.sort_order - catB.sort_order;
    });

    return sortedEntries.map(([key, group]) => ({
      id: key,
      name: group.category?.name || 'Uncategorized',
      products: group.products,
    }));
  }, [products, categories]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (!productToDelete) return;
    setDeletingId(productToDelete.id);
    try {
      const { error: deleteError } = await supabase.from('products').delete().eq('id', productToDelete.id);
      if (deleteError) throw deleteError;

      setProducts((prev) => prev.filter((p) => p.id !== productToDelete.id));
      toast({ title: 'Deleted', description: 'Product deleted successfully' });
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (e: any) {
      const msg = e?.message || 'Failed to delete product';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
    <div className="max-w-7xl space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Products
          </h1>
          <p className="mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Products in {currentOrg?.name || 'your org'}
          </p>
        </div>
        <Button onClick={() => navigate('/app/products/new')} disabled={!canCreate} style={{ backgroundColor: '#0E7A3A', color: 'white' }} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Product
        </Button>
      </div>

      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle>Products ({products.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-muted-foreground mb-4">No products yet</p>
              <Button onClick={() => navigate('/app/products/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Product
              </Button>
            </div>
          ) : (
            <div className="space-y-2 p-4 md:p-6">
              {groupedProducts.map((group) => {
                const isExpanded = expandedCategories.has(group.id);
                
                return (
                  <div key={group.id} className="border rounded-lg" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(group.id)}
                      className="w-full flex items-center justify-between p-3 md:p-4 hover:bg-muted/50 transition-colors rounded-t-lg"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5" style={{ color: '#0E7A3A' }} />
                        ) : (
                          <ChevronRight className="h-5 w-5" style={{ color: '#0E7A3A' }} />
                        )}
                        <h3 className="font-semibold text-lg" style={{ color: '#0F1F17' }}>
                          {group.name}
                        </h3>
                        <Badge variant="secondary" className="ml-2">
                          {group.products.length}
                        </Badge>
                      </div>
                    </button>

                    {/* Products List */}
                    {isExpanded && (
                      <>
                        {/* Mobile: Card-based layout */}
                        <div className="md:hidden divide-y" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                          {group.products.map((p) => (
                            <div key={p.id} className="p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-medium truncate">{p.title}</h3>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <Badge variant="outline" className="text-xs">{productTypeLabel[p.type] ?? p.type}</Badge>
                                    {p.base_price !== null && (
                                      <span className="text-sm text-muted-foreground">HK${Number(p.base_price).toFixed(2)}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => navigate(`/app/products/${p.id}/edit`)}
                                  className="flex-1"
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setProductToDelete(p);
                                    setDeleteDialogOpen(true);
                                  }}
                                  disabled={deletingId === p.id}
                                  className="flex-1"
                                >
                                  {deletingId === p.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                                  )}
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop: Table layout */}
                        <div className="hidden md:block overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="p-3 md:p-4">Title</TableHead>
                                <TableHead className="p-3 md:p-4">Type</TableHead>
                                <TableHead className="p-3 md:p-4">Base Price</TableHead>
                                <TableHead className="text-right p-3 md:p-4">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.products.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-medium p-3 md:p-4">{p.title}</TableCell>
                                  <TableCell className="p-3 md:p-4">
                                    <Badge variant="outline">{productTypeLabel[p.type] ?? p.type}</Badge>
                                  </TableCell>
                                  <TableCell className="p-3 md:p-4">{p.base_price === null ? '-' : `HK$${Number(p.base_price).toFixed(2)}`}</TableCell>
                                  <TableCell className="text-right p-3 md:p-4">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => navigate(`/app/products/${p.id}/edit`)}>
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setProductToDelete(p);
                                          setDeleteDialogOpen(true);
                                        }}
                                        disabled={deletingId === p.id}
                                      >
                                        {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="p-4 md:p-6">
          <AlertDialogHeader className="space-y-4">
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{productToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deletingId !== null} className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive w-full sm:w-auto" disabled={deletingId !== null}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

