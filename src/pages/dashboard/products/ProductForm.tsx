import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createProduct, updateProduct, getProductById, generateSlug } from '@/lib/api/products';
import { Product, ProductOwnerType, ProductClass, CollabType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { CollabChip } from '@/components/CollabChip';

const PRODUCT_CLASSES: { value: ProductClass; label: string; description: string }[] = [
  { value: 'physical', label: 'Physical', description: 'Tangible product with inventory' },
  { value: 'ticket', label: 'Ticket', description: 'Event ticket or admission' },
  { value: 'booking', label: 'Booking', description: 'Reservable time slot or service' },
  { value: 'service', label: 'Service', description: 'Design, workshop, or other service' },
  { value: 'space', label: 'Space', description: 'Venue space rental' },
];

const COLLAB_TYPES: CollabType[] = ['consignment', 'event', 'collab_product', 'cup_sleeve_marketing'];

const CURRENCIES = ['hkd', 'usd', 'eur', 'gbp'];

export default function ProductForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [productClass, setProductClass] = useState<ProductClass | ''>('');
  const [ownerType, setOwnerType] = useState<ProductOwnerType>('brand');
  const [shortDescription, setShortDescription] = useState('');
  const [fullDescription, setFullDescription] = useState('');
  const [category, setCategory] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [priceInCents, setPriceInCents] = useState('');
  const [currency, setCurrency] = useState('hkd');
  const [isPurchasable, setIsPurchasable] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [suitableCollabTypes, setSuitableCollabTypes] = useState<CollabType[]>([]);
  const [marginNotes, setMarginNotes] = useState('');
  const [inventoryNotes, setInventoryNotes] = useState('');

  const isEditMode = !!id;

  useEffect(() => {
    // Set owner_type from URL param if provided
    const ownerTypeParam = searchParams.get('owner_type') as ProductOwnerType;
    if (ownerTypeParam && (ownerTypeParam === 'brand' || ownerTypeParam === 'venue')) {
      setOwnerType(ownerTypeParam);
    }

    if (id && profile) {
      loadProduct();
    }
  }, [id, profile, searchParams]);

  const loadProduct = async () => {
    if (!id || !profile) return;

    setLoading(true);
    try {
      const { data, error } = await getProductById(id, profile);
      if (error) throw error;
      if (!data) {
        toast({
          title: 'Error',
          description: 'Product not found',
          variant: 'destructive',
        });
        navigate('/dashboard/products/brand');
        return;
      }

      // Populate form
      setName(data.name);
      setSlug(data.slug || '');
      setProductClass(data.product_class);
      setOwnerType(data.owner_type);
      setShortDescription(data.short_description || '');
      setFullDescription(data.full_description || '');
      setCategory(data.category || '');
      setThumbnailUrl(data.thumbnail_url || '');
      setPriceInCents(data.price_in_cents?.toString() || '');
      setCurrency(data.currency || 'hkd');
      setIsPurchasable(data.is_purchasable || false);
      setIsPublic(data.is_public || false);
      setIsActive(data.is_active ?? true);
      setSuitableCollabTypes(data.suitable_collab_types || []);
      setMarginNotes(data.margin_notes || '');
      setInventoryNotes(data.inventory_notes || '');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load product',
        variant: 'destructive',
      });
      navigate('/dashboard/products/brand');
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate slug if not in edit mode or if slug is empty
    if (!isEditMode || !slug) {
      setSlug(generateSlug(value));
    }
  };

  const toggleCollabType = (type: CollabType) => {
    setSuitableCollabTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile) {
      toast({
        title: 'Error',
        description: 'You must be logged in',
        variant: 'destructive',
      });
      return;
    }

    // Validation
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Product name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!productClass) {
      toast({
        title: 'Validation Error',
        description: 'Product class is required',
        variant: 'destructive',
      });
      return;
    }

    // Validate owner_type
    let finalOwnerType: ProductOwnerType = ownerType;
    if (!profile.is_venue) {
      finalOwnerType = 'brand'; // Force brand if user is not a venue
    } else if (ownerType === 'venue' && !profile.is_venue) {
      toast({
        title: 'Validation Error',
        description: 'Only venue users can create venue products',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const productData = {
        name: name.trim(),
        slug: slug.trim() || generateSlug(name),
        product_class: productClass as ProductClass,
        owner_type: finalOwnerType,
        short_description: shortDescription.trim() || undefined,
        full_description: fullDescription.trim() || undefined,
        category: category.trim() || undefined,
        thumbnail_url: thumbnailUrl.trim() || undefined,
        price_in_cents: priceInCents ? parseInt(priceInCents) : 0,
        currency: currency,
        is_purchasable: isPurchasable,
        is_public: isPublic,
        is_active: isActive,
        suitable_collab_types: suitableCollabTypes,
        margin_notes: marginNotes.trim() || undefined,
        inventory_notes: inventoryNotes.trim() || undefined,
      };

      if (isEditMode && id) {
        const { data, error } = await updateProduct({ ...productData, id }, profile);
        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Product updated successfully',
        });
        navigate(`/dashboard/products/${finalOwnerType === 'brand' ? 'brand' : 'venue'}`);
      } else {
        const { data, error } = await createProduct(productData, profile);
        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Product created successfully',
        });
        navigate(`/dashboard/products/${finalOwnerType === 'brand' ? 'brand' : 'venue'}`);
      }
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

  const getBackPath = () => {
    if (ownerType === 'venue') {
      return '/dashboard/products/venue';
    }
    return '/dashboard/products/brand';
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

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(getBackPath())} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>
          <h1 className="text-3xl font-bold">
            {isEditMode ? 'Edit Product' : 'Create New Product'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditMode
              ? 'Update your product information'
              : ownerType === 'venue'
                ? 'Create a new venue product (booking, space, service)'
                : 'Create a new brand product'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Essential product details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Product Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Signature Coffee Blend"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="auto-generated-from-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL-friendly identifier (auto-generated from name)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="productClass">
                      Product Class <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={productClass}
                      onValueChange={(value) => setProductClass(value as ProductClass)}
                      required
                    >
                      <SelectTrigger id="productClass">
                        <SelectValue placeholder="Select product class" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_CLASSES.map((pc) => (
                          <SelectItem key={pc.value} value={pc.value}>
                            <div>
                              <div className="font-medium">{pc.label}</div>
                              <div className="text-xs text-muted-foreground">{pc.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {profile?.is_venue && (
                    <div className="space-y-2">
                      <Label htmlFor="ownerType">Owner Type</Label>
                      <Select
                        value={ownerType}
                        onValueChange={(value) => setOwnerType(value as ProductOwnerType)}
                      >
                        <SelectTrigger id="ownerType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="brand">Brand</SelectItem>
                          <SelectItem value="venue">Venue</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {ownerType === 'venue'
                          ? 'Venue products: bookings, spaces, services'
                          : 'Brand products: physical items, tickets'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shortDescription">Short Description</Label>
                  <Input
                    id="shortDescription"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Brief product description"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullDescription">Full Description</Label>
                  <Textarea
                    id="fullDescription"
                    value={fullDescription}
                    onChange={(e) => setFullDescription(e.target.value)}
                    placeholder="Detailed product description..."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Apparel, Drinkware, Snacks"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="thumbnailUrl">Thumbnail URL</Label>
                  <Input
                    id="thumbnailUrl"
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    type="url"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
                <CardDescription>Set product pricing and availability</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priceInCents">Price (in cents)</Label>
                    <Input
                      id="priceInCents"
                      type="number"
                      min="0"
                      value={priceInCents}
                      onChange={(e) => setPriceInCents(e.target.value)}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter price in smallest currency unit (e.g., 1000 = $10.00)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((curr) => (
                          <SelectItem key={curr} value={curr}>
                            {curr.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isPurchasable">Purchasable</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow customers to purchase this product
                      </p>
                    </div>
                    <Switch
                      id="isPurchasable"
                      checked={isPurchasable}
                      onCheckedChange={setIsPurchasable}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isPublic">Public</Label>
                      <p className="text-sm text-muted-foreground">
                        Show this product in public webstore
                      </p>
                    </div>
                    <Switch id="isPublic" checked={isPublic} onCheckedChange={setIsPublic} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">Active</Label>
                      <p className="text-sm text-muted-foreground">
                        Product is active and visible
                      </p>
                    </div>
                    <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Advanced Fields */}
            <Card>
              <CardHeader>
                <CardTitle>Advanced Settings</CardTitle>
                <CardDescription>Optional collaboration and inventory settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Suitable for Collaboration Types</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLLAB_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleCollabType(type)}
                        className={suitableCollabTypes.includes(type) ? '' : 'opacity-50'}
                      >
                        <CollabChip type={type} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="marginNotes">Margin Notes</Label>
                  <Textarea
                    id="marginNotes"
                    value={marginNotes}
                    onChange={(e) => setMarginNotes(e.target.value)}
                    placeholder="Notes about margins, pricing strategy..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventoryNotes">Inventory Notes</Label>
                  <Textarea
                    id="inventoryNotes"
                    value={inventoryNotes}
                    onChange={(e) => setInventoryNotes(e.target.value)}
                    placeholder="Notes about inventory management..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(getBackPath())}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!saving && <Save className="mr-2 h-4 w-4" />}
                {isEditMode ? 'Update Product' : 'Create Product'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}

