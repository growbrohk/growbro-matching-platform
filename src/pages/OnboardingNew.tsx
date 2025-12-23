import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Package, Building2 } from 'lucide-react';
import { toast } from 'sonner';

type OrgType = 'brand' | 'venue';

type Step = 'org' | 'type' | 'product' | 'inventory' | 'complete';

export default function OnboardingNew() {
  const navigate = useNavigate();
  const { user, orgMemberships, loading: authLoading, refreshOrgMemberships } = useAuth();
  const [step, setStep] = useState<Step>('org');
  const [loading, setLoading] = useState(false);
  const [membershipsLoading, setMembershipsLoading] = useState(true);
  
  // Step 1: Org creation
  const [orgName, setOrgName] = useState('');
  
  // Step 2: Org type
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  
  // Step 3: Product creation
  const [productType, setProductType] = useState<'physical' | 'venue_asset' | null>(null);
  const [productTitle, setProductTitle] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [variants, setVariants] = useState<Array<{ name: string; sku: string; price: string }>>([{ name: '', sku: '', price: '' }]);
  
  // Step 4: Inventory (for physical products)
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [initialStock, setInitialStock] = useState('0');

  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      toast.error('Please enter an organization name');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_org', { p_name: orgName.trim() });
      
      if (error) throw error;
      
      await refreshOrgMemberships();
      setStep('type');
      toast.success('Organization created!');
    } catch (error: any) {
      console.error('Error creating org:', error);
      toast.error(error.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const handleSetOrgType = async () => {
    if (!orgType) {
      toast.error('Please select an organization type');
      return;
    }

    setLoading(true);
    try {
      // Get user's org
      const { data: memberships } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user?.id)
        .limit(1)
        .single();
      
      if (!memberships) {
        throw new Error('Organization not found');
      }

      const { error } = await supabase
        .from('orgs')
        .update({ metadata: { org_type: orgType } })
        .eq('id', memberships.org_id);

      if (error) throw error;

      // Determine next step based on org type
      if (orgType === 'venue') {
        setProductType('venue_asset');
        setStep('product');
      } else {
        setStep('product');
      }
      
      await refreshOrgMemberships();
      toast.success('Organization type saved!');
    } catch (error: any) {
      console.error('Error setting org type:', error);
      toast.error(error.message || 'Failed to save organization type');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!productTitle.trim()) {
      toast.error('Please enter a product title');
      return;
    }

    if (!productType) {
      toast.error('Please select a product type');
      return;
    }

    setLoading(true);
    try {
      // Get current org
      const { data: memberships } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user?.id)
        .limit(1)
        .single();
      
      if (!memberships) throw new Error('Organization not found');
      
      const orgId = memberships.org_id;

      const basePrice = parseFloat(productPrice) || 0;

      // Filter out empty variants
      const validVariants = variants.filter(v => v.name.trim());
      const variantNames = validVariants.map(v => v.name.trim());
      const variantSkus = validVariants.map(v => v.sku.trim() || '');
      const variantPrices = validVariants.map(v => parseFloat(v.price) || basePrice);

      // Call RPC with variants or empty arrays
      const rpcParams: any = {
        p_org_id: orgId,
        p_type: productType,
        p_title: productTitle.trim(),
        p_base_price: basePrice,
      };
      
      if (variantNames.length > 0) {
        rpcParams.p_variant_names = variantNames;
        rpcParams.p_variant_skus = variantSkus;
        rpcParams.p_variant_prices = variantPrices;
      }
      
      const { data: productId, error } = await supabase.rpc('create_product_with_variants', rpcParams);

      if (error) throw error;

      // If physical product, go to inventory step
      if (productType === 'physical') {
        // Get default warehouse
        const { data: warehouses } = await supabase
          .from('warehouses')
          .select('id')
          .eq('org_id', orgId)
          .limit(1)
          .single();
        
        if (warehouses) {
          setWarehouseId(warehouses.id);
          setStep('inventory');
        } else {
          setStep('complete');
        }
      } else {
        setStep('complete');
      }

      toast.success('Product created!');
    } catch (error: any) {
      console.error('Error creating product:', error);
      toast.error(error.message || 'Failed to create product');
    } finally {
      setLoading(false);
    }
  };

  const handleSetInventory = async () => {
    if (!warehouseId) {
      toast.error('Warehouse not found');
      return;
    }

    setLoading(true);
    try {
      // Get current org and product
      const { data: memberships } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user?.id)
        .limit(1)
        .single();
      
      if (!memberships) throw new Error('Organization not found');

      const { data: products } = await supabase
        .from('products')
        .select('id, product_variants(id)')
        .eq('org_id', memberships.org_id)
        .limit(1)
        .single();

      if (!products || !products.product_variants || products.product_variants.length === 0) {
        throw new Error('Product or variants not found');
      }

      const variantId = (products.product_variants as any[])[0].id;
      const stock = parseInt(initialStock) || 0;

      if (stock > 0) {
        const { error } = await supabase.rpc('create_inventory_for_variant', {
          p_org_id: memberships.org_id,
          p_warehouse_id: warehouseId,
          p_variant_id: variantId,
          p_initial_stock: stock,
        });

        if (error) throw error;
      }

      setStep('complete');
      toast.success('Inventory set!');
    } catch (error: any) {
      console.error('Error setting inventory:', error);
      toast.error(error.message || 'Failed to set inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    navigate('/dashboard');
  };

  const addVariant = () => {
    setVariants([...variants, { name: '', sku: '', price: '' }]);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: 'name' | 'sku' | 'price', value: string) => {
    const updated = [...variants];
    updated[index][field] = value;
    setVariants(updated);
  };

  // Check if memberships are loaded
  useEffect(() => {
    if (!authLoading) {
      // Small delay to ensure orgMemberships are checked
      const timer = setTimeout(() => {
        setMembershipsLoading(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [authLoading, orgMemberships]);

  // Always render the shell UI immediately
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#FBF8F4' }}>
      <div className="w-full max-w-2xl">
        {/* Loading state overlay */}
        {(authLoading || membershipsLoading) && (
          <Card className="rounded-3xl border shadow-xl mb-4" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardContent className="pt-6 pb-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" style={{ color: '#0E7A3A' }} />
              <p style={{ color: '#0F1F17', fontSize: '14px' }}>
                {authLoading ? 'Loading your account...' : 'Checking your workspace...'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Main content shell - always visible */}
        <Card className="rounded-3xl border shadow-xl" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader>
            <CardTitle className="text-2xl" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
              Set up your Growbro workspace
            </CardTitle>
            <CardDescription style={{ color: 'rgba(15,31,23,0.72)' }}>
              {authLoading || membershipsLoading 
                ? 'Please wait while we load your account...'
                : step === 'org' 
                  ? 'Get started by creating your organization'
                  : step === 'type'
                  ? 'Choose your organization type'
                  : step === 'product'
                  ? 'Create your first product'
                  : step === 'inventory'
                  ? 'Set initial inventory'
                  : 'You\'re all set!'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Progress indicator - only show when not loading */}
            {!authLoading && !membershipsLoading && (
              <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: '#0F1F17' }}>
              Step {step === 'org' ? 1 : step === 'type' ? 2 : step === 'product' ? 3 : step === 'inventory' ? 4 : 5} of 5
            </span>
            <span className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
              {step === 'org' && 'Organization'}
              {step === 'type' && 'Organization Type'}
              {step === 'product' && 'First Product'}
              {step === 'inventory' && 'Inventory'}
              {step === 'complete' && 'Complete'}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: step === 'org' ? '20%' : step === 'type' ? '40%' : step === 'product' ? '60%' : step === 'inventory' ? '80%' : '100%',
                backgroundColor: '#0E7A3A',
              }}
            />
              </div>
            </div>
            )}

            {/* Step content - only show when not loading */}
            {!authLoading && !membershipsLoading && (
              <>
                {/* Step 1: Create Organization */}
                {step === 'org' && (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="orgName" style={{ color: '#0F1F17' }}>Organization Name</Label>
                      <Input
                        id="orgName"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="My Company"
                        className="mt-1"
                        style={{ backgroundColor: '#FBF8F4', color: '#0F1F17' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
                      />
                    </div>
                    <Button
                      onClick={handleCreateOrg}
                      disabled={loading || !orgName.trim()}
                      className="w-full"
                      style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Organization
                    </Button>
                  </div>
                )}

                {/* Step 2: Choose Organization Type */}
                {step === 'type' && (
                  <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setOrgType('brand')}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${
                    orgType === 'brand'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  style={{ borderColor: orgType === 'brand' ? '#0E7A3A' : 'rgba(14,122,58,0.14)' }}
                >
                  <Package className="h-8 w-8 mb-3" style={{ color: '#0E7A3A' }} />
                  <h3 className="font-semibold text-lg mb-1">Brand</h3>
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    I sell products (physical goods, merchandise, etc.)
                  </p>
                </button>
                <button
                  onClick={() => setOrgType('venue')}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${
                    orgType === 'venue'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  style={{ borderColor: orgType === 'venue' ? '#0E7A3A' : 'rgba(14,122,58,0.14)' }}
                >
                  <Building2 className="h-8 w-8 mb-3" style={{ color: '#0E7A3A' }} />
                  <h3 className="font-semibold text-lg mb-1">Venue</h3>
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    I provide spaces or services (cafés, event spaces, etc.)
                  </p>
                </button>
              </div>
              <Button
                onClick={handleSetOrgType}
                disabled={loading || !orgType}
                className="w-full"
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
                  </Button>
                  </div>
                )}

                {/* Step 3: Create First Product */}
                {step === 'product' && (
                  <div className="space-y-4">
              {orgType === 'brand' && (
                <div>
                  <Label>Product Type</Label>
                  <div className="flex gap-4 mt-2">
                    <button
                      onClick={() => setProductType('physical')}
                      className={`px-4 py-2 rounded-lg border ${
                        productType === 'physical' ? 'bg-primary/10 border-primary' : 'border-border'
                      }`}
                    >
                      Physical Product
                    </button>
                  </div>
                </div>
              )}

              {orgType === 'venue' && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                    Creating a venue asset product for your space
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="productTitle">Product Title</Label>
                <Input
                  id="productTitle"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                  placeholder={orgType === 'venue' ? 'Event Space' : 'T-Shirt'}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="productPrice">Base Price (optional)</Label>
                <Input
                  id="productPrice"
                  type="number"
                  step="0.01"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>

              {/* Variants */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Variants (optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addVariant}
                  >
                    Add Variant
                  </Button>
                </div>
                {variants.map((variant, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <Input
                      placeholder="Name (e.g., Size: Large)"
                      value={variant.name}
                      onChange={(e) => updateVariant(index, 'name', e.target.value)}
                    />
                    <Input
                      placeholder="SKU (optional)"
                      value={variant.sku}
                      onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                    />
                    <Input
                      placeholder="Price"
                      type="number"
                      step="0.01"
                      value={variant.price}
                      onChange={(e) => updateVariant(index, 'price', e.target.value)}
                    />
                    {variants.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeVariant(index)}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button
                onClick={handleCreateProduct}
                disabled={loading || !productTitle.trim()}
                className="w-full"
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Product
                  </Button>
                  </div>
                )}

                {/* Step 4: Set Initial Inventory (for physical products) */}
                {step === 'inventory' && (
                  <div className="space-y-4">
              <div>
                <Label htmlFor="initialStock">Initial Stock Quantity</Label>
                <Input
                  id="initialStock"
                  type="number"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  placeholder="0"
                  className="mt-1"
                />
                <p className="text-sm mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
                  You can skip this and add inventory later
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSetInventory}
                  disabled={loading}
                  className="flex-1"
                  style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Set Inventory
                </Button>
                <Button
                  onClick={() => setStep('complete')}
                  variant="outline"
                  disabled={loading}
                >
                  Skip for now
                </Button>
              </div>
                  </div>
                )}

                {/* Step 5: Complete */}
                {step === 'complete' && (
                  <>
                    <div className="text-center mb-6">
                      <div className="mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#0E7A3A' }}>
                        <Package className="h-8 w-8 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
                        You're all set!
                      </h3>
                      <p style={{ color: 'rgba(15,31,23,0.72)' }}>
                        Your organization and first product are ready
                      </p>
                    </div>
                    <Button
                      onClick={handleComplete}
                      className="w-full"
                      style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                    >
                      Go to Dashboard
                    </Button>
                  </>
                )}
              </>
            )}

            {/* Debug UI - non-production */}
            {!authLoading && !membershipsLoading && (
              <div className="mt-6 pt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <p className="text-xs text-center" style={{ color: 'rgba(15,31,23,0.5)' }}>
                  Debug: User ID: {user?.id?.substring(0, 8)}... | Memberships: {orgMemberships.length}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

