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
import { ArrowLeft, Loader2, Plus, Save, Trash2, X, AlertCircle, RefreshCw, Warehouse as WarehouseIcon, Package, Boxes, Copy, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  getCategories, 
  createCategory as apiCreateCategory, 
  type ProductCategory,
} from '@/lib/api/categories-and-tags';
import { compressReceiptImage } from '@/lib/images/compressReceiptImage';
import { PRODUCT_TYPE_LABELS, type ProductType } from '@/lib/types';
import {
  MAX_PRODUCT_GALLERY_EXTRA,
  mergeProductDetailMetadata,
} from '@/lib/utils/product-media';
import {
  deleteProduct,
  getProductAccessVariants,
  replaceProductAccessVariants,
  type ProductAccessVariantInput,
  type ProductAccessVariantVisibility,
} from '@/lib/api/products';
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
import { ProductCollabSection } from '@/components/catalog/ProductCollabSection';
import {
  validateProductPartners,
  syncProductPartners,
  type ProductPartnerDraft,
} from '@/lib/api/product-partners';

/** Catalog uploads: not the 50KB receipt target — product pages need clearer images. */
const PRODUCT_PHOTO_TARGET_BYTES = 500 * 1024;
const PRODUCT_PHOTO_MAX_DIMENSION = 2048;
const PRODUCT_PHOTO_HARD_CAP_BYTES = 1024 * 1024;

type OrgProductType = ProductType;

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

type ProductAccessVariantForm = {
  visibility_mode: ProductAccessVariantVisibility;
  access_code: string | null;
  allowed_affiliates: string | null;
  price_override: string | null;
  discount_percent: string | null;
  quota: string | null;
  is_active: boolean;
};

function defaultProductAccessVariants(): ProductAccessVariantForm[] {
  return [
    {
      visibility_mode: 'public',
      access_code: null,
      allowed_affiliates: null,
      price_override: null,
      discount_percent: null,
      quota: null,
      is_active: true,
    },
  ];
}

function generateProductAccessCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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

type ProductKind = 'simple' | 'variable';

export interface ProductFormEmbeddedProps {
  embedded?: boolean;
  productType?: 'physical' | 'addon';
  onSuccess?: (productId: string) => void;
  onCancel?: () => void;
}

function ProductFormTopBar({
  backLabel,
  onBack,
  publicUrl,
}: {
  backLabel: string;
  onBack: () => void;
  publicUrl: string | null;
}) {
  const { toast } = useToast();

  return (
    <div className="mb-2 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-xs md:text-sm truncate"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backLabel}
          </Button>
        </div>

        {publicUrl && (
          <div className="flex items-center gap-2 flex-nowrap">
            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicUrl);
                  toast({ title: 'Copied!', description: 'Link copied to clipboard' });
                } catch {
                  toast({ title: 'Error', description: 'Failed to copy link', variant: 'destructive' });
                }
              }}
              aria-label="Copy link"
            >
              <Copy className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => window.open(publicUrl, '_blank')}
              aria-label="Open link"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProductForm(props?: ProductFormEmbeddedProps) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentOrg, user, orgMemberships } = useAuth();
  const { toast } = useToast();

  const embedded = props?.embedded ?? false;
  const isEditMode = embedded ? false : !!id;
  const initialKind = (searchParams.get('kind') as ProductKind | null) ?? null;

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [productHostOrgId, setProductHostOrgId] = useState<string | null>(null);

  // Product type: when embedded, use props; otherwise user selects (physical / addon)
  const [productType, setProductType] = useState<OrgProductType>(
    props?.productType ?? (searchParams.get('type') === 'addon' ? 'addon' : 'physical')
  );
  const [productKind, setProductKind] = useState<ProductKind | null>(initialKind);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [cost, setCost] = useState('');
  const [isOnSale, setIsOnSale] = useState(true);
  const [collabEnabled, setCollabEnabled] = useState(false);
  const [productPartners, setProductPartners] = useState<ProductPartnerDraft[]>([]);
  const [simpleStock, setSimpleStock] = useState('0'); // Stock for simple products
  const [productAccessVariants, setProductAccessVariants] = useState<ProductAccessVariantForm[]>(
    defaultProductAccessVariants,
  );

  // Category (using database tables)
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
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

  // Product Photo state
  const [photoMode, setPhotoMode] = useState<'url' | 'upload'>('upload');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingGalleryImage, setUploadingGalleryImage] = useState(false);
  const [metadataBase, setMetadataBase] = useState<Record<string, unknown>>({});
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [galleryUrlInput, setGalleryUrlInput] = useState('');
  const [metadataProductDetails, setMetadataProductDetails] = useState('');
  const [metadataSizeFit, setMetadataSizeFit] = useState('');
  const [metadataShippingWeightKg, setMetadataShippingWeightKg] = useState('');
  const [draftId] = useState<string>(() => {
    // Generate draftId on first render for create mode
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  });

  // Computed: check if there are pending option changes
  const hasPendingOptionChanges = useMemo(() => {
    if (variantOptionsDraft.length === 0 && variantOptionsApplied.length === 0) return false;
    return !optionsEqual(variantOptionsDraft, variantOptionsApplied);
  }, [variantOptionsDraft, variantOptionsApplied]);

  const canSubmit = useMemo(() => {
    if (!currentOrg?.id) return false;
    if (!title.trim()) return false;
    if (uploadingImage || uploadingGalleryImage) return false;
    return true;
  }, [currentOrg?.id, title, uploadingImage, uploadingGalleryImage]);

  const productPublicUrl = useMemo(() => {
    if (isEditMode && id && currentOrg?.slug && !embedded) {
      return `https://growbrohk.com/${currentOrg.slug}/products/${id}`;
    }
    return null;
  }, [isEditMode, id, currentOrg?.slug, embedded]);

  const canDeleteProduct = useMemo(() => {
    if (!isEditMode || !id || embedded || !currentOrg?.id || !productHostOrgId) return false;
    if (productHostOrgId !== currentOrg.id) return false;
    const role = orgMemberships.find((m) => m.org_id === currentOrg.id)?.role;
    return role === 'owner' || role === 'admin';
  }, [isEditMode, id, embedded, currentOrg?.id, productHostOrgId, orgMemberships]);

  // Helper function to upload product image
  const uploadProductImage = async (file: File): Promise<string> => {
    if (!currentOrg?.id) {
      throw new Error('Organization not found');
    }

    // Validate file size <= 3MB before compression
    const maxSize = 3 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      throw new Error('File size must be less than 3MB');
    }

    const compressedFile = await compressReceiptImage(file, {
      targetSizeBytes: PRODUCT_PHOTO_TARGET_BYTES,
      maxDimension: PRODUCT_PHOTO_MAX_DIMENSION,
    });

    if (compressedFile.size > PRODUCT_PHOTO_HARD_CAP_BYTES) {
      throw new Error(
        'Image is still too large after compression. Try a smaller or lower-resolution photo.',
      );
    }

    // Determine upload path: org/{orgId}/products/{productId or draftId}/{timestamp}.webp
    const productIdForPath = id || draftId;
    const timestamp = Date.now();
    const uploadPath = `${currentOrg.id}/products/${productIdForPath}/${timestamp}.webp`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(uploadPath, compressedFile, {
        upsert: false,
        contentType: 'image/webp',
      });

    if (uploadError) {
      console.error('Error uploading product image:', uploadError);
      throw new Error(uploadError.message || 'Failed to upload image');
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(uploadPath);

    return urlData.publicUrl;
  };

  // Helper function to get default warehouse ID
  const getDefaultWarehouseId = (warehousesList: Warehouse[], selectedWarehouseIdParam?: string): string | null => {
    if (warehousesList.length === 0) return null;
    // Prefer selectedWarehouseId if present
    if (selectedWarehouseIdParam) {
      const found = warehousesList.find(w => w.id === selectedWarehouseIdParam);
      if (found) return found.id;
    }
    // Else prefer warehouse with name includes 'main' (case-insensitive)
    const mainWh = warehousesList.find(w => w.name.toLowerCase().includes('main')) || warehousesList[0];
    return mainWh.id;
  };

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
      
      // Load categories from database tables
      const categoriesData = await getCategories(currentOrg.id);
      setCategories(categoriesData);
      
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
          .select('id, org_id, type, title, description, base_price, cost, metadata, image_url, is_on_sale')
          .eq('id', id)
          .eq('org_id', currentOrg.id)
          .single();

        if (productError) throw productError;
        const p = product as any as (OrgProduct & { metadata?: any; image_url?: string | null });

        setProductHostOrgId(p.org_id);
        setTitle(p.title);
        setDescription(p.description || '');
        setBasePrice(p.base_price === null ? '' : String(p.base_price));
        setCost((p as { cost?: number | null }).cost == null ? '' : String((p as { cost?: number | null }).cost));
        setIsOnSale((p as { is_on_sale?: boolean }).is_on_sale !== false);
        
        // Load product type (physical | addon)
        if (!embedded) {
          setProductType((p.type === 'addon' ? 'addon' : 'physical') as OrgProductType);
        }
        
        // Load category_id
        setCategoryId(p.category_id || '');

        // Load image_url
        if (p.image_url) {
          setImageUrl(p.image_url);
          setPhotoMode('url'); // If image exists, show as URL mode
        } else {
          setImageUrl('');
          setPhotoMode('upload');
        }

        const rawMeta =
          p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)
            ? { ...(p.metadata as Record<string, unknown>) }
            : {};
        setMetadataBase(rawMeta);
        const extraGallery = Array.isArray(rawMeta.gallery_urls)
          ? (rawMeta.gallery_urls as unknown[])
              .filter((u): u is string => typeof u === 'string')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        setGalleryUrls(extraGallery.slice(0, MAX_PRODUCT_GALLERY_EXTRA));
        setMetadataProductDetails(
          typeof rawMeta.product_details === 'string' ? rawMeta.product_details : '',
        );
        setMetadataSizeFit(typeof rawMeta.size_and_fit === 'string' ? rawMeta.size_and_fit : '');
        const sw = rawMeta.shipping_weight_kg;
        setMetadataShippingWeightKg(
          typeof sw === 'number' && Number.isFinite(sw)
            ? String(sw)
            : typeof sw === 'string'
              ? sw
              : '',
        );

        const { data: variantsData, error: variantsError } = await (supabase as any)
          .from('product_variants')
          .select('id, name, sku, price, active, archived_at, created_at')
          .eq('product_id', p.id)
          .is('archived_at', null) // Only load non-archived variants
          .order('created_at', { ascending: true });

        if (variantsError) throw variantsError;
        const v = (variantsData as any[] | null) || [];
        
        // Determine product kind based on variant count
        if (v.length > 1) {
          setProductKind('variable');
        } else {
          setProductKind('simple');
        }
        
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

        if (p.type === 'physical') {
          try {
            const pavList = await getProductAccessVariants(p.id);
            if (pavList.length > 0) {
              setProductAccessVariants(
                pavList.map((row) => ({
                  visibility_mode: row.visibility_mode,
                  access_code: row.access_code,
                  allowed_affiliates: row.allowed_affiliates?.join(', ') ?? null,
                  price_override: row.price_override != null ? String(row.price_override) : null,
                  discount_percent: row.discount_percent != null ? String(row.discount_percent) : null,
                  quota: row.quota != null ? String(row.quota) : null,
                  is_active: row.is_active !== false,
                })),
              );
            } else {
              setProductAccessVariants(defaultProductAccessVariants());
            }
          } catch (pavErr) {
            console.warn('Failed to load product access variants', pavErr);
            setProductAccessVariants(defaultProductAccessVariants());
          }
        } else {
          setProductAccessVariants(defaultProductAccessVariants());
        }

        // Load stock for simple products
        if (productKind === 'simple' && variantsList.length > 0) {
          const defaultVariantId = variantsList[0]?.id;
          if (defaultVariantId) {
            // Fetch warehouses first if not already loaded
            if (warehouses.length === 0) {
              const { data: whData, error: whErr } = await (supabase as any)
                .from('warehouses')
                .select('id, org_id, name, address')
                .eq('org_id', currentOrg.id)
                .order('created_at', { ascending: true });
              
              if (!whErr && whData) {
                const whs = (whData as any[] || []) as Warehouse[];
                setWarehouses(whs);
                
                if (whs.length > 0) {
                  const mainWh = whs.find(w => w.name.toLowerCase().includes('main')) || whs[0];
                  setSelectedWarehouseId(mainWh.id);
                  
                  // Load stock for default variant at default warehouse
                  const { data: invData, error: invErr } = await (supabase as any)
                    .from('inventory_items')
                    .select('quantity')
                    .eq('org_id', currentOrg.id)
                    .eq('warehouse_id', mainWh.id)
                    .eq('variant_id', defaultVariantId)
                    .maybeSingle();
                  
                  if (!invErr && invData) {
                    setSimpleStock(String(invData.quantity || 0));
                  } else {
                    setSimpleStock('0');
                  }
                }
              }
            } else {
              // Warehouses already loaded, use selected warehouse
              const defaultWarehouseId = getDefaultWarehouseId(warehouses, selectedWarehouseId);
              if (defaultWarehouseId) {
                const { data: invData, error: invErr } = await (supabase as any)
                  .from('inventory_items')
                  .select('quantity')
                  .eq('org_id', currentOrg.id)
                  .eq('warehouse_id', defaultWarehouseId)
                  .eq('variant_id', defaultVariantId)
                  .maybeSingle();
                
                if (!invErr && invData) {
                  setSimpleStock(String(invData.quantity || 0));
                } else {
                  setSimpleStock('0');
                }
              }
            }
          }
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
        
        // Load categories from database tables
        const categoriesData = await getCategories(currentOrg.id);
        setCategories(categoriesData);
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
    
    // For simple products, reload simpleStock
    if (productKind === 'simple' && variants.length > 0) {
      const defaultVariantId = variants[0]?.id;
      if (defaultVariantId) {
        const loadSimpleStock = async () => {
          try {
            const { data: invData, error: invErr } = await (supabase as any)
              .from('inventory_items')
              .select('quantity')
              .eq('org_id', currentOrg?.id)
              .eq('warehouse_id', selectedWarehouseId)
              .eq('variant_id', defaultVariantId)
              .maybeSingle();
            
            if (!invErr && invData) {
              setSimpleStock(String(invData.quantity || 0));
            } else {
              setSimpleStock('0');
            }
          } catch (e: any) {
            console.error('Failed to load simple stock:', e);
          }
        };
        loadSimpleStock();
      }
    } else if (variants.length > 0) {
      // For variable products, use existing logic
      loadStockForWarehouse(selectedWarehouseId, variants);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouseId, productKind]);

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

  // Helper function to apply simple product stock
  const applySimpleStock = async (warehouseId: string, variantId: string, quantity: number) => {
    if (!currentOrg || !variantId) return;
    
    try {
      // Parse quantity (allow blank -> 0)
      const parsedQty = quantity || 0;
      if (!Number.isFinite(parsedQty) || parsedQty < 0) return;
      
      // Check if inventory_item exists
      const { data: invItem, error: fetchErr } = await (supabase as any)
        .from('inventory_items')
        .select('id, quantity')
        .eq('org_id', currentOrg.id)
        .eq('warehouse_id', warehouseId)
        .eq('variant_id', variantId)
        .maybeSingle();
      
      if (fetchErr) throw fetchErr;
      
      let inventoryItemId: string;
      let oldQty = 0;
      
      if (invItem) {
        inventoryItemId = invItem.id;
        oldQty = invItem.quantity;
      } else {
        // Create inventory_item with quantity
        const { data: newInvItem, error: createErr } = await (supabase as any)
          .from('inventory_items')
          .insert({
            org_id: currentOrg.id,
            warehouse_id: warehouseId,
            variant_id: variantId,
            quantity: parsedQty,
          })
          .select('id')
          .single();
        
        if (createErr) throw createErr;
        inventoryItemId = newInvItem.id;
        oldQty = 0;
      }
      
      // Calculate delta
      const delta = parsedQty - oldQty;
      
      // Update inventory_items quantity
      const { error: updateErr } = await (supabase as any)
        .from('inventory_items')
        .update({ quantity: parsedQty, updated_at: new Date().toISOString() })
        .eq('id', inventoryItemId);
      
      if (updateErr) throw updateErr;
      
      // Create inventory_movement if delta != 0
      if (delta !== 0) {
        const { error: movementErr } = await (supabase as any)
          .from('inventory_movements')
          .insert({
            inventory_item_id: inventoryItemId,
            delta,
            reason: isEditMode ? 'correction' : 'initial',
            note: isEditMode ? 'Stock updated in product form' : 'Initial stock set in product creation',
            created_by: user?.id || null,
          });
        
        if (movementErr) throw movementErr;
      }
    } catch (err: any) {
      console.error('Error applying simple stock:', err);
      throw err;
    }
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

  const handleUpdateProductAccessVariant = (
    idx: number,
    field: keyof ProductAccessVariantForm,
    value: unknown,
    extra?: Partial<ProductAccessVariantForm>,
  ) => {
    setProductAccessVariants((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, [field]: value, ...extra };
      return next;
    });
  };

  const handleAddProductAccessVariant = () => {
    setProductAccessVariants((prev) => [
      ...prev,
      {
        visibility_mode: 'code',
        access_code: '',
        allowed_affiliates: null,
        price_override: null,
        discount_percent: null,
        quota: null,
        is_active: true,
      },
    ]);
  };

  const handleRemoveProductAccessVariant = (idx: number) => {
    setProductAccessVariants((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
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
      const product_cost = toDecimalOrNull(cost);

      if (!embedded && collabEnabled) {
        const partnerErr = validateProductPartners(collabEnabled, productPartners);
        if (partnerErr) {
          toast({ title: 'Validation', description: partnerErr, variant: 'destructive' });
          setSaving(false);
          return;
        }
      }

      const productMetadata = mergeProductDetailMetadata(metadataBase, {
        galleryUrls,
        productDetails: metadataProductDetails,
        sizeAndFit: metadataSizeFit,
      });
      delete productMetadata.shipping_weight_kg;
      const effectiveType = embedded ? (props?.productType ?? 'physical') : productType;
      if (effectiveType === 'physical') {
        const swTrim = metadataShippingWeightKg.trim();
        if (swTrim !== '') {
          const n = Number(swTrim);
          if (!Number.isFinite(n) || n < 0) {
            toast({
              title: 'Validation',
              description: 'Shipping weight must be a non-negative number',
              variant: 'destructive',
            });
            setSaving(false);
            return;
          }
          productMetadata.shipping_weight_kg = n;
        }
      }

      let productId = id;
      if (!isEditMode) {
        const { data: created, error: createError } = await (supabase as any)
          .from('products')
          .insert({
            org_id: currentOrg.id,
            type: embedded ? (props?.productType ?? 'physical') : productType,
            title: title.trim(),
            description: description.trim() || null,
            base_price,
            cost: product_cost,
            category_id: categoryId || null,
            image_url: imageUrl || null,
            is_on_sale: isOnSale,
            metadata: productMetadata,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        productId = (created as any).id as string;
      } else {
        const { error: updateError } = await (supabase as any)
          .from('products')
          .update({
            type: embedded ? (props?.productType ?? 'physical') : productType,
            title: title.trim(),
            description: description.trim() || null,
            base_price,
            cost: product_cost,
            category_id: categoryId || null,
            image_url: imageUrl || null,
            is_on_sale: isOnSale,
            metadata: productMetadata,
          })
          .eq('id', id!)
          .eq('org_id', currentOrg.id);

        if (updateError) throw updateError;
      }

      // For simple products, ensure we have at least one variant
      let defaultVariantId: string | null = null;
      if (productKind === 'simple' && variants.length === 0) {
        // Create a default variant for simple products
        const { data: defaultVariant, error: variantErr } = await (supabase as any)
          .from('product_variants')
          .insert({
            product_id: productId,
            name: 'Default',
            sku: '',
            price: base_price,
            active: true,
          })
          .select('id')
          .single();
        
        if (variantErr) throw variantErr;
        defaultVariantId = defaultVariant.id;
        
        // Update variants state for stock saving
        setVariants([{
          id: defaultVariant.id,
          name: 'Default',
          sku: '',
          price: basePrice || '',
          active: true,
          stock: '0',
          isNew: false,
          sig: '',
        }]);
      }

      // Variant save logic with archival
      const variantsToProcess = variants.length > 0 ? variants : (defaultVariantId ? [{
        id: defaultVariantId,
        name: 'Default',
        sku: '',
        price: basePrice || '',
        active: true,
        stock: '0',
        isNew: false,
        sig: '',
      }] : []);
      
      // Declare insertedVariantsWithIds outside the if block so it's accessible for stock saving
      let insertedVariantsWithIds: Array<{ id: string; stock?: string }> = [];
      
      if (variantsToProcess.length > 0) {
        // Collect existing SKUs for auto-generation
        const existingSkus = variantsToProcess
          .map(v => v.sku?.trim())
          .filter(Boolean) as string[];
        
        // Create a map of variants by name for stock lookup later
        const variantsStockMap = new Map<string, string>();
        variantsToProcess.forEach(v => {
          variantsStockMap.set(v.name.trim(), v.stock || '0');
        });
        
        // Prepare current variants with SKU auto-generation
        const currentVariants = variantsToProcess
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
          
          // Map inserted variants with their new IDs and stock values from state
          // toInsert and insertedData are in the same order, so we can map by index
          // Use the stock map we created earlier to get stock values
          const insertedDataArray = insertedData || [];
          insertedVariantsWithIds = toInsert.map((v, idx) => {
            return {
              id: insertedDataArray[idx]?.id,
              stock: variantsStockMap.get(v.name.trim()) || '0',
            };
          }).filter(v => v.id); // Filter out any that didn't get IDs
          
          // Update variants state with new IDs for UI
          const insertedIds = insertedDataArray.map((d: any) => d.id);
          let idIdx = 0;
          setVariants(prev => prev.map(v => {
            if (!v.id && idIdx < insertedIds.length) {
              return { ...v, id: insertedIds[idIdx++] };
            }
            return v;
          }));
        }
      }

      // Save stock for simple products (both create and edit mode)
      if (productKind === 'simple') {
        // Get the default variant ID (either from variants array or the one we just created)
        const defaultVariantIdToUse = defaultVariantId || (variantsToProcess.length > 0 ? variantsToProcess[0]?.id : null);
        
        if (defaultVariantIdToUse) {
          try {
            // For edit mode, use selected warehouse; for create mode, use default warehouse
            const warehouseIdToUse = getDefaultWarehouseId(warehouses, selectedWarehouseId);
            
            if (!warehouseIdToUse) {
              // If no warehouses exist, skip stock saving
              console.warn('No warehouses available for stock saving');
            } else {
              // Parse simpleStock (allow blank -> 0)
              const parsedStock = simpleStock.trim() === '' ? 0 : Number(simpleStock);
              if (Number.isFinite(parsedStock) && parsedStock >= 0) {
                await applySimpleStock(warehouseIdToUse, defaultVariantIdToUse, parsedStock);
              }
            }
          } catch (stockErr: any) {
            console.error('Error saving simple product stock:', stockErr);
            // Don't fail the save, but log it
          }
        }
      }

      // Save stock changes for variable products (both create and edit mode)
      if (productKind === 'variable' && variantsToProcess.length > 0) {
        try {
          // Determine warehouse ID: prefer selectedWarehouseId, else default warehouse
          const warehouseIdToUse = getDefaultWarehouseId(warehouses, selectedWarehouseId);
          
          if (!warehouseIdToUse) {
            // If no warehouses exist, skip stock saving
            console.warn('No warehouses available for stock saving');
          } else {
            // Collect all variants that have IDs (both existing and newly inserted)
            const variantsToStockSave: Array<{ id: string; stock: string }> = [];
            
            // Add existing variants (those that already had IDs)
            for (const variant of variantsToProcess) {
              if (variant.id) {
                variantsToStockSave.push({
                  id: variant.id,
                  stock: variant.stock || '0',
                });
              }
            }
            
            // Add newly inserted variants (those we just inserted)
            for (const insertedVariant of insertedVariantsWithIds) {
              if (insertedVariant.id) {
                variantsToStockSave.push({
                  id: insertedVariant.id,
                  stock: insertedVariant.stock || '0',
                });
              }
            }
            
            // Save stock for each variant
            for (const variantToSave of variantsToStockSave) {
              const newStock = Number(variantToSave.stock || 0);
              if (!Number.isFinite(newStock) || newStock < 0) continue;
              
              // Check if inventory_item exists
              const { data: invItem, error: fetchErr } = await (supabase as any)
                .from('inventory_items')
                .select('id, quantity')
                .eq('org_id', currentOrg.id)
                .eq('warehouse_id', warehouseIdToUse)
                .eq('variant_id', variantToSave.id)
                .maybeSingle();
              
              if (fetchErr) throw fetchErr;
              
              let inventoryItemId: string;
              let oldQty = 0;
              
              if (invItem) {
                inventoryItemId = invItem.id;
                oldQty = invItem.quantity;
              } else {
                // Create inventory_item with the user-entered quantity (not 0)
                const { data: newInvItem, error: createErr } = await (supabase as any)
                  .from('inventory_items')
                  .insert({
                    org_id: currentOrg.id,
                    warehouse_id: warehouseIdToUse,
                    variant_id: variantToSave.id,
                    quantity: newStock, // Use user-entered stock, not 0
                  })
                  .select('id')
                  .single();
                
                if (createErr) throw createErr;
                inventoryItemId = newInvItem.id;
                oldQty = 0; // New item, so old quantity was 0
              }
              
              // Calculate delta and update if changed
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
                    reason: isEditMode ? 'correction' : 'initial',
                    note: isEditMode ? 'Edited in product form' : 'Initial stock set in product creation',
                    created_by: user?.id || null,
                  });
                
                if (movementErr) throw movementErr;
              }
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

      if (effectiveType === 'physical') {
        for (const v of productAccessVariants) {
          if (v.visibility_mode === 'code' && (!v.access_code || !String(v.access_code).trim())) {
            toast({
              title: 'Validation',
              description: 'Each code access rule needs an access code.',
              variant: 'destructive',
            });
            setSaving(false);
            return;
          }
          if (v.quota?.trim()) {
            const q = parseInt(v.quota, 10);
            if (!Number.isFinite(q) || q < 1) {
              toast({
                title: 'Validation',
                description: 'Promo quota must be a positive integer or empty.',
                variant: 'destructive',
              });
              setSaving(false);
              return;
            }
          }
        }

        const pavInputs: ProductAccessVariantInput[] = productAccessVariants.map((v) => {
          const canPrice =
            v.visibility_mode === 'code' || v.visibility_mode === 'affiliate';
          const po =
            canPrice && v.price_override?.trim() ? toDecimalOrNull(v.price_override) : null;
          const dp =
            canPrice && v.discount_percent?.trim()
              ? (() => {
                  const n = parseFloat(v.discount_percent);
                  return Number.isFinite(n) ? n : null;
                })()
              : null;
          return {
            visibility_mode: v.visibility_mode,
            access_code: v.visibility_mode === 'code' ? (v.access_code?.trim() || null) : null,
            allowed_affiliates:
              v.visibility_mode === 'affiliate' && v.allowed_affiliates
                ? v.allowed_affiliates
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : null,
            price_override: po,
            discount_percent: dp,
            quota: v.quota?.trim() ? parseInt(v.quota, 10) : null,
            is_active: v.is_active,
          };
        });

        await replaceProductAccessVariants(productId!, pavInputs);
      }

      if (!embedded && productId) {
        await syncProductPartners({
          productId,
          productTitle: title.trim(),
          hostOrgId: currentOrg.id,
          hostOrgSlug: currentOrg.slug ?? null,
          enabled: collabEnabled,
          partners: productPartners,
        });
      }

      toast({ title: 'Success', description: isEditMode ? 'Product updated' : 'Product created' });
      if (props?.onSuccess && productId) {
        props.onSuccess(productId);
      } else {
        navigate('/app/products');
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to save product', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteProduct || !id) return;

    if (!user?.email) {
      toast({
        title: 'Error',
        description: 'Password confirmation requires an email login.',
        variant: 'destructive',
      });
      return;
    }

    const password = deletePassword.trim();
    if (!password) {
      toast({
        title: 'Error',
        description: 'Enter your password to confirm deletion.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setDeleting(true);

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (authError) {
        toast({
          title: 'Error',
          description: 'Invalid password. Product was not deleted.',
          variant: 'destructive',
        });
        return;
      }

      await deleteProduct(id);
      toast({ title: 'Success', description: 'Product deleted' });
      navigate('/app/products');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to delete product';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setDeleting(false);
      setDeletePassword('');
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Step 1: Product kind selection (only for new products)
  if (!isEditMode && !productKind) {
    return (
      <div className="max-w-3xl space-y-6 md:space-y-8">
        <ProductFormTopBar
          backLabel={embedded ? 'Back' : 'Back to Products'}
          onBack={() => (embedded ? props?.onCancel?.() : navigate('/app/products'))}
          publicUrl={null}
        />

        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardHeader className="p-4 md:p-6">
            <CardTitle>Create Product</CardTitle>
            <CardDescription>Choose product type</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setProductKind('simple')}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">Simple Product</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">A single product with one price and stock level.</CardDescription>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setProductKind('variable')}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Boxes className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">Variable Product</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">A product with multiple variants (e.g., Size, Color) and inventory per variant.</CardDescription>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 md:space-y-8">
      <ProductFormTopBar
        backLabel={embedded ? 'Back' : isEditMode ? 'Back to Products' : 'Back'}
        onBack={() => {
          if (embedded) {
            props?.onCancel?.();
          } else if (isEditMode) {
            navigate('/app/products');
          } else {
            setProductKind(null);
          }
        }}
        publicUrl={productPublicUrl}
      />

            <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <CardHeader className="p-4 md:p-6">
          <CardTitle>{isEditMode ? 'Edit Product' : `Create ${productKind === 'simple' ? 'Simple' : 'Variable'} Product`}</CardTitle>
          <CardDescription>Products are scoped to your organization.</CardDescription>
              </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <form onSubmit={onSave} className="space-y-6 md:space-y-8">
                <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tote Bag" className="h-10" />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <Label htmlFor="is-on-sale">On sale</Label>
                    <p className="text-sm text-muted-foreground">When off, product is out of sale and hidden when brand page filter is &quot;In sale only&quot;</p>
                  </div>
                  <Switch id="is-on-sale" checked={isOnSale} onCheckedChange={setIsOnSale} />
                </div>

                {/* Product Type (physical / add-on) - only on standalone form */}
                {!embedded && (
                  <div className="space-y-2">
                    <Label htmlFor="productType">Product Type</Label>
                    <Select value={productType} onValueChange={(v) => setProductType(v as OrgProductType)}>
                      <SelectTrigger id="productType" className="h-10 max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="physical">{PRODUCT_TYPE_LABELS.physical}</SelectItem>
                        <SelectItem value="addon">{PRODUCT_TYPE_LABELS.addon}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      {productType === 'addon'
                        ? 'Add-ons are only available as event add-ons and are hidden from the main catalog.'
                        : 'Physical products appear in your catalog and can be sold standalone.'}
                    </p>
                  </div>
                )}

                {/* Product Photo */}
                <div className="space-y-2">
                  <Label>Product Photo</Label>
                  <Tabs value={photoMode} onValueChange={(v) => setPhotoMode(v as 'url' | 'upload')} className="w-full">
                    <TabsList className="grid w-full max-w-xs grid-cols-2">
                      <TabsTrigger value="url">Image URL</TabsTrigger>
                      <TabsTrigger value="upload">Upload Photo</TabsTrigger>
                    </TabsList>
                    <TabsContent value="url" className="space-y-2 mt-2">
                      <Input
                        id="imageUrl"
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="h-10"
                        disabled={uploadingImage}
                      />
                    </TabsContent>
                    <TabsContent value="upload" className="space-y-2 mt-2">
                      <Input
                        id="imageUpload"
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          setUploadingImage(true);
                          try {
                            const url = await uploadProductImage(file);
                            setImageUrl(url);
                            toast({
                              title: 'Image uploaded',
                              description: 'Product photo uploaded successfully',
                            });
                          } catch (error: any) {
                            console.error('Error uploading image:', error);
                            toast({
                              title: 'Upload failed',
                              description: error.message || 'Failed to upload image',
                              variant: 'destructive',
                            });
                          } finally {
                            setUploadingImage(false);
                            e.target.value = ''; // Reset file input
                          }
                        }}
                        className="h-10"
                        disabled={uploadingImage}
                      />
                      <p className="text-sm text-muted-foreground">
                        Max 3MB before upload. We resize (long edge 2048px) and compress (WebP, ~500KB target).
                      </p>
                    </TabsContent>
                  </Tabs>
                  
                  {/* Preview and Remove */}
                  {imageUrl && (
                    <div className="space-y-2">
                      <div className="relative inline-block">
                        <img
                          src={imageUrl}
                          alt="Product preview"
                          className="h-32 w-32 object-cover rounded-lg border"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setImageUrl('');
                          // Reset file input if exists
                          const fileInput = document.getElementById('imageUpload') as HTMLInputElement;
                          if (fileInput) fileInput.value = '';
                        }}
                        disabled={uploadingImage}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  )}
                  
                  {uploadingImage && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading and compressing image...
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Additional photos (product page)</Label>
                  <p className="text-sm text-muted-foreground">
                    Shown after the primary photo. Up to {MAX_PRODUCT_GALLERY_EXTRA} extra images (same upload rules as primary).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="url"
                      value={galleryUrlInput}
                      onChange={(e) => setGalleryUrlInput(e.target.value)}
                      placeholder="https://…"
                      className="h-10 flex-1"
                      disabled={uploadingGalleryImage || galleryUrls.length >= MAX_PRODUCT_GALLERY_EXTRA}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 whitespace-nowrap"
                      disabled={
                        uploadingGalleryImage || galleryUrls.length >= MAX_PRODUCT_GALLERY_EXTRA
                      }
                      onClick={() => {
                        const t = galleryUrlInput.trim();
                        if (!t) return;
                        if (galleryUrls.length >= MAX_PRODUCT_GALLERY_EXTRA) return;
                        if (t === imageUrl.trim() || galleryUrls.includes(t)) {
                          toast({
                            title: 'Duplicate image',
                            description: 'That URL is already used.',
                            variant: 'destructive',
                          });
                          return;
                        }
                        setGalleryUrls((prev) => [...prev, t].slice(0, MAX_PRODUCT_GALLERY_EXTRA));
                        setGalleryUrlInput('');
                      }}
                    >
                      Add URL
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="galleryUpload"
                      type="file"
                      accept="image/*"
                      className="h-10"
                      disabled={
                        uploadingGalleryImage || galleryUrls.length >= MAX_PRODUCT_GALLERY_EXTRA
                      }
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (galleryUrls.length >= MAX_PRODUCT_GALLERY_EXTRA) return;
                        setUploadingGalleryImage(true);
                        try {
                          const url = await uploadProductImage(file);
                          if (url === imageUrl.trim() || galleryUrls.includes(url)) {
                            toast({
                              title: 'Duplicate image',
                              description: 'That image is already in the gallery.',
                              variant: 'destructive',
                            });
                            return;
                          }
                          setGalleryUrls((prev) =>
                            [...prev, url].slice(0, MAX_PRODUCT_GALLERY_EXTRA),
                          );
                          toast({ title: 'Image added', description: 'Added to additional photos' });
                        } catch (error: any) {
                          console.error('Gallery upload failed:', error);
                          toast({
                            title: 'Upload failed',
                            description: error.message || 'Failed to upload image',
                            variant: 'destructive',
                          });
                        } finally {
                          setUploadingGalleryImage(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                  {uploadingGalleryImage && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading additional photo…
                    </div>
                  )}
                  {galleryUrls.length > 0 && (
                    <ul className="flex flex-wrap gap-2 pt-1">
                      {galleryUrls.map((u, idx) => (
                        <li key={`${u}-${idx}`} className="relative group">
                          <img
                            src={u}
                            alt=""
                            className="h-20 w-20 object-cover rounded-lg border"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -top-2 -right-2 h-7 w-7 rounded-full opacity-90"
                            onClick={() =>
                              setGalleryUrls((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="min-h-24" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metadataProductDetails">Product details (product page)</Label>
                  <Textarea
                    id="metadataProductDetails"
                    value={metadataProductDetails}
                    onChange={(e) => setMetadataProductDetails(e.target.value)}
                    placeholder="Materials, care, SKU highlights, etc."
                    className="min-h-20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metadataSizeFit">Size &amp; fit (product page)</Label>
                  <Textarea
                    id="metadataSizeFit"
                    value={metadataSizeFit}
                    onChange={(e) => setMetadataSizeFit(e.target.value)}
                    placeholder="Fit notes, model size, measurements…"
                    className="min-h-20"
                  />
                </div>

                {(embedded ? props?.productType : productType) === 'physical' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="metadataShippingWeightKg">Shipping weight (kg per unit)</Label>
                      <Input
                        id="metadataShippingWeightKg"
                        type="number"
                        min={0}
                        step="any"
                        value={metadataShippingWeightKg}
                        onChange={(e) => setMetadataShippingWeightKg(e.target.value)}
                        placeholder="e.g. 0.5"
                        className="h-10"
                      />
                      <p className="text-sm text-muted-foreground">
                        Used to calculate delivery fees at checkout (door / SF Locker).
                      </p>
                    </div>

                    <div className="pt-4 border-t space-y-3" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                      <Label className="text-sm font-medium block">Access &amp; promo links</Label>
                      <p className="text-xs text-muted-foreground">
                        Add rules like event tickets: a code link can show a special price or discount %. Save the
                        product first to copy a shareable URL.
                      </p>
                      {productAccessVariants.map((variant, vIdx) => (
                        <div
                          key={vIdx}
                          className="mb-4 p-4 rounded-lg border space-y-3"
                          style={{ borderColor: 'rgba(14,122,58,0.2)', backgroundColor: 'rgba(251,248,244,0.3)' }}
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <Select
                              value={variant.visibility_mode}
                              onValueChange={(value) =>
                                handleUpdateProductAccessVariant(vIdx, 'visibility_mode', value as ProductAccessVariantVisibility)
                              }
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="public">Public</SelectItem>
                                <SelectItem value="code">Code</SelectItem>
                                <SelectItem value="affiliate">Affiliate</SelectItem>
                                <SelectItem value="hidden">Hidden</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <Label htmlFor={`pav-active-${vIdx}`} className="text-xs">
                                  Active
                                </Label>
                                <Switch
                                  id={`pav-active-${vIdx}`}
                                  checked={variant.is_active !== false}
                                  onCheckedChange={(checked) =>
                                    handleUpdateProductAccessVariant(vIdx, 'is_active', checked)
                                  }
                                />
                              </div>
                              {productAccessVariants.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveProductAccessVariant(vIdx)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {variant.visibility_mode === 'code' && (
                            <div className="flex gap-2">
                              <Input
                                type="text"
                                value={variant.access_code || ''}
                                onChange={(e) =>
                                  handleUpdateProductAccessVariant(vIdx, 'access_code', e.target.value || null)
                                }
                                placeholder="Access code"
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleUpdateProductAccessVariant(
                                    vIdx,
                                    'access_code',
                                    generateProductAccessCode(),
                                  )
                                }
                              >
                                Generate
                              </Button>
                            </div>
                          )}
                          {variant.visibility_mode === 'affiliate' && (
                            <Textarea
                              value={variant.allowed_affiliates || ''}
                              onChange={(e) => {
                                const affiliates = e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter((s) => s.length > 0);
                                handleUpdateProductAccessVariant(
                                  vIdx,
                                  'allowed_affiliates',
                                  affiliates.length > 0 ? affiliates.join(', ') : null,
                                );
                              }}
                              placeholder="Allowed affiliate slugs (comma-separated)"
                              rows={2}
                              className="text-sm"
                            />
                          )}
                          {(variant.visibility_mode === 'code' || variant.visibility_mode === 'affiliate') && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs font-medium">New price ($)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={variant.price_override ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    handleUpdateProductAccessVariant(vIdx, 'price_override', val ? val : null, val ? { discount_percent: null } : undefined);
                                  }}
                                  placeholder="Override price"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-xs font-medium">Discount %</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={variant.discount_percent ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    handleUpdateProductAccessVariant(vIdx, 'discount_percent', val ? val : null, val ? { price_override: null } : undefined);
                                  }}
                                  placeholder="e.g. 20"
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          )}
                          <div>
                            <Label className="text-xs font-medium">Quota (optional)</Label>
                            <Input
                              type="number"
                              min="1"
                              value={variant.quota ?? ''}
                              onChange={(e) => {
                                const val = e.target.value.trim();
                                handleUpdateProductAccessVariant(vIdx, 'quota', val ? val : null);
                              }}
                              placeholder="Max units via this promo"
                              className="mt-1 max-w-[180px]"
                            />
                          </div>
                          {variant.visibility_mode === 'code' &&
                            variant.access_code?.trim() &&
                            isEditMode &&
                            id &&
                            currentOrg?.slug && (
                              <div>
                                <Label className="text-xs font-medium mb-1 block">Share product link</Label>
                                <div className="flex gap-2">
                                  <Input
                                    readOnly
                                    value={`https://growbrohk.com/${currentOrg.slug}/products/${id}?code=${encodeURIComponent(variant.access_code.trim())}`}
                                    className="flex-1 font-mono text-xs"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(
                                          `https://growbrohk.com/${currentOrg.slug}/products/${id}?code=${encodeURIComponent(variant.access_code!.trim())}`,
                                        );
                                        toast({ title: 'Copied!', description: 'Product link copied' });
                                      } catch {
                                        toast({
                                          title: 'Error',
                                          description: 'Failed to copy',
                                          variant: 'destructive',
                                        });
                                      }
                                    }}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddProductAccessVariant}
                        className="mt-1"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add access variant
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
              <Label htmlFor="basePrice">Base Price (decimal)</Label>
              <Input id="basePrice" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="e.g. 199.00" className="h-10" />
                      </div>

                <div className="space-y-2">
              <Label htmlFor="cost">Cost (optional)</Label>
              <Input id="cost" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 80.00" className="h-10" />
              <p className="text-sm text-muted-foreground">
                Unit cost for profit-based partner commission (shipping and payment fee (Stripe) are also deducted).
              </p>
                      </div>

                {!embedded && (
                  <ProductCollabSection
                    productId={id ?? undefined}
                    hostOrgId={currentOrg?.id}
                    enabled={collabEnabled}
                    onEnabledChange={setCollabEnabled}
                    partners={productPartners}
                    onPartnersChange={setProductPartners}
                  />
                )}

                {/* Stock input for Simple Products */}
                {productKind === 'simple' && (
                  <div className="space-y-2">
                    <Label htmlFor="simpleStock">Stock</Label>
                    <Input
                      id="simpleStock"
                      type="number"
                      value={simpleStock}
                      onChange={(e) => setSimpleStock(e.target.value)}
                      placeholder="0"
                      className="h-10"
                      min="0"
                    />
                    <p className="text-sm text-muted-foreground">Stock in Main warehouse</p>
                  </div>
                )}

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

            {/* Variants section - only show for variable products */}
            {productKind === 'variable' && (
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

                {/* Variant Combinations Table */}
                {variants.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <Label>Variant Combinations</Label>
                      <p className="text-sm text-muted-foreground">
                        Edit SKU, price, stock{isEditMode && ` @ ${warehouses.find(w => w.id === selectedWarehouseId)?.name || 'warehouse'}`}{!isEditMode && ' (at default warehouse)'}, and status. SKU auto-generates if left blank.
                      </p>
                    </div>

                    {/* Excel-style table */}
                    <div className="border border-border rounded overflow-x-auto">
                      <table className="w-full border-collapse table-fixed">
                        <thead>
                          <tr className="bg-muted/50 border-t">
                            <th className="sticky top-0 z-10 bg-muted/50 p-0 border text-[11px] w-[88px]">Variant</th>
                            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground">Stock</th>
                            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground">Price</th>
                            <th className="sticky top-0 z-10 bg-muted/50 p-0 border text-[11px] w-[96px]">SKU</th>
                            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-center text-muted-foreground">Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variants.map((v, idx) => (
                            <tr key={v.id ?? idx} className="border-t hover:bg-muted/30 even:bg-muted/10">
                              <td className="p-0 border w-[88px]">
                                <span className="block px-1 py-0 text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                                  {v.name}
                                </span>
                              </td>
                              <td className="p-0 border w-[48px]">
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={v.stock || ''}
                                  onChange={(e) => updateVariantField(idx, 'stock', e.target.value)}
                                  className="w-full h-auto bg-transparent border-0 rounded-none px-1 py-0 text-xs leading-tight outline-none focus:ring-1 focus:ring-primary/40"
                                  min="0"
                                />
                              </td>
                              <td className="p-0 border w-[56px]">
                                <input
                                  type="text"
                                  placeholder="0.00"
                                  value={v.price || ''}
                                  onChange={(e) => updateVariantField(idx, 'price', e.target.value)}
                                  className="w-full h-auto bg-transparent border-0 rounded-none px-1 py-0 text-xs leading-tight outline-none focus:ring-1 focus:ring-primary/40"
                                />
                              </td>
                              <td className="p-0 border w-[96px]">
                                <input
                                  type="text"
                                  placeholder="Auto"
                                  value={v.sku || ''}
                                  onChange={(e) => updateVariantField(idx, 'sku', e.target.value)}
                                  className="w-full bg-transparent border-0 rounded-none px-1 py-0 text-xs leading-tight outline-none focus:ring-1 focus:ring-primary/40"
                                />
                              </td>
                              <td className="p-0 border w-[40px]">
                                <div className="flex items-center justify-center scale-90">
                                  <Switch
                                    checked={v.active}
                                    onCheckedChange={(checked) => updateVariantField(idx, 'active', checked)}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}


            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
              <div className="flex flex-col gap-3 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (embedded ? props?.onCancel?.() : navigate('/app/products'))}
                  disabled={saving || deleting}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                {canDeleteProduct && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={saving || deleting}
                    className="w-full sm:w-auto"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Product
                  </Button>
                )}
              </div>
              <Button
                type="submit"
                disabled={!canSubmit || saving || deleting}
                className="w-full sm:w-auto"
              >
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

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (deleting) return;
          setShowDeleteDialog(open);
          if (!open) setDeletePassword('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {title.trim() ? `"${title.trim()}"` : 'this product'}? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-product-password">Password</Label>
            <Input
              id="delete-product-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter your account password"
              disabled={deleting}
              className="h-10"
            />
            <p className="text-sm text-muted-foreground">
              Enter your account password to confirm deletion.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting || !deletePassword.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

