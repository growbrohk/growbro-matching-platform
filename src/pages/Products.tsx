import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { CollabChip } from '@/components/CollabChip';
import { Product, CollabType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Edit,
  Trash2,
  Package,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const COLLAB_TYPES: CollabType[] = ['consignment', 'event', 'collab_product', 'cup_sleeve_marketing'];

export default function Products() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [fullDescription, setFullDescription] = useState('');
  const [category, setCategory] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [priceRangeMin, setPriceRangeMin] = useState('');
  const [priceRangeMax, setPriceRangeMax] = useState('');
  const [suitableCollabTypes, setSuitableCollabTypes] = useState<CollabType[]>([]);
  const [marginNotes, setMarginNotes] = useState('');
  const [inventoryNotes, setInventoryNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [isPurchasable, setIsPurchasable] = useState(false);
  const [priceInCents, setPriceInCents] = useState('');

  useEffect(() => {
    fetchProducts();
  }, [profile]);

  const fetchProducts = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('owner_user_id', profile.id)
        .eq('owner_type', 'brand')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts((data as Product[]) || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setShortDescription('');
    setFullDescription('');
    setCategory('');
    setThumbnailUrl('');
    setPriceRangeMin('');
    setPriceRangeMax('');
    setSuitableCollabTypes([]);
    setMarginNotes('');
    setInventoryNotes('');
    setIsActive(true);
    setIsPublic(false);
    setIsPurchasable(false);
    setPriceInCents('');
    setEditingProduct(null);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setShortDescription(product.short_description || '');
    setFullDescription(product.full_description || '');
    setCategory(product.category || '');
    setThumbnailUrl(product.thumbnail_url || '');
    setPriceRangeMin(product.price_range_min?.toString() || '');
    setPriceRangeMax(product.price_range_max?.toString() || '');
    setSuitableCollabTypes((product.suitable_collab_types as CollabType[]) || []);
    setMarginNotes(product.margin_notes || '');
    setInventoryNotes(product.inventory_notes || '');
    setIsActive(product.is_active);
    setIsPublic(product.is_public ?? false);
    setIsPurchasable(product.is_purchasable ?? false);
    setPriceInCents(product.price_in_cents?.toString() || '');
    setDialogOpen(true);
  };

  const toggleCollabType = (type: CollabType) => {
    setSuitableCollabTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSave = async () => {
    if (!profile || !name.trim()) {
      toast({
        title: 'Missing name',
        description: 'Product name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const productData = {
        brand_user_id: profile.id,
        name: name.trim(),
        short_description: shortDescription || null,
        full_description: fullDescription || null,
        category: category || null,
        thumbnail_url: thumbnailUrl || null,
        price_range_min: priceRangeMin ? parseInt(priceRangeMin) : null,
        price_range_max: priceRangeMax ? parseInt(priceRangeMax) : null,
        suitable_collab_types: suitableCollabTypes,
        margin_notes: marginNotes || null,
        inventory_notes: inventoryNotes || null,
        is_active: isActive,
        is_public: isPublic,
        is_purchasable: isPurchasable,
        price_in_cents: priceInCents ? parseInt(priceInCents) : 0,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        toast({ title: 'Product updated' });
      } else {
        const { error } = await supabase.from('products').insert(productData);
        if (error) throw error;
        toast({ title: 'Product created' });
      }

      setDialogOpen(false);
      resetForm();
      fetchProducts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save product',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      toast({ title: 'Product deleted' });
      fetchProducts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete product',
        variant: 'destructive',
      });
    }
  };

  if (profile?.role !== 'brand') {
    return (
      <Layout>
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold mb-2">Products are for brands only</h1>
          <p className="text-muted-foreground">This feature is available for brand accounts.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Product Catalog</h1>
            <p className="text-muted-foreground mt-1">
              Manage your products that venues can browse
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button variant="hero">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Edit Product' : 'Add Product'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Product Name *</Label>
                  <Input
                    placeholder="e.g. Signature Coffee Blend"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Short Description</Label>
                  <Input
                    placeholder="Brief tagline"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Full Description</Label>
                  <Textarea
                    placeholder="Detailed description..."
                    value={fullDescription}
                    onChange={(e) => setFullDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    placeholder="e.g. Apparel, Drinkware, Snacks"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Thumbnail URL</Label>
                  <Input
                    placeholder="https://..."
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min Price ($)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={priceRangeMin}
                      onChange={(e) => setPriceRangeMin(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Price ($)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={priceRangeMax}
                      onChange={(e) => setPriceRangeMax(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Suitable for</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLLAB_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleCollabType(type)}
                        className={cn(
                          'px-3 py-1.5 rounded-full border text-sm transition-all',
                          suitableCollabTypes.includes(type)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {type.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Margin Notes</Label>
                  <Input
                    placeholder="e.g. 30-40% consignment margin"
                    value={marginNotes}
                    onChange={(e) => setMarginNotes(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Inventory Notes</Label>
                  <Input
                    placeholder="e.g. 100 units available"
                    value={inventoryNotes}
                    onChange={(e) => setInventoryNotes(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Shop Price (in cents)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 1000 = $10.00"
                    value={priceInCents}
                    onChange={(e) => setPriceInCents(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Enter 0 for free items</p>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Public in Shop</Label>
                    <p className="text-xs text-muted-foreground">Show this product in the public webstore</p>
                  </div>
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Purchasable</Label>
                    <p className="text-xs text-muted-foreground">Allow customers to buy this product</p>
                  </div>
                  <Switch checked={isPurchasable} onCheckedChange={setIsPurchasable} />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="hero"
                    className="flex-1"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingProduct ? 'Save Changes' : 'Add Product'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : products.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No products yet</h2>
              <p className="text-muted-foreground mb-6">
                Add your first product to start showcasing to venues
              </p>
              <Button variant="hero" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Product
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <Card key={product.id} className={cn(!product.is_active && 'opacity-60')}>
                <div className="aspect-video bg-muted rounded-t-xl overflow-hidden">
                  {product.thumbnail_url ? (
                    <img
                      src={product.thumbnail_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{product.name}</h3>
                      {product.category && (
                        <p className="text-sm text-muted-foreground">{product.category}</p>
                      )}
                    </div>
                    {!product.is_active && (
                      <span className="text-xs px-2 py-1 bg-muted rounded-full">Inactive</span>
                    )}
                  </div>
                  {product.short_description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {product.short_description}
                    </p>
                  )}
                  {product.suitable_collab_types && product.suitable_collab_types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {product.suitable_collab_types.slice(0, 2).map((type) => (
                        <CollabChip key={type} type={type as CollabType} size="sm" showIcon={false} />
                      ))}
                      {product.suitable_collab_types.length > 2 && (
                        <span className="text-xs text-muted-foreground px-2 py-0.5">
                          +{product.suitable_collab_types.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditDialog(product)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(product.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
