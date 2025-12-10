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
import { saveProductVariables, getProductVariables, generateVariations, saveProductVariations } from '@/lib/api/variable-products';
import { Product, ProductOwnerType, ProductType, CollabType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Save, Plus, Trash2, X } from 'lucide-react';
import { CollabChip } from '@/components/CollabChip';
import { supabase } from '@/integrations/supabase/client';

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
  const [productType, setProductType] = useState<ProductType | ''>('');
  const [ownerType, setOwnerType] = useState<ProductOwnerType>('brand');
  const [productTypeId, setProductTypeId] = useState<string>('');
  const [isVariableProduct, setIsVariableProduct] = useState(false);
  const [shortDescription, setShortDescription] = useState('');
  const [fullDescription, setFullDescription] = useState('');
  const [category, setCategory] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [priceInDollars, setPriceInDollars] = useState('');
  const [currency, setCurrency] = useState('hkd');
  const [isPurchasable, setIsPurchasable] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [variables, setVariables] = useState<Array<{ name: string; values: string[] }>>([]);
  const [suitableCollabTypes, setSuitableCollabTypes] = useState<CollabType[]>([]);
  const [marginNotes, setMarginNotes] = useState('');
  const [inventoryNotes, setInventoryNotes] = useState('');
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const isEditMode = !!id;

  useEffect(() => {
    // Fetch existing categories
    fetchExistingCategories();
    
    // If creating new product, check if product_type and owner_type are provided
    // If not, redirect to type selection
    if (!id) {
      const productTypeParam = searchParams.get('product_type') as ProductType;
      const ownerTypeParam = searchParams.get('owner_type') as ProductOwnerType;
      const productTypeIdParam = searchParams.get('product_type_id');

      if (!productTypeParam || !ownerTypeParam) {
        // Redirect to type selection
        const redirectParams = new URLSearchParams();
        if (ownerTypeParam) redirectParams.set('owner_type', ownerTypeParam);
        navigate(`/dashboard/products/select-type?${redirectParams.toString()}`);
        return;
      }

      // Set from URL params
      setProductType(productTypeParam);
      setOwnerType(ownerTypeParam);
      if (productTypeIdParam) {
        setProductTypeId(productTypeIdParam);
      }

      // Set defaults (all products are purchasable, public, and active by default)
      setIsPurchasable(true);
      setIsPublic(true);
      setIsActive(true);
      
      // Set category and variable flag based on product type
      if (productTypeParam === 'event') {
        setCategory('Event');
        setIsVariableProduct(false);
      } else if (productTypeParam === 'workshop') {
        setCategory('Workshop');
        setIsVariableProduct(false);
      } else if (productTypeParam === 'variable') {
        setIsVariableProduct(true);
      } else if (productTypeParam === 'simple') {
        setIsVariableProduct(false);
      } else if (productTypeParam === 'space' && ownerTypeParam === 'venue') {
        // Venue products
        if (productTypeIdParam === 'poster-space') {
          setCategory('Poster Space');
        } else if (productTypeIdParam === 'consignment-space') {
          setCategory('Consignment Space');
        } else if (productTypeIdParam === 'cup-sleeve') {
          setCategory('Cup Sleeve');
        } else if (productTypeIdParam === 'venue-rental') {
          setCategory('Venue Rental');
        }
      }
    } else if (id && profile) {
      loadProduct();
    }
  }, [id, profile, searchParams, navigate]);

  const fetchExistingCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .not('category', 'is', null)
        .neq('category', '');

      if (error) throw error;

      // Extract unique categories
      const uniqueCategories = Array.from(
        new Set(
          (data || [])
            .map((p) => p.category)
            .filter((cat): cat is string => typeof cat === 'string' && cat.trim() !== '')
        )
      ).sort();

      setExistingCategories(uniqueCategories);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

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
      setProductType(data.product_type || 'simple');
      setOwnerType(data.owner_type);
      setShortDescription(data.short_description || '');
      setFullDescription(data.full_description || '');
      const productCategory = data.category || '';
      setCategory(productCategory);
      // If category exists but not in existingCategories, add it
      if (productCategory && !existingCategories.includes(productCategory)) {
        setExistingCategories((prev) => [...prev, productCategory].sort());
      }
      setThumbnailUrl(data.thumbnail_url || '');
      // Convert cents to dollars for display
      setPriceInDollars(data.price_in_cents ? (data.price_in_cents / 100).toString() : '');
      setCurrency(data.currency || 'hkd');
      setIsPurchasable(data.is_purchasable ?? true);
      setIsPublic(data.is_public ?? true);
      setIsActive(data.is_active ?? true);

      // Load variable product data if it's a variable product
      if (data.product_type === 'variable') {
        setIsVariableProduct(true);
        const { data: variablesData, error: varsError } = await getProductVariables(id);
        if (!varsError && variablesData && variablesData.length > 0) {
          setVariables(
            variablesData.map((v) => ({
              name: v.name,
              values: v.values.map((val) => val.value),
            }))
          );
        }
      } else {
        setIsVariableProduct(false);
      }
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
    // Auto-generate slug (hidden from user but still used internally)
    setSlug(generateSlug(value));
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

    if (!productType) {
      toast({
        title: 'Validation Error',
        description: 'Product type is required',
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
      // Convert dollars to cents for storage
      const priceInCents = priceInDollars ? Math.round(parseFloat(priceInDollars) * 100) : 0;

      const productData = {
        name: name.trim(),
        slug: slug.trim() || generateSlug(name),
        product_type: productType as ProductType,
        owner_type: finalOwnerType,
        short_description: shortDescription.trim() || undefined,
        full_description: fullDescription.trim() || undefined,
        category: category.trim() || undefined,
        thumbnail_url: thumbnailUrl.trim() || undefined,
        price_in_cents: priceInCents,
        currency: currency,
        is_purchasable: isPurchasable,
        is_public: isPublic,
        is_active: isActive,
        suitable_collab_types: suitableCollabTypes,
        margin_notes: marginNotes.trim() || undefined,
        inventory_notes: inventoryNotes.trim() || undefined,
      };

      let savedProduct;
      if (isEditMode && id) {
        const { data, error } = await updateProduct({ ...productData, id }, profile);
        if (error) throw error;
        savedProduct = data;
        toast({
          title: 'Success',
          description: 'Product updated successfully',
        });
      } else {
        const { data, error } = await createProduct(productData, profile);
        if (error) throw error;
        savedProduct = data;
        toast({
          title: 'Success',
          description: 'Product created successfully',
        });
      }

      // Save variable product data if it's a variable product
      if (productType === 'variable' && savedProduct && variables.length > 0) {
        // Save variables and values
        const { error: varsError } = await saveProductVariables(savedProduct.id, variables);
        if (varsError) {
          toast({
            title: 'Warning',
            description: 'Product saved but failed to save variables: ' + varsError.message,
            variant: 'destructive',
          });
        } else {
          // Generate and save variations
          const { data: savedVariables } = await getProductVariables(savedProduct.id);
          if (savedVariables && savedVariables.length > 0) {
            const combinations = generateVariations(savedVariables);
            const variations = combinations.map((attrs) => ({
              attributes: attrs,
              stock_quantity: 0,
              is_active: true,
            }));
            const { error: variationsError } = await saveProductVariations(savedProduct.id, variations);
            if (variationsError) {
              toast({
                title: 'Warning',
                description: 'Variables saved but failed to generate variations: ' + variationsError.message,
                variant: 'destructive',
              });
            }
          }
        }
      }

      navigate('/dashboard/products');
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
              : productType === 'simple' || productType === 'variable'
                ? 'Create a new product'
                : productType === 'event'
                  ? 'Create a new event'
                  : productType === 'workshop'
                    ? 'Create a new workshop'
                    : ownerType === 'venue'
                      ? 'Create a new venue offering'
                      : 'Create a new product'}
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


                {/* Product Type - Read-only when creating (pre-selected) */}
                {!isEditMode ? (
                  <div className="space-y-2">
                    <Label>Product Type</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <div className="font-medium capitalize">
                        {productType === 'simple' && 'Simple Product'}
                        {productType === 'variable' && 'Variable Product'}
                        {productType === 'event' && 'Event'}
                        {productType === 'workshop' && 'Workshop'}
                        {productType === 'space' && ownerType === 'venue' && (
                          <>
                            {productTypeId === 'venue-rental' && 'Venue Rental'}
                            {productTypeId === 'poster-space' && 'Poster Space'}
                            {productTypeId === 'consignment-space' && 'Consignment Space'}
                            {productTypeId === 'cup-sleeve' && 'Cup Sleeve'}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="productType">
                      Product Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={productType}
                      onValueChange={(value) => {
                        setProductType(value as ProductType);
                        if (value === 'variable') {
                          setIsVariableProduct(true);
                        } else {
                          setIsVariableProduct(false);
                        }
                      }}
                      required
                    >
                      <SelectTrigger id="productType">
                        <SelectValue placeholder="Select product type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple Product</SelectItem>
                        <SelectItem value="variable">Variable Product</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="workshop">Workshop</SelectItem>
                        {profile?.is_venue && (
                          <>
                            <SelectItem value="space">Space</SelectItem>
                            <SelectItem value="booking">Booking</SelectItem>
                            <SelectItem value="service">Service</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

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
                  {!isCreatingNewCategory ? (
                    <Select
                      value={category || ''}
                      onValueChange={(value) => {
                        if (value === '__create_new__') {
                          setIsCreatingNewCategory(true);
                          setNewCategoryName('');
                        } else {
                          setCategory(value);
                        }
                      }}
                    >
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select or create a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {existingCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                        {/* Show current category if it's not in the list (for edit mode) */}
                        {category && !existingCategories.includes(category) && (
                          <SelectItem value={category}>
                            {category}
                          </SelectItem>
                        )}
                        <SelectItem value="__create_new__">
                          <span className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Create new Category
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        id="newCategory"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Enter new category name"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (newCategoryName.trim()) {
                              setCategory(newCategoryName.trim());
                              setExistingCategories((prev) => {
                                const updated = [...prev, newCategoryName.trim()].sort();
                                return updated;
                              });
                            }
                            setIsCreatingNewCategory(false);
                            setNewCategoryName('');
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIsCreatingNewCategory(false);
                            setNewCategoryName('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Product Type Selection for Simple/Variable Products */}
                {productType === 'simple' || productType === 'variable' ? (
                  <div className="space-y-2">
                    <Label>Product Variant Type</Label>
                    <Select 
                      value={isVariableProduct ? 'variable' : 'simple'} 
                      onValueChange={(value: 'simple' | 'variable') => {
                        setIsVariableProduct(value === 'variable');
                        setProductType(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple Product</SelectItem>
                        <SelectItem value="variable">Variable Product</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Simple: One price. Variable: Multiple options (size, color, etc.)
                    </p>
                  </div>
                ) : null}

                {/* Variable Product Management */}
                {productType === 'variable' && isVariableProduct && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between">
                      <Label>Product Variables</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setVariables([...variables, { name: '', values: [] }])}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Variable
                      </Button>
                    </div>
                    {variables.map((variable, varIndex) => (
                      <Card key={varIndex}>
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="Variable name (e.g., Size, Color)"
                                value={variable.name}
                                onChange={(e) => {
                                  const newVars = [...variables];
                                  newVars[varIndex].name = e.target.value;
                                  setVariables(newVars);
                                }}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setVariables(variables.filter((_, i) => i !== varIndex));
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm">Values</Label>
                              <div className="flex flex-wrap gap-2">
                                {variable.values.map((value, valIndex) => (
                                  <div key={valIndex} className="flex items-center gap-1 bg-background px-2 py-1 rounded border">
                                    <span className="text-sm">{value}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newVars = [...variables];
                                        newVars[varIndex].values = newVars[varIndex].values.filter((_, i) => i !== valIndex);
                                        setVariables(newVars);
                                      }}
                                      className="ml-1 text-muted-foreground hover:text-destructive"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                                <Input
                                  placeholder="Add value"
                                  className="w-32"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const input = e.currentTarget;
                                      const value = input.value.trim();
                                      if (value) {
                                        const newVars = [...variables];
                                        newVars[varIndex].values.push(value);
                                        setVariables(newVars);
                                        input.value = '';
                                      }
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {variables.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No variables added yet. Click "Add Variable" to create options like Size, Color, etc.
                      </p>
                    )}
                  </div>
                )}

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
                    <Label htmlFor="priceInDollars">Price</Label>
                    <Input
                      id="priceInDollars"
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceInDollars}
                      onChange={(e) => setPriceInDollars(e.target.value)}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter price in {currency.toUpperCase()} (e.g., 10.00 = $10.00)
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

