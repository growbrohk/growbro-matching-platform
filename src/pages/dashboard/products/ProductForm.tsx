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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Loader2, Plus, Save, Trash2, X, AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type OrgProductType = 'physical' | 'venue_asset';

type OrgProduct = {
  id: string;
  org_id: string;
  type: OrgProductType;
  title: string;
  description: string | null;
  base_price: number | null;
};

type VariantOption = {
  name: string;
  values: string[];
};

type VariantCombination = {
  id?: string;
  name: string;
  sku: string;
  price: string;
  active: boolean;
  isNew?: boolean; // not yet saved
};

function toDecimalOrNull(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

/**
 * Generate cartesian product of variant option values
 */
function generateVariantCombinations(options: VariantOption[], basePrice: string): VariantCombination[] {
  if (options.length === 0 || options.every(opt => opt.values.length === 0)) {
    return [];
  }

  // Filter out options with no values
  const validOptions = options.filter(opt => opt.values.length > 0);
  if (validOptions.length === 0) return [];

  // Generate cartesian product
  const combinations: string[][] = [[]];
  for (const option of validOptions) {
    const newCombinations: string[][] = [];
    for (const combination of combinations) {
      for (const value of option.values) {
        newCombinations.push([...combination, value]);
      }
    }
    combinations.length = 0;
    combinations.push(...newCombinations);
  }

  // Format combinations
  return combinations.map(combo => {
    const parts = validOptions.map((opt, idx) => `${opt.name}: ${combo[idx]}`);
    return {
      name: parts.join(' / '),
      sku: '',
      price: basePrice,
      active: true,
      isNew: true,
    };
  });
}

/**
 * Helper functions for variant option management
 */
function normalizeValue(s: string): string {
  return s.trim().toLowerCase();
}

function dedupeValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(v => {
    const normalized = normalizeValue(v);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isOptionsValid(options: VariantOption[]): { ok: boolean; message?: string } {
  if (options.length === 0) return { ok: true };

  for (const opt of options) {
    if (!opt.name.trim()) {
      return { ok: false, message: 'All option names must be non-empty' };
    }
    if (opt.values.length === 0) {
      return { ok: false, message: `Option "${opt.name}" must have at least one value` };
    }
    const normalized = opt.values.map(normalizeValue);
    const unique = new Set(normalized);
    if (normalized.length !== unique.size) {
      return { ok: false, message: `Option "${opt.name}" has duplicate values` };
    }
  }
  return { ok: true };
}

function optionsEqual(a: VariantOption[], b: VariantOption[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if (a[i].values.length !== b[i].values.length) return false;
    for (let j = 0; j < a[i].values.length; j++) {
      if (normalizeValue(a[i].values[j]) !== normalizeValue(b[i].values[j])) return false;
    }
  }
  return true;
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
  
  // New variant system: options → combinations
  // Draft options are editable; applied options are the last ones used to generate variants
  const [variantOptionsDraft, setVariantOptionsDraft] = useState<VariantOption[]>([]);
  const [variantOptionsApplied, setVariantOptionsApplied] = useState<VariantOption[]>([]);
  const [variants, setVariants] = useState<VariantCombination[]>([]);

  // Computed: check if there are pending option changes
  const hasPendingOptionChanges = useMemo(() => {
    if (variantOptionsDraft.length === 0 && variantOptionsApplied.length === 0) return false;
    return !optionsEqual(variantOptionsDraft, variantOptionsApplied);
  }, [variantOptionsDraft, variantOptionsApplied]);

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
        const { data: product, error: productError } = await (supabase as any)
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

        const { data: variantsData, error: variantsError } = await (supabase as any)
          .from('product_variants')
          .select('id, name, sku, price, active, archived_at, created_at')
          .eq('product_id', p.id)
          .is('archived_at', null) // Only load non-archived variants
          .order('created_at', { ascending: true });

        if (variantsError) throw variantsError;
        const v = (variantsData as any[] | null) || [];
        
        // Load existing variants (edit mode shows existing combinations, not options)
        if (v.length > 0) {
          setVariants(
            v.map((row) => ({
              id: row.id,
              name: row.name || '',
              sku: row.sku || '',
              price: row.price === null || row.price === undefined ? '' : String(row.price),
              active: row.active ?? true,
              isNew: false,
            }))
          );
          // Note: We don't reverse-engineer options from existing variants
          // User must manually set options if they want to regenerate
        }
      } catch (e: any) {
        toast({ title: 'Error', description: e?.message || 'Failed to load product', variant: 'destructive' });
        navigate('/app/products');
    } finally {
      setLoading(false);
    }
  };

    load();
  }, [currentOrg, id, isEditMode, navigate, toast]);

  // Variant Option Management
  const addOption = () => {
    if (variantOptionsDraft.length >= 2) {
      toast({ title: 'Limit reached', description: 'Maximum 2 variant options allowed', variant: 'destructive' });
      return;
    }
    setVariantOptionsDraft((prev) => [...prev, { name: '', values: [] }]);
  };

  const removeOption = (idx: number) => {
    setVariantOptionsDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateOptionName = (idx: number, name: string) => {
    setVariantOptionsDraft((prev) => prev.map((opt, i) => (i === idx ? { ...opt, name } : opt)));
  };

  const addOptionValue = (idx: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setVariantOptionsDraft((prev) =>
      prev.map((opt, i) => {
        if (i !== idx) return opt;
        // Check for duplicates (case-insensitive)
        const normalized = normalizeValue(trimmed);
        const exists = opt.values.some(v => normalizeValue(v) === normalized);
        if (exists) {
          toast({ title: 'Duplicate value', description: `"${trimmed}" already exists`, variant: 'destructive' });
          return opt;
        }
        return { ...opt, values: [...opt.values, trimmed] };
      })
    );
  };

  const updateOptionValue = (optIdx: number, valIdx: number, newValue: string) => {
    const trimmed = newValue.trim();
    if (!trimmed) return;

    setVariantOptionsDraft((prev) =>
      prev.map((opt, i) => {
        if (i !== optIdx) return opt;
        // Check for duplicates excluding the current value
        const normalized = normalizeValue(trimmed);
        const exists = opt.values.some((v, j) => j !== valIdx && normalizeValue(v) === normalized);
        if (exists) {
          toast({ title: 'Duplicate value', description: `"${trimmed}" already exists`, variant: 'destructive' });
          return opt;
        }
        return {
          ...opt,
          values: opt.values.map((v, j) => (j === valIdx ? trimmed : v)),
        };
      })
    );
  };

  const removeOptionValue = (optIdx: number, valIdx: number) => {
    setVariantOptionsDraft((prev) =>
      prev.map((opt, i) => (i === optIdx ? { ...opt, values: opt.values.filter((_, j) => j !== valIdx) } : opt))
    );
  };

  const regenerateVariants = () => {
    // Validate draft options
    const validation = isOptionsValid(variantOptionsDraft);
    if (!validation.ok) {
      toast({ title: 'Invalid options', description: validation.message, variant: 'destructive' });
      return;
    }

    // Generate new combinations
    const generated = generateVariantCombinations(variantOptionsDraft, basePrice);
    if (generated.length === 0) {
      toast({ title: 'No variants', description: 'Add at least one option with values first', variant: 'destructive' });
      return;
    }

    // Create a map of existing variants by name
    const existingByName = new Map<string, VariantCombination>();
    variants.forEach(v => existingByName.set(v.name, v));

    // Create a set of new variant names
    const generatedNames = new Set(generated.map(g => g.name));

    // Merge: prefer existing data (SKU/price/active/id) if name matches
    const merged = generated.map(gen => {
      const existing = existingByName.get(gen.name);
      return existing ? { ...existing, name: gen.name } : gen;
    });

    // Determine which variants will be archived
    const toArchive = variants.filter(v => !generatedNames.has(v.name));

    // Calculate counts
    const addedCount = generated.filter(g => !existingByName.has(g.name)).length;
    const archivedCount = toArchive.length;
    const keptCount = generated.filter(g => existingByName.has(g.name)).length;

    // Apply changes
    setVariants(merged);
    setVariantOptionsApplied(JSON.parse(JSON.stringify(variantOptionsDraft))); // deep clone

    // Show summary
    const parts: string[] = [];
    if (addedCount > 0) parts.push(`${addedCount} added`);
    if (keptCount > 0) parts.push(`${keptCount} kept`);
    if (archivedCount > 0) parts.push(`${archivedCount} will be archived on save`);

    toast({
      title: 'Variants regenerated',
      description: parts.length > 0 ? parts.join(', ') : 'No changes',
    });
  };

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
        const { data: created, error: createError } = await (supabase as any)
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
        const { error: updateError } = await (supabase as any)
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

      // Variant save logic with archival
      if (variants.length > 0) {
        // Prepare current variants
        const currentVariants = variants
          .filter((v) => v.name.trim().length > 0)
          .map((v) => ({
            id: v.id,
            name: v.name.trim(),
            sku: v.sku?.trim() || null,
            price: toDecimalOrNull(v.price || ''),
            active: v.active,
          }));

        // Fetch all existing variants (including archived) for comparison
        const { data: existingVariants, error: fetchErr } = await (supabase as any)
          .from('product_variants')
          .select('id, name')
          .eq('product_id', productId!)
          .is('archived_at', null);

        if (fetchErr) throw fetchErr;

        const existingMap = new Map<string, string>((existingVariants || []).map((v: any) => [v.name, v.id]));
        const currentNames = new Set(currentVariants.map((v) => v.name));

        // 1. Archive variants that no longer exist in current list
        for (const [name, id] of existingMap) {
          if (!currentNames.has(name)) {
            const { error: archiveErr } = await (supabase as any)
              .from('product_variants')
              .update({ archived_at: new Date().toISOString() })
              .eq('id', id);
            if (archiveErr) throw archiveErr;
          }
        }

        // 2. Update existing variants
        const toUpdate = currentVariants.filter((v) => !!v.id);
        for (const v of toUpdate) {
          const { error: updateErr } = await (supabase as any)
            .from('product_variants')
            .update({ name: v.name, sku: v.sku, price: v.price, active: v.active })
            .eq('id', v.id);
          if (updateErr) throw updateErr;
        }

        // 3. Insert new variants
        const toInsert = currentVariants.filter((v) => !v.id);
        if (toInsert.length > 0) {
          const { error: insertErr } = await (supabase as any).from('product_variants').insert(
            toInsert.map((v) => ({
              product_id: productId,
              name: v.name,
              sku: v.sku,
              price: v.price,
              active: v.active,
            }))
          );
          if (insertErr) throw insertErr;
        }
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

            {/* Hide variants section for venue assets */}
            {type !== 'venue_asset' && (
              <div className="space-y-6">
                {/* Variant Options Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Variant Options</Label>
                      <p className="text-sm text-muted-foreground">
                        Define options (e.g., Size, Color) and their values. Max 2 options.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addOption}
                      disabled={variantOptionsDraft.length >= 2}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Option
                    </Button>
                  </div>

                  {variantOptionsDraft.map((option, optIdx) => (
                    <VariantOptionInput
                      key={optIdx}
                      option={option}
                      onUpdateName={(name) => updateOptionName(optIdx, name)}
                      onAddValue={(value) => addOptionValue(optIdx, value)}
                      onUpdateValue={(valIdx, newValue) => updateOptionValue(optIdx, valIdx, newValue)}
                      onRemoveValue={(valIdx) => removeOptionValue(optIdx, valIdx)}
                      onRemove={() => removeOption(optIdx)}
                    />
                  ))}

                  {/* Pending changes banner */}
                  {hasPendingOptionChanges && variantOptionsDraft.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Variant options changed. Regenerate variants to update combinations.
                        This may add new variants and archive removed variants. Existing SKU/price will be kept when possible.
                      </AlertDescription>
                    </Alert>
                  )}

                  {variantOptionsDraft.length > 0 && (
                    <Button
                      type="button"
                      onClick={regenerateVariants}
                      variant="secondary"
                      disabled={!isOptionsValid(variantOptionsDraft).ok}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate Variants
                    </Button>
                  )}
                </div>

                {/* Variant Combinations Table */}
                {variants.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <Label>Variant Combinations</Label>
                      <p className="text-sm text-muted-foreground">
                        Edit SKU, price, and active status for each variant.
                      </p>
                    </div>

                    <div className="border rounded-lg divide-y">
                      {variants.map((v, idx) => (
                        <div key={v.id ?? idx} className="grid grid-cols-12 gap-3 items-center p-3">
                          <div className="col-span-4">
                            <p className="text-sm font-medium">{v.name}</p>
                          </div>
                          <div className="col-span-3">
                            <Input
                              placeholder="SKU"
                              value={v.sku}
                              onChange={(e) =>
                                setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, sku: e.target.value } : x)))
                              }
                            />
                          </div>
                          <div className="col-span-3">
                            <Input
                              placeholder="Price"
                              value={v.price}
                              onChange={(e) =>
                                setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))
                              }
                            />
                          </div>
                          <div className="col-span-2 flex items-center justify-end gap-2">
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={v.active}
                                onCheckedChange={(checked) =>
                                  setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, active: checked } : x)))
                                }
                              />
                              <span className="text-xs text-muted-foreground">Active</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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

/**
 * Component for entering a single variant option (name + values)
 */
function VariantOptionInput({
  option,
  onUpdateName,
  onAddValue,
  onUpdateValue,
  onRemoveValue,
  onRemove,
}: {
  option: VariantOption;
  onUpdateName: (name: string) => void;
  onAddValue: (value: string) => void;
  onUpdateValue: (valIdx: number, newValue: string) => void;
  onRemoveValue: (valIdx: number) => void;
  onRemove: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAddValue = () => {
    if (inputValue.trim()) {
      onAddValue(inputValue);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddValue();
    }
  };

  const startEditing = (idx: number, currentValue: string) => {
    setEditingIdx(idx);
    setEditValue(currentValue);
  };

  const finishEditing = () => {
    if (editingIdx !== null && editValue.trim() && editValue.trim() !== option.values[editingIdx]) {
      onUpdateValue(editingIdx, editValue);
    }
    setEditingIdx(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEditing();
    } else if (e.key === 'Escape') {
      setEditingIdx(null);
      setEditValue('');
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Option name (e.g., Size, Color)"
          value={option.name}
          onChange={(e) => onUpdateName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Values</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Add value and press Enter"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!option.name.trim()}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleAddValue}
            disabled={!option.name.trim() || !inputValue.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {option.values.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {option.values.map((value, idx) => (
              <div key={idx}>
                {editingIdx === idx ? (
                  <div className="inline-flex items-center gap-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={finishEditing}
                      autoFocus
                      className="h-7 w-32 text-sm"
                    />
                  </div>
                ) : (
                  <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => startEditing(idx, value)}>
                    {value}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveValue(idx);
                      }}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

