import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';

type OrgProductType = 'physical' | 'venue_asset';

type OrgProduct = {
  id: string;
  org_id: string;
  type: OrgProductType;
  title: string;
  description: string | null;
  base_price: number | null;
};

type Variant = {
  id?: string;
  name: string;
  sku?: string;
  price?: string; // user input (decimal)
};

function toDecimalOrNull(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export default function ProductForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentOrg } = useAuth();
  const { toast } = useToast();

  const isEditMode = !!id;
  const initialType = (searchParams.get('type') as OrgProductType | null) ?? 'physical';

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<OrgProductType>(initialType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [variants, setVariants] = useState<Variant[]>([{ name: 'Default', sku: '', price: '' }]);

  const canSubmit = useMemo(() => {
    if (!currentOrg?.id) return false;
    if (!title.trim()) return false;
    return true;
  }, [currentOrg?.id, title]);

  useEffect(() => {
    if (!isEditMode) return;
    if (!id) return;
    if (!currentOrg) return;

    const load = async () => {
    setLoading(true);
    try {
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('id, org_id, type, title, description, base_price')
          .eq('id', id)
          .eq('org_id', currentOrg.id)
          .single();

        if (productError) throw productError;
        const p = product as any as OrgProduct;

        setType(p.type);
        setTitle(p.title);
        setDescription(p.description || '');
        setBasePrice(p.base_price === null ? '' : String(p.base_price));

        const { data: variantsData, error: variantsError } = await supabase
          .from('product_variants')
          .select('id, name, sku, price, created_at')
          .eq('product_id', p.id)
          .order('created_at', { ascending: true });

        if (variantsError) throw variantsError;
        const v = (variantsData as any[] | null) || [];
        setVariants(
          v.length > 0
            ? v.map((row) => ({
                id: row.id,
                name: row.name || '',
                sku: row.sku || '',
                price: row.price === null || row.price === undefined ? '' : String(row.price),
              }))
            : [{ name: 'Default', sku: '', price: p.base_price === null ? '' : String(p.base_price) }]
        );
      } catch (e: any) {
        toast({ title: 'Error', description: e?.message || 'Failed to load product', variant: 'destructive' });
        navigate('/app/products');
    } finally {
      setLoading(false);
    }
  };

    load();
  }, [currentOrg, id, isEditMode, navigate, toast]);

  const addVariant = () => setVariants((prev) => [...prev, { name: '', sku: '', price: '' }]);
  const removeVariant = (idx: number) => setVariants((prev) => prev.filter((_, i) => i !== idx));

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    if (!title.trim()) {
      toast({ title: 'Validation', description: 'Title is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const base_price = toDecimalOrNull(basePrice);

      let productId = id;
      if (!isEditMode) {
        const { data: created, error: createError } = await supabase
          .from('products')
          .insert({
            org_id: currentOrg.id,
            type,
            title: title.trim(),
            description: description.trim() || null,
            base_price,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        productId = (created as any).id as string;
      } else {
        const { error: updateError } = await supabase
          .from('products')
          .update({
            type,
            title: title.trim(),
            description: description.trim() || null,
            base_price,
          })
          .eq('id', id!)
          .eq('org_id', currentOrg.id);

        if (updateError) throw updateError;
      }

      // Variants: update existing by id, insert new ones. Avoid deleting existing IDs (may be referenced by inventory).
      const cleaned = variants
        .map((v) => ({
          id: v.id,
          name: v.name.trim(),
          sku: v.sku?.trim() || null,
          price: toDecimalOrNull(v.price || ''),
        }))
        .filter((v) => v.name.length > 0);

      if (cleaned.length === 0) {
        cleaned.push({ id: undefined, name: 'Default', sku: null, price: base_price });
      }

      const existing = cleaned.filter((v) => !!v.id);
      const fresh = cleaned.filter((v) => !v.id);

      for (const v of existing) {
        const { error: vErr } = await supabase
          .from('product_variants')
          .update({ name: v.name, sku: v.sku, price: v.price })
          .eq('id', v.id);
        if (vErr) throw vErr;
      }

      if (fresh.length > 0) {
        const { error: insertErr } = await supabase.from('product_variants').insert(
          fresh.map((v) => ({
            product_id: productId,
            name: v.name,
            sku: v.sku,
            price: v.price,
          }))
        );
        if (insertErr) throw insertErr;
      }

      toast({ title: 'Success', description: isEditMode ? 'Product updated' : 'Product created' });
      navigate('/app/products');
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to save product', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <Button variant="ghost" onClick={() => navigate('/app/products')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>

            <Card>
              <CardHeader>
          <CardTitle>{isEditMode ? 'Edit Product' : 'Create Product'}</CardTitle>
          <CardDescription>Products are scoped to your organization.</CardDescription>
              </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="space-y-6">
                <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                <Button type="button" variant={type === 'physical' ? 'default' : 'outline'} onClick={() => setType('physical')}>
                  Physical
                </Button>
                <Button type="button" variant={type === 'venue_asset' ? 'default' : 'outline'} onClick={() => setType('venue_asset')}>
                  Venue Asset
                </Button>
                    </div>
                  </div>

                <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tote Bag" />
                </div>

                <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
                </div>

                <div className="space-y-2">
              <Label htmlFor="basePrice">Base Price (decimal)</Label>
              <Input id="basePrice" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="e.g. 199.00" />
                      </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Variants</Label>
                  <p className="text-sm text-muted-foreground">
                    You can add more variants later. We won’t delete existing variants to avoid breaking inventory.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={addVariant}>
                        <Plus className="mr-2 h-4 w-4" />
                  Add Variant
                      </Button>
              </div>

              <div className="space-y-3">
                {variants.map((v, idx) => (
                  <div key={v.id ?? idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border rounded-lg p-3">
                    <div className="md:col-span-5 space-y-1">
                      <Label>Name</Label>
                      <Input value={v.name} onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                    </div>
                    <div className="md:col-span-4 space-y-1">
                      <Label>SKU</Label>
                      <Input value={v.sku || ''} onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, sku: e.target.value } : x)))} />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label>Price</Label>
                      <Input value={v.price || ''} onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))} />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <Button type="button" variant="ghost" onClick={() => removeVariant(idx)} disabled={variants.length <= 1 && !v.id}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                    ))}
                  </div>
                </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate('/app/products')} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEditMode ? 'Save Changes' : 'Create Product'}
              </Button>
          </div>
        </form>
        </CardContent>
      </Card>
    </div>
  );
}


