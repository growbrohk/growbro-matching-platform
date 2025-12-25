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
import { ArrowLeft, Loader2, Plus, Save, Trash2, X, AlertCircle, RefreshCw, Warehouse as WarehouseIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  getCategories, 
  createCategory as apiCreateCategory, 
  getTags, 
  createTag as apiCreateTag,
  syncProductTags,
  getProductTagIds,
  type ProductCategory,
  type ProductTag,
} from '@/lib/api/categories-and-tags';

type OrgProductType = 'physical' | 'venue_asset';

type OrgProduct = {
  id: string;
  org_id: string;
  type: OrgProductType;
  title: string;
  description: string | null;
  base_price: number | null;
  category_id?: string | null;
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
  stock?: string; // stock at selected warehouse
  isNew?: boolean; // not yet saved
  sig?: string; // stable signature based on values (e.g., "m|black")
};

type Warehouse = {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
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
    const sig = combo.map(normalizeValue).join('|');
    return {
      name: parts.join(' / '),
      sku: '',
      price: basePrice,
      active: true,
      isNew: true,
      sig,
    };
  });
}

/**
 * Helper functions for variant option management
 */
function normalizeValue(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Extract values from variant name and create a stable signature
 * E.g., "Size: M / Color: Black" -> "m|black"
 * This allows matching variants even when option names change
 */
function signatureFromVariantName(name: string): string {
  // Split by " / " to get each "Option: Value" pair
  const parts = name.split(' / ');
  // Extract values (after ':') and normalize
  const values = parts
    .map(part => {
      const colonIdx = part.indexOf(':');
      return colonIdx >= 0 ? part.substring(colonIdx + 1).trim() : part.trim();
    })
    .map(normalizeValue)
    .filter(v => v.length > 0); // Filter out empty values
  return values.join('|');
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

/**
 * Generate SKU from product title and variant signature
 * Format: PRODUCTTITLE-SIG (e.g., TOTEBAG-M-BLACK)
 */
function generateSKU(productTitle: string, sig: string, existingSkus: string[]): string {
  // Create base: product title slug + sig
  const titleSlug = productTitle
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 20); // Max 20 chars for title part
  
  const sigPart = sig
    .toUpperCase()
    .replace(/\|/g, '-');
  
  let baseSku = `${titleSlug}-${sigPart}`;
  
  // If this SKU already exists, append -2, -3, etc.
  let finalSku = baseSku;
  let counter = 2;
  while (existingSkus.includes(finalSku)) {
    finalSku = `${baseSku}-${counter}`;
    counter++;
  }
  
  return finalSku;
}

export default function ProductForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentOrg, user } = useAuth();
  const { toast } = useToast();

  const isEditMode = !!id;
  const initialType = (searchParams.get('type') as OrgProductType | null) ?? 'physical';

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<OrgProductType>(initialType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  
  // Category & Tags (using database tables)
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<ProductTag[]>([]);
  const [tagInput, setTagInput] = useState('');
  
  // Warehouses & Stock
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map()); // variant_id -> quantity
  const [createWarehouseOpen, setCreateWarehouseOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseAddress, setNewWarehouseAddress] = useState('');
  
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

  // Load warehouses and stock for selected warehouse
  const loadWarehouses = async (variantsList: VariantCombination[]) => {
    if (!currentOrg) return;
    
    try {
      // Fetch warehouses
      const { data: whData, error: whErr } = await (supabase as any)
        .from('warehouses')
        .select('id, org_id, name, address')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: true });
      
      if (whErr) throw whErr;
      
      const whs = (whData as any[] || []) as Warehouse[];
      setWarehouses(whs);
      
      // Load categories and tags from database tables
      const [categoriesData, tagsData] = await Promise.all([
        getCategories(currentOrg.id),
        getTags(currentOrg.id),
      ]);
      
      setCategories(categoriesData);
      setAvailableTags(tagsData);
      
      if (whs.length === 0) return;
      
      // Select default warehouse: prefer "Main" (case-insensitive), else first
      const mainWh = whs.find(w => w.name.toLowerCase().includes('main')) || whs[0];
      setSelectedWarehouseId(mainWh.id);
      
      // Load stock for this warehouse and these variants
      if (variantsList.length > 0) {
        await loadStockForWarehouse(mainWh.id, variantsList);
      }
    } catch (e: any) {
      console.error('Failed to load warehouses:', e);
    }
  };

  // Load stock for given warehouse and variants
  const loadStockForWarehouse = async (warehouseId: string, variantsList: VariantCombination[]) => {
    if (!currentOrg || variantsList.length === 0) return;
    
    try {
      const variantIds = variantsList.map(v => v.id).filter(Boolean) as string[];
      if (variantIds.length === 0) return;
      
      const { data: invData, error: invErr } = await (supabase as any)
        .from('inventory_items')
        .select('id, variant_id, quantity')
        .eq('org_id', currentOrg.id)
        .eq('warehouse_id', warehouseId)
        .in('variant_id', variantIds);
      
      if (invErr) throw invErr;
      
      const map = new Map<string, number>();
      (invData || []).forEach((item: any) => {
        map.set(item.variant_id, item.quantity);
      });
      setStockMap(map);
      
      // Update variants with stock values
      setVariants(prev => prev.map(v => ({
        ...v,
        stock: v.id ? String(map.get(v.id) || 0) : '0',
      })));
    } catch (e: any) {
      console.error('Failed to load stock:', e);
    }
  };

  useEffect(() => {
    if (!isEditMode) return;
    if (!id) return;
    if (!currentOrg) return;

    const load = async () => {
    setLoading(true);
    try {
        const { data: product, error: productError } = await (supabase as any)
          .from('products')
          .select('id, org_id, type, title, description, base_price, metadata')
          .eq('id', id)
          .eq('org_id', currentOrg.id)
          .single();

        if (productError) throw productError;
        const p = product as any as (OrgProduct & { metadata?: any });

        setType(p.type);
        setTitle(p.title);
        setDescription(p.description || '');
        setBasePrice(p.base_price === null ? '' : String(p.base_price));
        
        // Load category_id
        setCategoryId(p.category_id || '');
        
        // Load tags from product_tag_links
        const tagIds = await getProductTagIds(p.id);
        setSelectedTagIds(tagIds);

        const { data: variantsData, error: variantsError } = await (supabase as any)
          .from('product_variants')
          .select('id, name, sku, price, active, archived_at, created_at')
          .eq('product_id', p.id)
          .is('archived_at', null) // Only load non-archived variants
          .order('created_at', { ascending: true });

        if (variantsError) throw variantsError;
        const v = (variantsData as any[] | null) || [];
        
        // Load existing variants (edit mode shows existing combinations, not options)
        const variantsList = v.map((row: any) => ({
              id: row.id,
              name: row.name || '',
              sku: row.sku || '',
              price: row.price === null || row.price === undefined ? '' : String(row.price),
              active: row.active ?? true,
          stock: '0',
              isNew: false,
              sig: signatureFromVariantName(row.name || ''),
        }));
        
        if (variantsList.length > 0) {
          setVariants(variantsList);
        }
        
        // Load warehouses
        await loadWarehouses(variantsList);
      } catch (e: any) {
        toast({ title: 'Error', description: e?.message || 'Failed to load product', variant: 'destructive' });
        navigate('/app/products');
    } finally {
      setLoading(false);
    }
  };

    load();
  }, [currentOrg, id, isEditMode, navigate, toast]);

  // Load warehouses for new products
  useEffect(() => {
    if (isEditMode) return; // Already loaded in load()
    if (!currentOrg) return;
    
    const loadWhs = async () => {
      try {
        const { data: whData, error: whErr } = await (supabase as any)
          .from('warehouses')
          .select('id, org_id, name, address')
          .eq('org_id', currentOrg.id)
          .order('created_at', { ascending: true });
        
        if (whErr) throw whErr;
        
        const whs = (whData as any[] || []) as Warehouse[];
        setWarehouses(whs);
        
        if (whs.length > 0) {
          const mainWh = whs.find(w => w.name.toLowerCase().includes('main')) || whs[0];
          setSelectedWarehouseId(mainWh.id);
        }
        
        // Load categories and tags from database tables
        const [categoriesData, tagsData] = await Promise.all([
          getCategories(currentOrg.id),
          getTags(currentOrg.id),
        ]);
        
        setCategories(categoriesData);
        setAvailableTags(tagsData);
      } catch (e: any) {
        console.error('Failed to load warehouses:', e);
      }
    };
    
    loadWhs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, currentOrg?.id]);

  // Reload stock when warehouse changes (only in edit mode with existing variants)
  useEffect(() => {
    if (!isEditMode) return;
    if (!selectedWarehouseId) return;
    if (variants.length === 0) return;
    
    loadStockForWarehouse(selectedWarehouseId, variants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouseId]);

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

  // Category management
  const createCategory = async () => {
    if (!currentOrg) return;
    
    const cat = newCategoryName.trim();
    if (!cat) {
      toast({ title: 'Validation', description: 'Category name is required', variant: 'destructive' });
      return;
    }
    
    if (categories.some(c => c.name.toLowerCase() === cat.toLowerCase())) {
      toast({ title: 'Duplicate', description: 'Category already exists', variant: 'destructive' });
      return;
    }
    
    setSaving(true);
    try {
      const newCategory = await apiCreateCategory(currentOrg.id, cat);
      
      // Update local state
      setCategories([...categories, newCategory]);
      setCategoryId(newCategory.id);
      setCreateCategoryOpen(false);
      setNewCategoryName('');
      toast({ title: 'Success', description: 'Category created' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to create category', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Tag management
  const addTag = async () => {
    if (!currentOrg) return;
    
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    
    // Check if tag already exists
    let existingTag = availableTags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
    
    if (!existingTag) {
      // Create new tag
      try {
        existingTag = await apiCreateTag(currentOrg.id, trimmed);
        setAvailableTags([...availableTags, existingTag]);
      } catch (error: any) {
        toast({ title: 'Error', description: error.message || 'Failed to create tag', variant: 'destructive' });
        return;
      }
    }
    
    // Add to selected tags if not already selected
    if (!selectedTagIds.includes(existingTag.id)) {
      setSelectedTagIds([...selectedTagIds, existingTag.id]);
    }
    
    setTagInput('');
  };

  const removeTag = (tagId: string) => {
    setSelectedTagIds(prev => prev.filter(id => id !== tagId));
  };

  // Create warehouse handler
  const createWarehouse = async () => {
    if (!currentOrg) return;
    if (!newWarehouseName.trim()) {
      toast({ title: 'Validation', description: 'Warehouse name is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: newWh, error: whErr } = await (supabase as any)
        .from('warehouses')
        .insert({
          org_id: currentOrg.id,
          name: newWarehouseName.trim(),
          address: newWarehouseAddress.trim() || null,
        })
        .select('id, org_id, name, address')
        .single();

      if (whErr) throw whErr;

      const warehouse = newWh as Warehouse;
      setWarehouses(prev => [...prev, warehouse]);
      setSelectedWarehouseId(warehouse.id);
      setCreateWarehouseOpen(false);
      setNewWarehouseName('');
      setNewWarehouseAddress('');
      toast({ title: 'Success', description: 'Warehouse created' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to create warehouse', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Variant field updates
  const updateVariantField = (idx: number, field: keyof VariantCombination, value: any) => {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
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

    // Create a map of existing variants by signature (not name)
    // This allows matching even when option names change
    const existingBySig = new Map<string, VariantCombination>();
    variants.forEach(v => {
      const sig = v.sig || signatureFromVariantName(v.name);
      existingBySig.set(sig, v);
    });

    // Create a set of new variant signatures
    const generatedSigs = new Set(generated.map(g => g.sig!));

    // Merge: prefer existing data (SKU/price/active/stock/id) if signature matches
    const merged = generated.map(gen => {
      const existing = existingBySig.get(gen.sig!);
      return existing ? { ...existing, name: gen.name, sig: gen.sig } : { ...gen, stock: '0' };
    });

    // Determine which variants will be archived (by signature)
    const toArchive = variants.filter(v => {
      const sig = v.sig || signatureFromVariantName(v.name);
      return !generatedSigs.has(sig);
    });

    // Calculate counts
    const addedCount = generated.filter(g => !existingBySig.has(g.sig!)).length;
    const archivedCount = toArchive.length;
    const keptCount = generated.filter(g => existingBySig.has(g.sig!)).length;

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
            category_id: categoryId || null,
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
            category_id: categoryId || null,
          })
          .eq('id', id!)
          .eq('org_id', currentOrg.id);

        if (updateError) throw updateError;
      }
      
      // Sync product tags
      await syncProductTags(productId, selectedTagIds);

      // Variant save logic with archival
      if (variants.length > 0) {
        // Collect existing SKUs for auto-generation
        const existingSkus = variants
          .map(v => v.sku?.trim())
          .filter(Boolean) as string[];
        
        // Prepare current variants with SKU auto-generation
        const currentVariants = variants
          .filter((v) => v.name.trim().length > 0)
          .map((v) => {
            let sku = v.sku?.trim();
            // Auto-generate SKU if blank
            if (!sku) {
              const sig = v.sig || signatureFromVariantName(v.name);
              sku = generateSKU(title, sig, existingSkus);
              existingSkus.push(sku); // Add to list to avoid duplicates in this batch
            }
            return {
            id: v.id,
            name: v.name.trim(),
              sku,
            price: toDecimalOrNull(v.price || ''),
            active: v.active,
            };
          });

        // Fetch all existing variants (including archived) for comparison
        const { data: existingVariants, error: fetchErr } = await (supabase as any)
          .from('product_variants')
          .select('id, name')
          .eq('product_id', productId!)
          .is('archived_at', null);

        if (fetchErr) throw fetchErr;

        // Build signature-based maps for comparison (not name-based)
        const existingSigToId = new Map<string, string>(
          (existingVariants || []).map((v: any) => [signatureFromVariantName(v.name), v.id])
        );
        const currentSigSet = new Set(
          currentVariants.map((v) => signatureFromVariantName(v.name))
        );

        // 1. Archive variants whose signature no longer exists in current list
        for (const [sig, id] of existingSigToId) {
          if (!currentSigSet.has(sig)) {
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
          const { error: insertErr, data: insertedData } = await (supabase as any)
            .from('product_variants')
            .insert(
            toInsert.map((v) => ({
              product_id: productId,
              name: v.name,
              sku: v.sku,
              price: v.price,
              active: v.active,
            }))
            )
            .select('id');
          if (insertErr) throw insertErr;
          
          // Update variants state with new IDs for stock saving
          const insertedIds = (insertedData || []).map((d: any) => d.id);
          let idIdx = 0;
          setVariants(prev => prev.map(v => {
            if (!v.id && idIdx < insertedIds.length) {
              return { ...v, id: insertedIds[idIdx++] };
            }
            return v;
          }));
        }
      }

      // Save stock changes (only for edit mode with selected warehouse)
      if (isEditMode && selectedWarehouseId && variants.length > 0) {
        try {
          for (const variant of variants) {
            if (!variant.id) continue; // Skip unsaved variants
            
            const newStock = Number(variant.stock || 0);
            if (!Number.isFinite(newStock) || newStock < 0) continue;
            
            // Check if inventory_item exists
            const { data: invItem, error: fetchErr } = await (supabase as any)
              .from('inventory_items')
              .select('id, quantity')
              .eq('org_id', currentOrg.id)
              .eq('warehouse_id', selectedWarehouseId)
              .eq('variant_id', variant.id)
              .maybeSingle();
            
            if (fetchErr) throw fetchErr;
            
            let inventoryItemId: string;
            let oldQty = 0;
            
            if (invItem) {
              inventoryItemId = invItem.id;
              oldQty = invItem.quantity;
            } else {
              // Create inventory_item with quantity 0
              const { data: newInvItem, error: createErr } = await (supabase as any)
                .from('inventory_items')
                .insert({
                  org_id: currentOrg.id,
                  warehouse_id: selectedWarehouseId,
                  variant_id: variant.id,
                  quantity: 0,
                })
                .select('id')
                .single();
              
              if (createErr) throw createErr;
              inventoryItemId = newInvItem.id;
            }
            
            // Only update if stock changed
            const delta = newStock - oldQty;
            if (delta !== 0) {
              // Update inventory_items quantity
              const { error: updateErr } = await (supabase as any)
                .from('inventory_items')
                .update({ quantity: newStock, updated_at: new Date().toISOString() })
                .eq('id', inventoryItemId);
              
              if (updateErr) throw updateErr;
              
              // Create inventory_movement
              const { error: movementErr } = await (supabase as any)
                .from('inventory_movements')
                .insert({
                  inventory_item_id: inventoryItemId,
                  delta,
                  reason: 'correction',
                  note: 'Edited in product form',
                  created_by: user?.id || null, // Use authenticated user ID
                });
              
              if (movementErr) throw movementErr;
            }
          }
        } catch (stockErr: any) {
          console.error('Error saving stock:', stockErr);
          // Don't fail the save, but log it
        }
      }

      // Auto-create inventory items at Main warehouse for all variants
      try {
        // Fetch all active variants for this product
        const { data: allVariants, error: variantsErr } = await (supabase as any)
          .from('product_variants')
          .select('id')
          .eq('product_id', productId!)
          .is('archived_at', null);

        if (variantsErr) throw variantsErr;

        if (allVariants && allVariants.length > 0) {
          // Get default warehouse (prefer "Main" or first)
          const { data: warehouses, error: whErr } = await (supabase as any)
            .from('warehouses')
            .select('id, name')
            .eq('org_id', currentOrg.id)
            .order('created_at', { ascending: true });

          if (whErr) throw whErr;

          if (warehouses && warehouses.length > 0) {
            const mainWarehouse = warehouses.find((w: any) => 
              w.name.toLowerCase().includes('main')
            ) || warehouses[0];

            // For each variant, ensure inventory_item exists
            for (const variant of allVariants) {
              // Check if inventory item already exists
              const { data: existingItem } = await (supabase as any)
                .from('inventory_items')
                .select('id')
                .eq('org_id', currentOrg.id)
                .eq('warehouse_id', mainWarehouse.id)
                .eq('variant_id', variant.id)
                .maybeSingle();

              // If doesn't exist, create with quantity 0
              if (!existingItem) {
                const { error: invErr } = await (supabase as any)
                  .from('inventory_items')
                  .insert({
                    org_id: currentOrg.id,
                    warehouse_id: mainWarehouse.id,
                    variant_id: variant.id,
                    quantity: 0,
                  });

                // Don't fail product save if inventory creation fails
                if (invErr) {
                  console.error('Failed to auto-create inventory item:', invErr);
                }
              }
            }
          }
        }
      } catch (invError: any) {
        // Log but don't fail the product save
        console.error('Error auto-creating inventory items:', invError);
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
    <div className="max-w-3xl space-y-6 md:space-y-8">
      <Button variant="ghost" onClick={() => navigate('/app/products')} className="w-full sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>

            <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <CardHeader className="p-4 md:p-6">
          <CardTitle>{isEditMode ? 'Edit Product' : 'Create Product'}</CardTitle>
          <CardDescription>Products are scoped to your organization.</CardDescription>
              </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <form onSubmit={onSave} className="space-y-6 md:space-y-8">
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
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tote Bag" className="h-10" />
                </div>

                <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="min-h-24" />
                </div>

                <div className="space-y-2">
              <Label htmlFor="basePrice">Base Price (decimal)</Label>
              <Input id="basePrice" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="e.g. 199.00" className="h-10" />
                      </div>

                <div className="space-y-2">
              <Label htmlFor="category">Category (optional)</Label>
              <div className="flex gap-2">
                <Select value={categoryId || '__none__'} onValueChange={(val) => setCategoryId(val === '__none__' ? '' : val)}>
                  <SelectTrigger id="category" className="h-10">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No category</SelectItem>
                    {categories.length === 0 ? (
                      <SelectItem value="__empty__" disabled>
                        No categories yet
                      </SelectItem>
                    ) : (
                      categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateCategoryOpen(true);
                    setNewCategoryName('');
                  }}
                  className="h-10 whitespace-nowrap"
                  disabled={saving}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedTagIds.map((tagId) => {
                  const tag = availableTags.find(t => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <Badge key={tagId} variant="secondary" className="gap-1">
                      {tag.name}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(tagId)} />
                    </Badge>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="h-10"
                  list="tag-suggestions"
                />
                <datalist id="tag-suggestions">
                  {availableTags
                    .filter(t => !selectedTagIds.includes(t.id))
                    .map((tag) => (
                      <option key={tag.id} value={tag.name} />
                    ))}
                </datalist>
                <Button type="button" variant="outline" onClick={addTag} className="h-10">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {availableTags.length > 0 && (
                <p className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                  Suggestions: {availableTags.filter(t => !selectedTagIds.includes(t.id)).slice(0, 5).map(t => t.name).join(', ')}
                  {availableTags.filter(t => !selectedTagIds.includes(t.id)).length > 5 ? '...' : ''}
                </p>
              )}
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
                      disabled={!hasPendingOptionChanges || !isOptionsValid(variantOptionsDraft).ok}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate Variants
                    </Button>
                  )}
                </div>

                {/* Warehouse Selector */}
                {isEditMode && warehouses.length > 0 && variants.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <WarehouseIcon className="h-4 w-4" />
                      Warehouse (for stock)
                    </Label>
                    <Select value={selectedWarehouseId} onValueChange={(val) => {
                      if (val === '__new__') {
                        setCreateWarehouseOpen(true);
                      } else {
                        setSelectedWarehouseId(val);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((wh) => (
                          <SelectItem key={wh.id} value={wh.id}>
                            {wh.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="__new__">+ Add new warehouse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Variant Combinations Table/Cards */}
                {variants.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <Label>Variant Combinations</Label>
                      <p className="text-sm text-muted-foreground">
                        Edit SKU, price, stock{isEditMode && ` @ ${warehouses.find(w => w.id === selectedWarehouseId)?.name || 'warehouse'}`}, and status. SKU auto-generates if left blank.
                      </p>
                    </div>

                    {/* Desktop Table (md and up) */}
                    <div className="hidden md:block border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-3 text-sm font-medium">Variant</th>
                            <th className="text-left p-3 text-sm font-medium">SKU</th>
                            <th className="text-left p-3 text-sm font-medium">Price</th>
                            {isEditMode && <th className="text-left p-3 text-sm font-medium">Stock</th>}
                            <th className="text-left p-3 text-sm font-medium">Active</th>
                          </tr>
                        </thead>
                        <tbody>
                      {variants.map((v, idx) => (
                            <tr key={v.id ?? idx} className="border-t">
                              <td className="p-3">
                            <p className="text-sm font-medium">{v.name}</p>
                              </td>
                              <td className="p-3">
                                <Input
                                  placeholder="Auto"
                                  value={v.sku}
                                  onChange={(e) => updateVariantField(idx, 'sku', e.target.value)}
                                  className="h-8"
                                />
                              </td>
                              <td className="p-3">
                                <Input
                                  placeholder="0.00"
                                  value={v.price}
                                  onChange={(e) => updateVariantField(idx, 'price', e.target.value)}
                                  className="h-8"
                                />
                              </td>
                              {isEditMode && (
                                <td className="p-3">
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    value={v.stock}
                                    onChange={(e) => updateVariantField(idx, 'stock', e.target.value)}
                                    className="h-8"
                                    min="0"
                                  />
                                </td>
                              )}
                              <td className="p-3">
                                <Switch
                                  checked={v.active}
                                  onCheckedChange={(checked) => updateVariantField(idx, 'active', checked)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                          </div>

                    {/* Mobile Cards (sm and below) */}
                    <div className="md:hidden space-y-3">
                      {variants.map((v, idx) => (
                        <Card key={v.id ?? idx}>
                          <CardContent className="p-4 space-y-3">
                            <div className="font-medium text-sm">{v.name}</div>
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">SKU</Label>
                            <Input
                                  placeholder="Auto-generate"
                              value={v.sku}
                                  onChange={(e) => updateVariantField(idx, 'sku', e.target.value)}
                                  className="h-8 mt-1"
                            />
                          </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Price</Label>
                            <Input
                                  placeholder="0.00"
                              value={v.price}
                                  onChange={(e) => updateVariantField(idx, 'price', e.target.value)}
                                  className="h-8 mt-1"
                            />
                          </div>
                              {isEditMode && (
                                <div>
                                  <Label className="text-xs text-muted-foreground">
                                    Stock @ {warehouses.find(w => w.id === selectedWarehouseId)?.name || 'warehouse'}
                                  </Label>
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    value={v.stock}
                                    onChange={(e) => updateVariantField(idx, 'stock', e.target.value)}
                                    className="h-8 mt-1"
                                    min="0"
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                              <Switch
                                checked={v.active}
                                  onCheckedChange={(checked) => updateVariantField(idx, 'active', checked)}
                              />
                                <Label className="text-xs">Active</Label>
                            </div>
                          </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/app/products')} disabled={saving} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEditMode ? 'Save Changes' : 'Create Product'}
              </Button>
          </div>
        </form>
        </CardContent>
      </Card>

      {/* Create Category Modal */}
      <Dialog open={createCategoryOpen} onOpenChange={(open) => !saving && setCreateCategoryOpen(open)}>
        <DialogContent className="p-4 md:p-6">
          <DialogHeader className="space-y-4">
            <DialogTitle>Create Category</DialogTitle>
            <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
              This category will be saved to your organization and available for all products.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="catName">Category Name *</Label>
              <Input
                id="catName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !saving) {
                    e.preventDefault();
                    createCategory();
                  }
                }}
                placeholder="e.g. Apparel, Electronics"
                autoFocus
                className="h-10"
                disabled={saving}
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateCategoryOpen(false);
                  setNewCategoryName('');
                }}
                className="w-full sm:w-auto"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={createCategory}
                disabled={saving || !newCategoryName.trim()}
                className="w-full sm:w-auto"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Warehouse Modal */}
      <Dialog open={createWarehouseOpen} onOpenChange={setCreateWarehouseOpen}>
        <DialogContent className="p-4 md:p-6">
          <DialogHeader className="space-y-4">
            <DialogTitle>Create New Warehouse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="whName">Warehouse Name *</Label>
              <Input
                id="whName"
                value={newWarehouseName}
                onChange={(e) => setNewWarehouseName(e.target.value)}
                placeholder="e.g. East Coast Warehouse"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whAddress">Address (optional)</Label>
              <Input
                id="whAddress"
                value={newWarehouseAddress}
                onChange={(e) => setNewWarehouseAddress(e.target.value)}
                placeholder="e.g. 123 Main St, City"
                className="h-10"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateWarehouseOpen(false)} disabled={saving} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button type="button" onClick={createWarehouse} disabled={saving || !newWarehouseName.trim()} className="w-full sm:w-auto">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

