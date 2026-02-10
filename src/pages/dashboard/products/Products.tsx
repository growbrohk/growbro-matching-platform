import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, ChevronDown, ChevronRight, ChevronsDown, Pencil, Search, Save, X, SlidersHorizontal, Check, Settings, ArrowLeft, ArrowRightLeft } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { getCategories, type ProductCategory } from '@/lib/api/categories-and-tags';
import { getProducts } from '@/lib/api/products';
import { getVariantConfig } from '@/lib/api/variant-config';
import { getVariantOptionValue, parseVariantName, getUniqueVariantOptionNames } from '@/lib/utils/variant-parser';
import type { Product } from '@/lib/types';
import { InventoryPanel } from '@/components/catalog/InventoryPanel';

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number | null;
  active: boolean;
};

type InventoryItem = {
  id: string;
  variant_id: string;
  warehouse_id: string;
  quantity: number;
};

type Warehouse = {
  id: string;
  name: string;
};

interface ProductWithDetails extends Product {
  variants: ProductVariant[];
  inventoryItems: InventoryItem[];
}

interface ProductsProps {
  // Products is a sub-view under Catalog.
  // Do not render standalone page headers or pillar tabs when embedded.
  isEmbeddedInCatalog?: boolean;
  selectedPillar?: 'catalog' | 'inventory';
  onChangePillar?: (pillar: 'catalog' | 'inventory') => void;
}

// MultiSelectDropdown component for filter dropdowns
interface MultiSelectDropdownProps {
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
  selected: string[];
  setSelected: (next: string[]) => void;
  placeholder: string;
  isCategory?: boolean; // Special handling for category "All" option
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  setSelected,
  placeholder,
  isCategory = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleToggle = (value: string) => {
    if (isCategory && value === 'all') {
      // For category: selecting "All" clears all selections (empty = all)
      setSelected([]);
    } else {
      // For regular multi-select: toggle the value
      if (selected.includes(value)) {
        setSelected(selected.filter(v => v !== value));
      } else {
        setSelected([...selected, value]);
      }
    }
  };

  const handleClear = () => {
    setSelected([]);
  };

  const displayText = () => {
    if (selected.length === 0) {
      // For categories, empty means "All"
      if (isCategory) {
        const allOption = options.find(opt => opt.value === 'all');
        return allOption ? allOption.label : placeholder;
      }
      return placeholder;
    }
    if (selected.length === 1) {
      const option = options.find(opt => opt.value === selected[0]);
      return option ? option.label : placeholder;
    }
    return `${selected.length} selected`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">{label}</div>
        {selected.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between text-left font-normal"
          >
            <span className="truncate">{displayText()}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="max-h-[300px] overflow-y-auto">
            {options.map((option) => {
              // For categories, empty array means "All" is selected
              const isSelected = isCategory && option.value === 'all'
                ? selected.length === 0
                : selected.includes(option.value);
              return (
                <div
                  key={option.value}
                  className="flex items-center space-x-2 px-3 py-2 hover:bg-muted cursor-pointer"
                  onClick={() => handleToggle(option.value)}
                >
                  <div className="flex items-center justify-center w-4 h-4 border rounded border-gray-300">
                    {isSelected && <Check className="h-3 w-3 text-[#0E7A3A]" />}
                  </div>
                  <label className="text-sm cursor-pointer flex-1">
                    {option.label}
                    {option.count !== undefined && (
                      <span className="text-muted-foreground ml-1">({option.count})</span>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function Products({ isEmbeddedInCatalog = false, selectedPillar: propSelectedPillar, onChangePillar: propOnChangePillar }: ProductsProps = {}) {
  const { currentOrg, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filters
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [localSelectedPillar, setLocalSelectedPillar] = useState<'catalog' | 'inventory'>('catalog');
  const [filterOpen, setFilterOpen] = useState(false);
  
  // Variant option filters
  const [selectedRank1Values, setSelectedRank1Values] = useState<string[]>([]);
  const [selectedRank2Values, setSelectedRank2Values] = useState<string[]>([]);

  // Use prop pillar when embedded, otherwise use local state
  const selectedPillar = isEmbeddedInCatalog ? (propSelectedPillar ?? 'catalog') : localSelectedPillar;
  const setSelectedPillar = isEmbeddedInCatalog && propOnChangePillar ? propOnChangePillar : setLocalSelectedPillar;
  
  // Variant rank config
  const [rank1, setRank1] = useState('Color');
  const [rank2, setRank2] = useState('Size');
  
  // Expansion state
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedRank1Groups, setExpandedRank1Groups] = useState<Set<string>>(new Set());
  
  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultView, setDefaultView] = useState<'list' | 'group'>('list');
  const [defaultExpand, setDefaultExpand] = useState<'collapsed' | 'expanded'>('collapsed');

  // Bulk edit state
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Record<string, { stock?: number; price?: number }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const originalValuesRef = useRef<Record<string, { stock: number; price: number }>>({});
  
  // Bulk action mode state
  const [bulkMode, setBulkMode] = useState<'none' | 'correction' | 'restock' | 'transfer'>('none');
  const [isBulkModeDialogOpen, setIsBulkModeDialogOpen] = useState(false);
  
  // Restock mode state
  const [restockReferenceNote, setRestockReferenceNote] = useState('');
  const [restockEdits, setRestockEdits] = useState<Record<string, number>>({});
  
  // Transfer mode state
  const [transferFromWarehouseId, setTransferFromWarehouseId] = useState<string>('');
  const [transferToWarehouseId, setTransferToWarehouseId] = useState<string>('');
  const [transferReferenceNote, setTransferReferenceNote] = useState('');
  const [transferEdits, setTransferEdits] = useState<Record<string, number>>({});
  const [isTransferSetupOpen, setIsTransferSetupOpen] = useState(false);

  const canCreate = !!currentOrg?.id;

  // Load saved defaults from localStorage
  useEffect(() => {
    if (!currentOrg?.id) return;
    
    const savedView = localStorage.getItem(`gb:${currentOrg.id}:products_default_view`) as 'list' | 'group' | null;
    const savedExpand = localStorage.getItem(`gb:${currentOrg.id}:products_default_expand`) as 'collapsed' | 'expanded' | null;
    
    if (savedView === 'list' || savedView === 'group') {
      setDefaultView(savedView);
    }
    if (savedExpand === 'collapsed' || savedExpand === 'expanded') {
      setDefaultExpand(savedExpand);
    }
  }, [currentOrg?.id]);

  // Track if we've applied initial expand behavior
  const hasAppliedInitialExpand = useRef(false);

  // Apply default expand behavior when products are loaded (only once per org)
  useEffect(() => {
    if (!currentOrg?.id || loading) return;
    
    if (defaultExpand === 'expanded' && products.length > 0 && !hasAppliedInitialExpand.current) {
      // Auto-expand all products if default is 'expanded'
      const allProductIds = new Set(products.map(p => p.id));
      setExpandedProducts(allProductIds);
      hasAppliedInitialExpand.current = true;
    } else if (defaultExpand === 'collapsed' && hasAppliedInitialExpand.current === false) {
      // Mark as applied even if collapsed, so we don't re-run
      hasAppliedInitialExpand.current = true;
    }
  }, [defaultExpand, products.length, loading, currentOrg?.id]);

  // Reset the flag when org changes
  useEffect(() => {
    hasAppliedInitialExpand.current = false;
    setExpandedProducts(new Set());
    setExpandedRank1Groups(new Set());
  }, [currentOrg?.id]);

  useEffect(() => {
    if (!currentOrg) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch categories, warehouses, and variant config in parallel
        const [categoriesData, warehousesResult, variantConfigData] = await Promise.all([
          getCategories(currentOrg.id),
          supabase
            .from('warehouses')
            .select('id, name')
            .eq('org_id', currentOrg.id)
            .order('created_at', { ascending: true }),
          getVariantConfig(currentOrg.id),
        ]);

        setCategories(categoriesData);
        setRank1(variantConfigData.rank1);
        setRank2(variantConfigData.rank2);
        
        const whs = (warehousesResult.data || []) as Warehouse[];
        setWarehouses(whs);
        
          // Select default warehouse: prefer "Main" (case-insensitive), else first
        if (whs.length > 0) {
          const mainWh = whs.find(w => w.name.toLowerCase().includes('main')) || whs[0];
          setSelectedWarehouseId(mainWh.id);
          setTransferFromWarehouseId(mainWh.id);
          // Set transferToWarehouseId to first warehouse != from (or first if only one)
          const toWh = whs.length > 1 ? whs.find(w => w.id !== mainWh.id) || whs[0] : whs[0];
          setTransferToWarehouseId(toWh.id);
        }

        // Fetch products using the products API
        const productsData = await getProducts(currentOrg.id);

        // Fetch variants, tags, and inventory for all products
        const productIds = productsData.map(p => p.id);
        
        let allVariants: ProductVariant[] = [];
        let allInventoryItems: InventoryItem[] = [];
        
        if (productIds.length > 0) {
          const [variantsResult, inventoryResult] = await Promise.all([
            supabase
              .from('product_variants')
              .select('id, product_id, name, sku, price, active')
              .in('product_id', productIds)
              .is('archived_at', null)
              .order('created_at', { ascending: true }),
            supabase
              .from('inventory_items')
              .select('id, variant_id, warehouse_id, quantity')
              .eq('org_id', currentOrg.id),
          ]);
          
          if (variantsResult.error) throw variantsResult.error;
          if (inventoryResult.error) throw inventoryResult.error;
          
          allVariants = (variantsResult.data || []) as ProductVariant[];
          allInventoryItems = (inventoryResult.data || []) as InventoryItem[];
        }
        
        // Build products with details
        const productsWithDetails = productsData.map((product) => {
          const productVariants = allVariants.filter(v => v.product_id === product.id);
          const variantIds = productVariants.map(v => v.id);
          const productInventory = allInventoryItems.filter(i => variantIds.includes(i.variant_id));
          
          return {
            ...product,
            variants: productVariants,
            inventoryItems: productInventory,
          };
        });
        
        setProducts(productsWithDetails);
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

  // Compute available variant option values from products (before variant filters)
  // This uses products filtered by physical/category/search only
  const productsBeforeVariantFilters = useMemo(() => {
    let filtered = products.filter(p => p.type === 'physical');
    
    // Filter by category (multi-select)
    // Empty array or includes 'all' means no category filtering
    if (selectedCategoryIds.length > 0 && !selectedCategoryIds.includes('all')) {
      filtered = filtered.filter(p => {
        const hasUncategorized = selectedCategoryIds.includes('uncategorized');
        const hasCategoryId = p.category_id && selectedCategoryIds.includes(p.category_id);
        return (hasUncategorized && !p.category_id) || hasCategoryId;
      });
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.variants.some(v => v.sku?.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [products, selectedCategoryIds, searchQuery]);

  // Get available rank1 and rank2 option values
  const rank1Options = useMemo(() => {
    const values = new Set<string>();
    productsBeforeVariantFilters.forEach(product => {
      product.variants.forEach(variant => {
        const value = getVariantOptionValue(variant.name, rank1);
        if (value && value.trim()) {
          values.add(value);
        }
      });
    });
    return Array.from(values).sort();
  }, [productsBeforeVariantFilters, rank1]);

  const rank2Options = useMemo(() => {
    const values = new Set<string>();
    productsBeforeVariantFilters.forEach(product => {
      product.variants.forEach(variant => {
        const value = getVariantOptionValue(variant.name, rank2);
        if (value && value.trim()) {
          values.add(value);
        }
      });
    });
    return Array.from(values).sort();
  }, [productsBeforeVariantFilters, rank2]);

  // Filter products by selected category, search query, and variant options (only physical products)
  const filteredProducts = useMemo(() => {
    let filtered = productsBeforeVariantFilters;
    
    // Apply variant option filters
    // A product passes if it has AT LEAST ONE variant that matches ALL active variant filters
    if (selectedRank1Values.length > 0 || selectedRank2Values.length > 0) {
      filtered = filtered.filter(product => {
        return product.variants.some(variant => {
          const v1 = getVariantOptionValue(variant.name, rank1);
          const v2 = getVariantOptionValue(variant.name, rank2);
          
          // Check rank1 filter
          const ok1 = selectedRank1Values.length === 0 || (v1 && selectedRank1Values.includes(v1));
          
          // Check rank2 filter
          const ok2 = selectedRank2Values.length === 0 || (v2 && selectedRank2Values.includes(v2));
          
          return ok1 && ok2;
        });
      });
    }
    
    return filtered;
  }, [productsBeforeVariantFilters, selectedRank1Values, selectedRank2Values, rank1, rank2]);

  // Category counts (only physical products)
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    
    // Only count physical products
    const relevantProducts = products.filter(p => p.type === 'physical');
    
    counts.set('all', relevantProducts.length);
    
    relevantProducts.forEach(p => {
      const catId = p.category_id || 'uncategorized';
      counts.set(catId, (counts.get(catId) || 0) + 1);
    });
    
    return counts;
  }, [products]);

  // Category options for dropdown (including 'all' and 'uncategorized')
  const categoryOptions = useMemo(() => {
    const options: Array<{ id: string; name: string; count: number }> = [
      { id: 'all', name: 'All', count: categoryCounts.get('all') || 0 }
    ];
    
    // Add regular categories
    categories
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach(cat => {
        options.push({
          id: cat.id,
          name: cat.name,
          count: categoryCounts.get(cat.id) || 0
        });
      });
    
    // Add uncategorized if it has products
    const uncategorizedCount = categoryCounts.get('uncategorized') || 0;
    if (uncategorizedCount > 0) {
      options.push({
        id: 'uncategorized',
        name: 'Uncategorized',
        count: uncategorizedCount
      });
    }
    
    return options;
  }, [categories, categoryCounts]);

  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        // Also collapse all rank1 groups for this product
        setExpandedRank1Groups(prevGroups => {
          const nextGroups = new Set(prevGroups);
          Array.from(nextGroups).forEach(key => {
            if (key.startsWith(`${productId}:`)) {
              nextGroups.delete(key);
            }
          });
          return nextGroups;
        });
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const expandAllVariants = (productId: string, variants: ProductVariant[]) => {
    setExpandedProducts(prev => new Set(prev).add(productId));
    
    // Group by rank1 and expand all
    const rank1Values = new Set<string>();
    variants.forEach(v => {
      const rank1Val = getVariantOptionValue(v.name, rank1);
      if (rank1Val) rank1Values.add(rank1Val);
    });
    
    setExpandedRank1Groups(prev => {
      const next = new Set(prev);
      rank1Values.forEach(val => {
        next.add(`${productId}:${val}`);
      });
      return next;
    });
  };

  const toggleRank1Group = (groupKey: string) => {
    setExpandedRank1Groups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // Get total quantity for a product
  const getProductQuantity = (product: ProductWithDetails): number => {
    if (!selectedWarehouseId) return 0;
    return product.inventoryItems
      .filter(i => i.warehouse_id === selectedWarehouseId)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  // Get quantity for a specific variant
  const getVariantQuantity = (variantId: string, inventoryItems: InventoryItem[]): number => {
    if (!selectedWarehouseId) return 0;
    return inventoryItems
      .filter(i => i.variant_id === variantId && i.warehouse_id === selectedWarehouseId)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  // Get current stock for a variant+warehouse (for bulk edit)
  const getCurrentStock = (variantId: string, warehouseId: string): number => {
    const inventoryItem = products
      .flatMap(p => p.inventoryItems)
      .find(i => i.variant_id === variantId && i.warehouse_id === warehouseId);
    return inventoryItem?.quantity ?? 0;
  };
  
  // Helper to get quantity for variant+warehouse (reusable)
  const getQty = (variantId: string, warehouseId: string): number => {
    return getCurrentStock(variantId, warehouseId);
  };

  // Get current price for a variant (for bulk edit)
  const getCurrentPrice = (variantId: string): number => {
    const variant = products
      .flatMap(p => p.variants)
      .find(v => v.id === variantId);
    return variant?.price ?? 0;
  };

  // Open bulk mode picker dialog
  const handleOpenBulkModePicker = () => {
    if (!selectedWarehouseId) {
      toast({
        title: 'Error',
        description: 'Please select a warehouse first',
        variant: 'destructive',
      });
      return;
    }
    setIsBulkModeDialogOpen(true);
  };
  
  // Enter bulk edit mode (correction) - snapshot current values
  const handleEnterBulkEdit = () => {
    const snapshot: Record<string, { stock: number; price: number }> = {};
    
    products.forEach(product => {
      product.variants.forEach(variant => {
        const stockKey = `${variant.id}:${selectedWarehouseId}`;
        const priceKey = `${variant.id}`;
        
        snapshot[stockKey] = {
          stock: getCurrentStock(variant.id, selectedWarehouseId),
          price: getCurrentPrice(variant.id),
        };
        snapshot[priceKey] = snapshot[stockKey]; // Share same object for convenience
      });
    });
    
    originalValuesRef.current = snapshot;
    setIsBulkEdit(true);
    setPendingEdits({});
    setBulkMode('correction');
  };
  
  // Enter restock mode
  const handleEnterRestock = () => {
    setRestockReferenceNote('');
    setRestockEdits({});
    setBulkMode('restock');
    setIsBulkModeDialogOpen(false);
  };
  
  // Open transfer setup dialog
  const handleEnterTransfer = () => {
    // Initialize with current warehouse as FROM, and first other warehouse as TO
    setTransferFromWarehouseId(selectedWarehouseId);
    const otherWarehouse = warehouses.find(w => w.id !== selectedWarehouseId) || warehouses[0];
    if (otherWarehouse) {
      setTransferToWarehouseId(otherWarehouse.id);
    }
    setTransferReferenceNote('');
    setIsBulkModeDialogOpen(false);
    setIsTransferSetupOpen(true);
  };
  
  // Confirm transfer setup and enter transfer mode
  const handleConfirmTransferSetup = () => {
    if (!transferFromWarehouseId || !transferToWarehouseId) {
      toast({
        title: 'Error',
        description: 'Please select both From and To warehouses',
        variant: 'destructive',
      });
      return;
    }
    
    if (transferFromWarehouseId === transferToWarehouseId) {
      toast({
        title: 'Error',
        description: 'From and To warehouses must be different',
        variant: 'destructive',
      });
      return;
    }
    
    // If FROM warehouse changed, clear transfer edits
    const fromWarehouseChanged = bulkMode === 'transfer' && selectedWarehouseId !== transferFromWarehouseId;
    if (fromWarehouseChanged) {
      setTransferEdits({});
    }
    
    // Set selectedWarehouseId to FROM warehouse so Stock column shows FROM stock
    setSelectedWarehouseId(transferFromWarehouseId);
    setBulkMode('transfer');
    setIsTransferSetupOpen(false);
  };
  
  // Exit bulk mode (any mode)
  const handleExitBulkMode = () => {
    setBulkMode('none');
    setIsBulkEdit(false);
    setPendingEdits({});
    setRestockEdits({});
    setTransferEdits({});
    setTransferReferenceNote('');
    originalValuesRef.current = {};
  };

  // Exit bulk edit mode
  const handleCancelBulkEdit = () => {
    setIsBulkEdit(false);
    setPendingEdits({});
    originalValuesRef.current = {};
  };

  // Save bulk edits
  const handleSaveBulkEdit = async () => {
    if (!currentOrg?.id || !selectedWarehouseId) {
      toast({
        title: 'Error',
        description: 'Organization or warehouse not selected',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    
    try {
      const stockEdits: Array<{ variantId: string; warehouseId: string; oldQty: number; newQty: number }> = [];
      const priceEdits: Array<{ variantId: string; newPrice: number }> = [];

      // Collect stock edits
      Object.entries(pendingEdits).forEach(([key, edits]) => {
        if (key.includes(':')) {
          // Stock edit: format is "variantId:warehouseId"
          const [variantId, warehouseId] = key.split(':');
          if (edits.stock !== undefined) {
            const oldQty = originalValuesRef.current[key]?.stock ?? getCurrentStock(variantId, warehouseId);
            const newQty = edits.stock;
            if (oldQty !== newQty) {
              stockEdits.push({ variantId, warehouseId, oldQty, newQty });
            }
          }
        } else {
          // Price edit: format is "variantId"
          const variantId = key;
          if (edits.price !== undefined) {
            const oldPrice = originalValuesRef.current[variantId]?.price ?? getCurrentPrice(variantId);
            const newPrice = edits.price;
            if (oldPrice !== newPrice) {
              priceEdits.push({ variantId, newPrice });
            }
          }
        }
      });

      // Process stock edits
      for (const edit of stockEdits) {
        // Find or create inventory_item
        let inventoryItemId: string | null = null;
        const existingItem = products
          .flatMap(p => p.inventoryItems)
          .find(i => i.variant_id === edit.variantId && i.warehouse_id === edit.warehouseId);

        if (existingItem) {
          inventoryItemId = existingItem.id;
          // Update quantity
          const { error: updateError } = await supabase
            .from('inventory_items')
            .update({ quantity: edit.newQty, updated_at: new Date().toISOString() })
            .eq('id', inventoryItemId);

          if (updateError) throw updateError;
        } else {
          // Create new inventory_item
          const { data: newItem, error: createError } = await supabase
            .from('inventory_items')
            .insert({
              org_id: currentOrg.id,
              variant_id: edit.variantId,
              warehouse_id: edit.warehouseId,
              quantity: edit.newQty,
            })
            .select('id')
            .single();

          if (createError) throw createError;
          inventoryItemId = newItem.id;
        }

        // Create inventory_movement
        const delta = edit.newQty - edit.oldQty;
        if (delta !== 0 && inventoryItemId) {
          const { error: movementError } = await supabase
            .from('inventory_movements')
            .insert({
              inventory_item_id: inventoryItemId,
              delta,
              reason: 'correction',
              note: 'Bulk edit in Catalog',
              created_by: user?.id || null,
            });

          if (movementError) throw movementError;
        }
      }

      // Process price edits
      for (const edit of priceEdits) {
        const { error: priceError } = await supabase
          .from('product_variants')
          .update({ price: edit.newPrice })
          .eq('id', edit.variantId);

        if (priceError) throw priceError;
      }

      // Refresh data
      const productsData = await getProducts(currentOrg.id);
      const productIds = productsData.map(p => p.id);
      
      let allVariants: ProductVariant[] = [];
      let allInventoryItems: InventoryItem[] = [];
      
      if (productIds.length > 0) {
        const [variantsResult, inventoryResult] = await Promise.all([
          supabase
            .from('product_variants')
            .select('id, product_id, name, sku, price, active')
            .in('product_id', productIds)
            .is('archived_at', null)
            .order('created_at', { ascending: true }),
          supabase
            .from('inventory_items')
            .select('id, variant_id, warehouse_id, quantity')
            .eq('org_id', currentOrg.id),
        ]);
        
        if (variantsResult.error) throw variantsResult.error;
        if (inventoryResult.error) throw inventoryResult.error;
        
        allVariants = (variantsResult.data || []) as ProductVariant[];
        allInventoryItems = (inventoryResult.data || []) as InventoryItem[];
      }
      
      const productsWithDetails = productsData.map((product) => {
        const productVariants = allVariants.filter(v => v.product_id === product.id);
        const variantIds = productVariants.map(v => v.id);
        const productInventory = allInventoryItems.filter(i => variantIds.includes(i.variant_id));
        
        return {
          ...product,
          variants: productVariants,
          inventoryItems: productInventory,
        };
      });
      
      setProducts(productsWithDetails);
      
      // Exit bulk edit mode
      setIsBulkEdit(false);
      setPendingEdits({});
      originalValuesRef.current = {};
      
      toast({
        title: 'Success',
        description: 'Changes saved successfully',
      });
    } catch (err: any) {
      console.error('Error saving bulk edits:', err);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Save restock edits
  const handleSaveRestock = async () => {
    if (!currentOrg?.id || !selectedWarehouseId || !user?.id) {
      toast({
        title: 'Error',
        description: 'Organization, warehouse, or user not available',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if any qty > 0
    const hasEdits = Object.values(restockEdits).some(qty => qty > 0);
    if (!hasEdits) {
      toast({
        title: 'Error',
        description: 'Please enter at least one restock quantity',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Process each variant with restock qty > 0
      for (const [variantId, qty] of Object.entries(restockEdits)) {
        if (qty <= 0) continue;
        
        // Find or create inventory_item
        let inventoryItemId: string | null = null;
        const existingItem = products
          .flatMap(p => p.inventoryItems)
          .find(i => i.variant_id === variantId && i.warehouse_id === selectedWarehouseId);
        
        const currentQty = existingItem?.quantity ?? 0;
        const newQty = currentQty + qty;
        
        if (existingItem) {
          inventoryItemId = existingItem.id;
          // Update quantity
          const { error: updateError } = await supabase
            .from('inventory_items')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', inventoryItemId);
          
          if (updateError) throw updateError;
        } else {
          // Create new inventory_item
          const { data: newItem, error: createError } = await supabase
            .from('inventory_items')
            .insert({
              org_id: currentOrg.id,
              variant_id: variantId,
              warehouse_id: selectedWarehouseId,
              quantity: newQty,
            })
            .select('id')
            .single();
          
          if (createError) throw createError;
          inventoryItemId = newItem.id;
        }
        
        // Create inventory_movement
        const note = restockReferenceNote.trim()
          ? `Bulk restock — ${restockReferenceNote}`
          : 'Bulk restock';
        
        const { error: movementError } = await supabase
          .from('inventory_movements')
          .insert({
            inventory_item_id: inventoryItemId,
            delta: qty,
            reason: 'restock',
            note,
            created_by: user.id,
          });
        
        if (movementError) throw movementError;
      }
      
      // Refresh data (same as correction mode)
      const productsData = await getProducts(currentOrg.id);
      const productIds = productsData.map(p => p.id);
      
      let allVariants: ProductVariant[] = [];
      let allInventoryItems: InventoryItem[] = [];
      
      if (productIds.length > 0) {
        const [variantsResult, inventoryResult] = await Promise.all([
          supabase
            .from('product_variants')
            .select('id, product_id, name, sku, price, active')
            .in('product_id', productIds)
            .is('archived_at', null)
            .order('created_at', { ascending: true }),
          supabase
            .from('inventory_items')
            .select('id, variant_id, warehouse_id, quantity')
            .eq('org_id', currentOrg.id),
        ]);
        
        if (variantsResult.error) throw variantsResult.error;
        if (inventoryResult.error) throw inventoryResult.error;
        
        allVariants = (variantsResult.data || []) as ProductVariant[];
        allInventoryItems = (inventoryResult.data || []) as InventoryItem[];
      }
      
      const productsWithDetails = productsData.map((product) => {
        const productVariants = allVariants.filter(v => v.product_id === product.id);
        const variantIds = productVariants.map(v => v.id);
        const productInventory = allInventoryItems.filter(i => variantIds.includes(i.variant_id));
        
        return {
          ...product,
          variants: productVariants,
          inventoryItems: productInventory,
        };
      });
      
      setProducts(productsWithDetails);
      
      // Exit restock mode
      handleExitBulkMode();
      
      toast({
        title: 'Success',
        description: 'Restock completed successfully',
      });
    } catch (err: any) {
      console.error('Error saving restock:', err);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to save restock',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Save transfer edits
  const handleSaveTransfer = async () => {
    if (!currentOrg?.id || !transferFromWarehouseId || !transferToWarehouseId || !user?.id) {
      toast({
        title: 'Error',
        description: 'Organization, warehouses, or user not available',
        variant: 'destructive',
      });
      return;
    }
    
    if (transferFromWarehouseId === transferToWarehouseId) {
      toast({
        title: 'Error',
        description: 'From and To warehouses must be different',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if any qty > 0
    const hasEdits = Object.values(transferEdits).some(qty => qty > 0);
    if (!hasEdits) {
      toast({
        title: 'Error',
        description: 'Please enter at least one transfer quantity',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSaving(true);
    
    try {
      const fromWarehouse = warehouses.find(w => w.id === transferFromWarehouseId);
      const toWarehouse = warehouses.find(w => w.id === transferToWarehouseId);
      const fromWarehouseName = fromWarehouse?.name || 'Unknown';
      const toWarehouseName = toWarehouse?.name || 'Unknown';
      
      // Process each variant with transfer qty > 0
      for (const [variantId, qty] of Object.entries(transferEdits)) {
        if (qty <= 0) continue;
        
        // Get FROM inventory_item
        const fromItem = products
          .flatMap(p => p.inventoryItems)
          .find(i => i.variant_id === variantId && i.warehouse_id === transferFromWarehouseId);
        
        const fromCurrentQty = fromItem?.quantity ?? 0;
        
        // Validate: cannot transfer more than available
        if (qty > fromCurrentQty) {
          throw new Error(`Cannot transfer ${qty} units: only ${fromCurrentQty} available in ${fromWarehouseName}`);
        }
        
        // Ensure FROM inventory_item exists (should already exist if qty > 0, but handle edge case)
        let fromInventoryItemId: string | null = null;
        if (fromItem) {
          fromInventoryItemId = fromItem.id;
          // Update FROM quantity
          const { error: updateFromError } = await supabase
            .from('inventory_items')
            .update({ quantity: fromCurrentQty - qty, updated_at: new Date().toISOString() })
            .eq('id', fromInventoryItemId);
          
          if (updateFromError) throw updateFromError;
        } else {
          // This shouldn't happen if qty > 0, but handle gracefully
          throw new Error(`No inventory item found for variant in ${fromWarehouseName}`);
        }
        
        // Find or create TO inventory_item
        let toInventoryItemId: string | null = null;
        const toItem = products
          .flatMap(p => p.inventoryItems)
          .find(i => i.variant_id === variantId && i.warehouse_id === transferToWarehouseId);
        
        const toCurrentQty = toItem?.quantity ?? 0;
        const toNewQty = toCurrentQty + qty;
        
        if (toItem) {
          toInventoryItemId = toItem.id;
          // Update TO quantity
          const { error: updateToError } = await supabase
            .from('inventory_items')
            .update({ quantity: toNewQty, updated_at: new Date().toISOString() })
            .eq('id', toInventoryItemId);
          
          if (updateToError) throw updateToError;
        } else {
          // Create new inventory_item for TO warehouse
          const { data: newToItem, error: createToError } = await supabase
            .from('inventory_items')
            .insert({
              org_id: currentOrg.id,
              variant_id: variantId,
              warehouse_id: transferToWarehouseId,
              quantity: toNewQty,
            })
            .select('id')
            .single();
          
          if (createToError) throw createToError;
          toInventoryItemId = newToItem.id;
        }
        
        // Create TWO inventory_movements
        const baseNote = transferReferenceNote.trim()
          ? `Transfer ${transferReferenceNote}`
          : 'Transfer';
        
        // FROM movement (outgoing)
        const fromNote = transferReferenceNote.trim()
          ? `Transfer to ${toWarehouseName} — ${transferReferenceNote}`
          : `Transfer to ${toWarehouseName}`;
        const { error: fromMovementError } = await supabase
          .from('inventory_movements')
          .insert({
            inventory_item_id: fromInventoryItemId,
            delta: -qty,
            reason: 'transfer',
            note: fromNote,
            created_by: user.id,
          });
        
        if (fromMovementError) throw fromMovementError;
        
        // TO movement (incoming)
        const toNote = transferReferenceNote.trim()
          ? `Transfer from ${fromWarehouseName} — ${transferReferenceNote}`
          : `Transfer from ${fromWarehouseName}`;
        const { error: toMovementError } = await supabase
          .from('inventory_movements')
          .insert({
            inventory_item_id: toInventoryItemId,
            delta: qty,
            reason: 'transfer',
            note: toNote,
            created_by: user.id,
          });
        
        if (toMovementError) throw toMovementError;
      }
      
      // Refresh data (same as correction mode)
      const productsData = await getProducts(currentOrg.id);
      const productIds = productsData.map(p => p.id);
      
      let allVariants: ProductVariant[] = [];
      let allInventoryItems: InventoryItem[] = [];
      
      if (productIds.length > 0) {
        const [variantsResult, inventoryResult] = await Promise.all([
          supabase
            .from('product_variants')
            .select('id, product_id, name, sku, price, active')
            .in('product_id', productIds)
            .is('archived_at', null)
            .order('created_at', { ascending: true }),
          supabase
            .from('inventory_items')
            .select('id, variant_id, warehouse_id, quantity')
            .eq('org_id', currentOrg.id),
        ]);
        
        if (variantsResult.error) throw variantsResult.error;
        if (inventoryResult.error) throw inventoryResult.error;
        
        allVariants = (variantsResult.data || []) as ProductVariant[];
        allInventoryItems = (inventoryResult.data || []) as InventoryItem[];
      }
      
      const productsWithDetails = productsData.map((product) => {
        const productVariants = allVariants.filter(v => v.product_id === product.id);
        const variantIds = productVariants.map(v => v.id);
        const productInventory = allInventoryItems.filter(i => variantIds.includes(i.variant_id));
        
        return {
          ...product,
          variants: productVariants,
          inventoryItems: productInventory,
        };
      });
      
      setProducts(productsWithDetails);
      
      // Exit transfer mode
      handleExitBulkMode();
      
      toast({
        title: 'Success',
        description: 'Transfer completed successfully',
      });
    } catch (err: any) {
      console.error('Error saving transfer:', err);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to save transfer',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
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
    <div className={`w-full min-w-0 ${isEmbeddedInCatalog ? 'px-4 py-6' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} space-y-4 md:space-y-6`}>
      {/* Toolbar: Search + Edit + Add Product */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-10 h-9"
          />
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
              >
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {/* Row 1: Warehouse */}
                <div className="space-y-2">
                  <div className="font-semibold text-sm">Warehouse</div>
                  <Select
                    value={selectedWarehouseId}
                    onValueChange={setSelectedWarehouseId}
                    disabled={warehouses.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={warehouses.length === 0 ? "No warehouses" : "Select warehouse"} />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map(wh => (
                        <SelectItem key={wh.id} value={wh.id}>
                          {wh.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Row 2: Category */}
                <MultiSelectDropdown
                  label="Category"
                  options={categoryOptions.map(opt => ({
                    value: opt.id,
                    label: opt.name,
                    count: opt.count,
                  }))}
                  selected={selectedCategoryIds}
                  setSelected={setSelectedCategoryIds}
                  placeholder="Select categories"
                  isCategory={true}
                />

                {/* Row 3: Variant Filter (rank1) */}
                {rank1 && rank1Options.length > 0 && (
                  <MultiSelectDropdown
                    label={rank1}
                    options={rank1Options.map(opt => ({
                      value: opt,
                      label: opt,
                    }))}
                    selected={selectedRank1Values}
                    setSelected={setSelectedRank1Values}
                    placeholder={`Select ${rank1.toLowerCase()}`}
                  />
                )}

                {/* Row 4: Variant Filter (rank2) */}
                {rank2 && rank2Options.length > 0 && (
                  <MultiSelectDropdown
                    label={rank2}
                    options={rank2Options.map(opt => ({
                      value: opt,
                      label: opt,
                    }))}
                    selected={selectedRank2Values}
                    setSelected={setSelectedRank2Values}
                    placeholder={`Select ${rank2.toLowerCase()}`}
                  />
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      // Reset warehouse to default (prefer "Main" else first)
                      if (warehouses.length > 0) {
                        const mainWh = warehouses.find(w => w.name.toLowerCase().includes('main')) || warehouses[0];
                        setSelectedWarehouseId(mainWh.id);
                      }
                      setSelectedCategoryIds([]);
                      setSelectedRank1Values([]);
                      setSelectedRank2Values([]);
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    className="flex-1"
                    style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                    onClick={() => setFilterOpen(false)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
          {bulkMode === 'none' ? (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Product settings"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Settings</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleOpenBulkModePicker}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Bulk edit products"
                disabled={!selectedWarehouseId}
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Bulk Edit</span>
              </Button>

              <Button
                onClick={() => navigate('/app/products/new')}
                disabled={!canCreate}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                size="icon"
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Add new product"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Add Product</span>
              </Button>
            </>
          ) : bulkMode === 'correction' ? (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={handleExitBulkMode}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Cancel bulk edit"
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Cancel</span>
              </Button>

              <Button
                onClick={handleSaveBulkEdit}
                disabled={isSaving || Object.keys(pendingEdits).length === 0}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                size="icon"
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Save changes"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">{isSaving ? 'Saving...' : 'Save'}</span>
              </Button>
            </>
          ) : bulkMode === 'restock' ? (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={handleExitBulkMode}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Cancel restock"
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Cancel</span>
              </Button>

              <Button
                onClick={handleSaveRestock}
                disabled={isSaving || !Object.values(restockEdits).some(qty => qty > 0)}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                size="icon"
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Save restock"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">{isSaving ? 'Saving...' : 'Save Restock'}</span>
              </Button>
            </>
          ) : bulkMode === 'transfer' ? (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  From: {warehouses.find(w => w.id === transferFromWarehouseId)?.name || 'Unknown'} → To: {warehouses.find(w => w.id === transferToWarehouseId)?.name || 'Unknown'}
                </span>
                <button
                  onClick={() => setIsTransferSetupOpen(true)}
                  className="text-[#0E7A3A] hover:underline"
                >
                  Edit
                </button>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleExitBulkMode}
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Cancel transfer"
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Cancel</span>
              </Button>

              <Button
                onClick={handleSaveTransfer}
                disabled={isSaving || !transferFromWarehouseId || !transferToWarehouseId || transferFromWarehouseId === transferToWarehouseId || !Object.values(transferEdits).some(qty => qty > 0)}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                size="icon"
                className="h-9 w-9 sm:w-auto sm:px-3"
                title="Save transfer"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">{isSaving ? 'Saving...' : 'Transfer'}</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Bulk Action Mode Picker Dialog */}
      <Dialog open={isBulkModeDialogOpen} onOpenChange={setIsBulkModeDialogOpen}>
        <DialogContent className="w-[calc(100vw-24px)] sm:w-full max-w-[520px] max-h-[85vh] overflow-hidden p-0">
          <div className="flex flex-col max-h-[85vh]">
            <header className="px-5 pt-5 pb-3 shrink-0">
              <DialogHeader>
                <DialogTitle>Bulk Action</DialogTitle>
                <DialogDescription>
                  Choose the type of bulk action you want to perform.
                </DialogDescription>
              </DialogHeader>
            </header>
            
            <div className="px-5 pb-4 flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full text-left whitespace-normal break-words h-auto py-4"
                  onClick={() => {
                    handleEnterBulkEdit();
                    setIsBulkModeDialogOpen(false);
                  }}
                >
                  <div className="text-left w-full">
                    <div className="font-semibold">Correction</div>
                    <div className="text-sm text-muted-foreground leading-snug whitespace-normal break-words">Set absolute stock + optional price updates</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full text-left whitespace-normal break-words h-auto py-4"
                  onClick={handleEnterRestock}
                >
                  <div className="text-left w-full">
                    <div className="font-semibold">Restock</div>
                    <div className="text-sm text-muted-foreground leading-snug whitespace-normal break-words">Add quantities + movement reason restock</div>
                  </div>
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full text-left whitespace-normal break-words h-auto py-4"
                  onClick={handleEnterTransfer}
                >
                  <div className="text-left w-full">
                    <div className="font-semibold">Transfer</div>
                    <div className="text-sm text-muted-foreground leading-snug whitespace-normal break-words">Move quantities between warehouses + movement reason transfer</div>
                  </div>
                </Button>
              </div>
            </div>
            
            <footer className="px-5 pb-6 sm:pb-5 pt-3 shrink-0">
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsBulkModeDialogOpen(false)}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </DialogFooter>
            </footer>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Setup Dialog */}
      <Dialog open={isTransferSetupOpen} onOpenChange={setIsTransferSetupOpen}>
        <DialogContent className="w-[calc(100vw-24px)] sm:w-full max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Transfer Stock</DialogTitle>
            <DialogDescription>
              Select the source and destination warehouses for the transfer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-from">From warehouse *</Label>
              <Select
                value={transferFromWarehouseId}
                onValueChange={setTransferFromWarehouseId}
              >
                <SelectTrigger id="transfer-from">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(wh => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="transfer-to">To warehouse *</Label>
              <Select
                value={transferToWarehouseId}
                onValueChange={setTransferToWarehouseId}
              >
                <SelectTrigger id="transfer-to">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(wh => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="transfer-note">Reference (optional)</Label>
              <Input
                id="transfer-note"
                placeholder="e.g. Event Booth"
                value={transferReferenceNote}
                onChange={(e) => setTransferReferenceNote(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsTransferSetupOpen(false);
                // Only exit transfer mode if we're not already in transfer mode (i.e., initial setup)
                if (bulkMode !== 'transfer') {
                  setBulkMode('none');
                }
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmTransferSetup}
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              disabled={!transferFromWarehouseId || !transferToWarehouseId || transferFromWarehouseId === transferToWarehouseId}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Product Settings</DialogTitle>
            <DialogDescription>
              Manage product display defaults and configuration options.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Management Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Management</h3>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/app/settings');
                    setSettingsOpen(false);
                    toast({
                      title: 'Warehouse Management',
                      description: 'Warehouse management is coming soon.',
                    });
                  }}
                >
                  Manage Warehouses
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/app/settings/catalog');
                    setSettingsOpen(false);
                  }}
                >
                  Manage Categories
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    navigate('/app/settings/catalog');
                    setSettingsOpen(false);
                  }}
                >
                  Variant Configuration (rank1 / rank2)
                </Button>
              </div>
            </div>

            {/* Defaults Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Product Display Defaults</h3>
              
              {/* Default View */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Default view</Label>
                <RadioGroup
                  value={defaultView}
                  onValueChange={(value) => setDefaultView(value as 'list' | 'group')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="list" id="view-list" />
                    <Label htmlFor="view-list" className="font-normal cursor-pointer">List</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="group" id="view-group" />
                    <Label htmlFor="view-group" className="font-normal cursor-pointer">Group</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Default Expand Behavior */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Default expand behavior</Label>
                <RadioGroup
                  value={defaultExpand}
                  onValueChange={(value) => setDefaultExpand(value as 'collapsed' | 'expanded')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="collapsed" id="expand-collapsed" />
                    <Label htmlFor="expand-collapsed" className="font-normal cursor-pointer">Collapsed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="expanded" id="expand-expanded" />
                    <Label htmlFor="expand-expanded" className="font-normal cursor-pointer">Expanded</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (currentOrg?.id) {
                  localStorage.setItem(`gb:${currentOrg.id}:products_default_view`, defaultView);
                  localStorage.setItem(`gb:${currentOrg.id}:products_default_expand`, defaultExpand);
                  
                  // Apply expand behavior immediately
                  if (defaultExpand === 'expanded' && products.length > 0) {
                    const allProductIds = new Set(products.map(p => p.id));
                    setExpandedProducts(allProductIds);
                  } else if (defaultExpand === 'collapsed') {
                    setExpandedProducts(new Set());
                    setExpandedRank1Groups(new Set());
                  }
                  
                  toast({
                    title: 'Settings saved',
                    description: 'Product display defaults have been updated.',
                  });
                }
                setSettingsOpen(false);
              }}
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restock Note Input (shown above product list when in restock mode) */}
      {bulkMode === 'restock' && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Reference note (optional)"
            value={restockReferenceNote}
            onChange={(e) => setRestockReferenceNote(e.target.value)}
            className="h-9 max-w-md"
          />
        </div>
      )}

      {/* Content */}
      <div className={isEmbeddedInCatalog ? "mt-0" : "mt-4 space-y-4"}>
        <ProductsContent
          products={filteredProducts}
          categories={categories}
          categoryCounts={categoryCounts}
          selectedPillar={selectedPillar}
          setSelectedPillar={setSelectedPillar}
          warehouses={warehouses}
          selectedWarehouseId={selectedWarehouseId}
          setSelectedWarehouseId={setSelectedWarehouseId}
          expandedProducts={expandedProducts}
          expandedRank1Groups={expandedRank1Groups}
          toggleProduct={toggleProduct}
          toggleRank1Group={toggleRank1Group}
          expandAllVariants={expandAllVariants}
          getProductQuantity={getProductQuantity}
          getVariantQuantity={getVariantQuantity}
          rank1={rank1}
          rank2={rank2}
          navigate={navigate}
          bulkMode={bulkMode}
          isBulkEdit={isBulkEdit}
          pendingEdits={pendingEdits}
          setPendingEdits={setPendingEdits}
          getCurrentStock={getCurrentStock}
          getCurrentPrice={getCurrentPrice}
          restockEdits={restockEdits}
          setRestockEdits={setRestockEdits}
          restockReferenceNote={restockReferenceNote}
          setRestockReferenceNote={setRestockReferenceNote}
          transferEdits={transferEdits}
          setTransferEdits={setTransferEdits}
          transferFromWarehouseId={transferFromWarehouseId}
          transferToWarehouseId={transferToWarehouseId}
        />
      </div>
    </div>
  );
}

// Restock Panel Component
interface RestockPanelProps {
  products: ProductWithDetails[];
  warehouses: Warehouse[];
  restockWarehouseId: string;
  setRestockWarehouseId: (id: string) => void;
  restockReferenceNote: string;
  setRestockReferenceNote: (note: string) => void;
  restockEdits: Record<string, number>;
  setRestockEdits: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  getQty: (variantId: string, warehouseId: string) => number;
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
  rank1: string;
  rank2: string;
}

function RestockPanel({
  products,
  warehouses,
  restockWarehouseId,
  setRestockWarehouseId,
  restockReferenceNote,
  setRestockReferenceNote,
  restockEdits,
  setRestockEdits,
  getQty,
  onBack,
  onSave,
  isSaving,
  rank1,
  rank2,
}: RestockPanelProps) {
  // Helper function to format variant name by removing option type labels
  const formatVariantName = (variantName: string): string => {
    return variantName
      .split('/')
      .map(segment => {
        const colonIndex = segment.indexOf(':');
        if (colonIndex === -1) {
          return segment.trim();
        }
        return segment.substring(colonIndex + 1).trim();
      })
      .join(' / ');
  };
  
  // Get all variants from filtered products (flat list)
  const allVariants = useMemo(() => {
    return products.flatMap(p => p.variants);
  }, [products]);
  
  const hasEdits = Object.values(restockEdits).some(qty => qty > 0);
  
  return (
    <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} disabled={isSaving}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle>Restock</CardTitle>
          </div>
          <Button
            onClick={onSave}
            disabled={isSaving || !hasEdits}
            style={{ backgroundColor: '#0E7A3A', color: 'white' }}
          >
            {isSaving ? 'Saving...' : 'Save Restock'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Warehouse</Label>
            <Select value={restockWarehouseId} onValueChange={setRestockWarehouseId} disabled={isSaving}>
              <SelectTrigger>
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(wh => (
                  <SelectItem key={wh.id} value={wh.id}>
                    {wh.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input
              placeholder="e.g. supplier invoice #123"
              value={restockReferenceNote}
              onChange={(e) => setRestockReferenceNote(e.target.value)}
              disabled={isSaving}
            />
          </div>
        </div>
        
        {/* Variants Table */}
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-2 text-left text-sm font-medium">Variant</th>
                <th className="p-2 text-left text-sm font-medium">SKU</th>
                <th className="p-2 text-right text-sm font-medium">Current</th>
                <th className="p-2 text-right text-sm font-medium">Restock Qty (+)</th>
                <th className="p-2 text-right text-sm font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {allVariants.map((variant) => {
                const current = getQty(variant.id, restockWarehouseId);
                const restockQty = restockEdits[variant.id] || 0;
                const after = current + restockQty;
                
                return (
                  <tr key={variant.id} className="border-b hover:bg-muted/30">
                    <td className="p-2 text-sm">{formatVariantName(variant.name)}</td>
                    <td className="p-2 text-sm text-muted-foreground">{variant.sku || '-'}</td>
                    <td className="p-2 text-sm text-right">{current}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        value={restockQty || ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
                          setRestockEdits(prev => ({
                            ...prev,
                            [variant.id]: value,
                          }));
                        }}
                        disabled={isSaving}
                        className="w-24 text-right"
                      />
                    </td>
                    <td className="p-2 text-sm text-right font-medium">{after}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Products content component (shared between tabs)
interface ProductsContentProps {
  products: ProductWithDetails[];
  categories: ProductCategory[];
  categoryCounts: Map<string, number>;
  selectedPillar: 'catalog' | 'inventory';
  setSelectedPillar: (pillar: 'catalog' | 'inventory') => void;
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  setSelectedWarehouseId: (id: string) => void;
  expandedProducts: Set<string>;
  expandedRank1Groups: Set<string>;
  toggleProduct: (id: string) => void;
  toggleRank1Group: (key: string) => void;
  expandAllVariants: (productId: string, variants: any[]) => void;
  getProductQuantity: (product: ProductWithDetails) => number;
  getVariantQuantity: (variantId: string, inventoryItems: InventoryItem[]) => number;
  rank1: string;
  rank2: string;
  navigate: (path: string) => void;
  bulkMode: 'none' | 'correction' | 'restock' | 'transfer';
  isBulkEdit: boolean;
  pendingEdits: Record<string, { stock?: number; price?: number }>;
  setPendingEdits: React.Dispatch<React.SetStateAction<Record<string, { stock?: number; price?: number }>>>;
  getCurrentStock: (variantId: string, warehouseId: string) => number;
  getCurrentPrice: (variantId: string) => number;
  restockEdits: Record<string, number>;
  setRestockEdits: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  restockReferenceNote: string;
  setRestockReferenceNote: (note: string) => void;
  transferEdits: Record<string, number>;
  setTransferEdits: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  transferFromWarehouseId: string;
  transferToWarehouseId: string;
}

function ProductsContent({
  products,
  categories,
  categoryCounts,
  selectedPillar,
  setSelectedPillar,
  warehouses,
  selectedWarehouseId,
  setSelectedWarehouseId,
  expandedProducts,
  expandedRank1Groups,
  toggleProduct,
  toggleRank1Group,
  expandAllVariants,
  getProductQuantity,
  getVariantQuantity,
  rank1,
  rank2,
  navigate,
  bulkMode,
  isBulkEdit,
  pendingEdits,
  setPendingEdits,
  getCurrentStock,
  getCurrentPrice,
  restockEdits,
  setRestockEdits,
  restockReferenceNote,
  setRestockReferenceNote,
  transferEdits,
  setTransferEdits,
  transferFromWarehouseId,
  transferToWarehouseId,
}: ProductsContentProps) {
  const { currentOrg } = useAuth();

  // If inventory pillar is selected, render InventoryPanel
  if (selectedPillar === 'inventory') {
    return (
      <div className="space-y-4 md:space-y-6">
        {currentOrg?.id ? (
          <InventoryPanel orgId={currentOrg.id} />
        ) : (
          <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardContent className="flex flex-col items-center justify-center py-12 p-4 md:p-6">
              <p className="text-muted-foreground">No organization selected</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Catalog pillar - render existing catalog view
  return (
    <>
      {products.length === 0 ? (
        <div className="text-center py-8 sm:py-12 px-4">
          <p className="text-sm sm:text-base text-muted-foreground mb-4">No products in this category</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {products.map((product) => {
            const isExpanded = expandedProducts.has(product.id);
            const totalQty = getProductQuantity(product);
            const minPrice = product.variants.length > 0 
              ? Math.min(...product.variants.map(v => v.price || 0).filter(p => p > 0))
              : product.base_price || 0;

            return (
              <div key={product.id} className="border rounded-lg overflow-hidden" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                {/* Product Header */}
                <div className="p-2.5 sm:p-3 md:p-4 bg-white">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <button
                      onClick={() => toggleProduct(product.id)}
                      className="flex items-start gap-1.5 sm:gap-2 flex-1 text-left min-w-0"
                    >
                      {product.variants.length > 1 ? (
                        isExpanded ? (
                          <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" style={{ color: '#0E7A3A' }} />
                        ) : (
                          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" style={{ color: '#0E7A3A' }} />
                        )
                      ) : (
                        <div className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold truncate" style={{ color: '#0F1F17' }}>
                          {product.title}
                        </h3>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                      <div className="text-right">
                        {/* Catalog pillar - show price */}
                        <>
                          <div className="text-sm sm:text-base font-semibold whitespace-nowrap" style={{ color: '#0F1F17' }}>
                            HK${minPrice.toFixed(2)}
                          </div>
                          {product.variants.length > 1 && (
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {product.variants.length} variants
                            </div>
                          )}
                        </>
                      </div>
                      <div className="flex gap-0.5 sm:gap-1">
                        {!isExpanded && product.variants.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              expandAllVariants(product.id, product.variants);
                            }}
                            title="Expand all variants"
                            className="h-8 w-8 p-0"
                          >
                            <ChevronsDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/app/products/${product.id}/edit`)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Variants */}
                {isExpanded && product.variants.length > 0 && (
                  <div className="border-t px-2.5 sm:px-3 md:px-8 py-2" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.3)' }}>
                    <VariantCombinationsTable
                      variants={product.variants}
                      inventoryItems={product.inventoryItems}
                      getVariantQuantity={getVariantQuantity}
                      basePrice={product.base_price}
                      bulkMode={bulkMode}
                      isBulkEdit={isBulkEdit}
                      selectedWarehouseId={selectedWarehouseId}
                      pendingEdits={pendingEdits}
                      setPendingEdits={setPendingEdits}
                      getCurrentStock={getCurrentStock}
                      getCurrentPrice={getCurrentPrice}
                      restockEdits={restockEdits}
                      setRestockEdits={setRestockEdits}
                      transferEdits={transferEdits}
                      setTransferEdits={setTransferEdits}
                      transferFromWarehouseId={transferFromWarehouseId}
                      transferToWarehouseId={transferToWarehouseId}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// Component for rendering Excel-style variant combinations table (read-only or editable)
interface VariantCombinationsTableProps {
  variants: ProductVariant[];
  inventoryItems: InventoryItem[];
  getVariantQuantity: (variantId: string, inventoryItems: InventoryItem[]) => number;
  basePrice: number | null;
  bulkMode?: 'none' | 'correction' | 'restock' | 'transfer';
  isBulkEdit?: boolean;
  selectedWarehouseId?: string;
  pendingEdits?: Record<string, { stock?: number; price?: number }>;
  setPendingEdits?: React.Dispatch<React.SetStateAction<Record<string, { stock?: number; price?: number }>>>;
  getCurrentStock?: (variantId: string, warehouseId: string) => number;
  getCurrentPrice?: (variantId: string) => number;
  restockEdits?: Record<string, number>;
  setRestockEdits?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  transferEdits?: Record<string, number>;
  setTransferEdits?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  transferFromWarehouseId?: string;
  transferToWarehouseId?: string;
}

function VariantCombinationsTable({
  variants,
  inventoryItems,
  getVariantQuantity,
  basePrice,
  bulkMode = 'none',
  isBulkEdit = false,
  selectedWarehouseId = '',
  pendingEdits = {},
  setPendingEdits,
  getCurrentStock,
  getCurrentPrice,
  restockEdits = {},
  setRestockEdits,
  transferEdits = {},
  setTransferEdits,
  transferFromWarehouseId = '',
  transferToWarehouseId = '',
}: VariantCombinationsTableProps) {
  // Helper function to format variant name by removing option type labels
  const formatVariantName = (variantName: string): string => {
    return variantName
      .split('/')
      .map(segment => {
        const colonIndex = segment.indexOf(':');
        if (colonIndex === -1) {
          return segment.trim();
        }
        return segment.substring(colonIndex + 1).trim();
      })
      .join(' / ');
  };

  if (variants.length === 0) {
    return (
      <div className="py-2 text-sm text-muted-foreground">
        No variants available
      </div>
    );
  }

  const isRestockMode = bulkMode === 'restock';
  const isTransferMode = bulkMode === 'transfer';
  const isCorrectionMode = bulkMode === 'correction' || isBulkEdit;

  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="bg-muted/50 border-t">
            <th className="sticky top-0 z-10 bg-muted/50 p-0 border text-[11px] w-[88px]">Variant</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[48px]">Stock</th>
            {isRestockMode && (
              <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[56px]">Restock</th>
            )}
            {isTransferMode && (
              <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[56px]">Transfer</th>
            )}
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-left text-muted-foreground w-[56px]">Price</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 border text-[11px] w-[96px]">SKU</th>
            <th className="sticky top-0 z-10 bg-muted/50 p-0 text-[11px] font-medium border text-center text-muted-foreground w-[40px]">Active</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => {
            const stockKey = `${variant.id}:${selectedWarehouseId}`;
            const priceKey = `${variant.id}`;
            
            // Get display values - use pending edits if available, otherwise current values
            const stock = isBulkEdit && pendingEdits[stockKey]?.stock !== undefined
              ? pendingEdits[stockKey].stock!
              : getVariantQuantity(variant.id, inventoryItems);
            
            const price = isBulkEdit && pendingEdits[priceKey]?.price !== undefined
              ? pendingEdits[priceKey].price!
              : (variant.price ?? basePrice ?? 0);
            
            const handleStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!setPendingEdits || !selectedWarehouseId) return;
              
              const inputValue = e.target.value;
              // Allow empty string while typing, convert to 0 for storage
              if (inputValue === '') {
                setPendingEdits(prev => ({
                  ...prev,
                  [stockKey]: {
                    ...prev[stockKey],
                    stock: 0,
                  },
                }));
              } else {
                const value = parseFloat(inputValue);
                const numValue = isNaN(value) ? 0 : Math.max(0, value);
                setPendingEdits(prev => ({
                  ...prev,
                  [stockKey]: {
                    ...prev[stockKey],
                    stock: numValue,
                  },
                }));
              }
            };

            const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!setPendingEdits) return;
              
              const inputValue = e.target.value;
              // Allow empty string while typing, convert to 0 for storage
              if (inputValue === '') {
                setPendingEdits(prev => ({
                  ...prev,
                  [priceKey]: {
                    ...prev[priceKey],
                    price: 0,
                  },
                }));
              } else {
                const value = parseFloat(inputValue);
                const numValue = isNaN(value) ? 0 : Math.max(0, value);
                setPendingEdits(prev => ({
                  ...prev,
                  [priceKey]: {
                    ...prev[priceKey],
                    price: numValue,
                  },
                }));
              }
            };

            const handleRestockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!setRestockEdits) return;
              
              const inputValue = e.target.value;
              // Allow empty string while typing, convert to 0 for storage
              if (inputValue === '') {
                setRestockEdits(prev => ({
                  ...prev,
                  [variant.id]: 0,
                }));
              } else {
                const value = parseFloat(inputValue);
                const numValue = isNaN(value) ? 0 : Math.max(0, value);
                setRestockEdits(prev => ({
                  ...prev,
                  [variant.id]: numValue,
                }));
              }
            };
            
            const handleTransferChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!setTransferEdits || !transferFromWarehouseId || !getCurrentStock) return;
              
              const inputValue = e.target.value;
              const fromStock = getCurrentStock(variant.id, transferFromWarehouseId);
              
              // Allow empty string while typing, convert to 0 for storage
              if (inputValue === '') {
                setTransferEdits(prev => ({
                  ...prev,
                  [variant.id]: 0,
                }));
              } else {
                const value = parseFloat(inputValue);
                const numValue = isNaN(value) ? 0 : Math.max(0, Math.min(value, fromStock)); // Clamp to max available
                setTransferEdits(prev => ({
                  ...prev,
                  [variant.id]: numValue,
                }));
              }
            };
            
            return (
              <tr key={variant.id} className="border-t hover:bg-muted/30 even:bg-muted/10">
                <td className="p-0 border w-[88px]">
                  <span className="block px-1 py-0 text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {formatVariantName(variant.name)}
                  </span>
                </td>
                <td className="p-0 border w-[48px]">
                  {isCorrectionMode && selectedWarehouseId ? (
                    <Input
                      type="number"
                      min="0"
                      value={pendingEdits[stockKey]?.stock !== undefined ? pendingEdits[stockKey].stock! : stock}
                      onChange={handleStockChange}
                      className="h-6 px-1 py-0 text-xs border-0 rounded-none focus-visible:ring-1 focus-visible:ring-offset-0"
                      style={{ fontSize: '11px' }}
                    />
                  ) : (
                    <span className="block px-1 py-0 text-xs leading-tight">
                      {stock}
                    </span>
                  )}
                </td>
                {isRestockMode && (
                  <td className="p-0 border w-[56px]">
                    <Input
                      type="number"
                      min="0"
                      value={restockEdits[variant.id] !== undefined && restockEdits[variant.id] !== 0 ? restockEdits[variant.id] : ''}
                      onChange={handleRestockChange}
                      placeholder="0"
                      className="h-6 px-1 py-0 text-xs border-0 rounded-none focus-visible:ring-1 focus-visible:ring-offset-0"
                      style={{ fontSize: '11px' }}
                    />
                  </td>
                )}
                {isTransferMode && (
                  <td className="p-0 border w-[56px]">
                    <Input
                      type="number"
                      min="0"
                      max={transferFromWarehouseId && getCurrentStock ? getCurrentStock(variant.id, transferFromWarehouseId) : undefined}
                      value={transferEdits[variant.id] !== undefined && transferEdits[variant.id] !== 0 ? transferEdits[variant.id] : ''}
                      onChange={handleTransferChange}
                      placeholder="0"
                      className="h-6 px-1 py-0 text-xs border-0 rounded-none focus-visible:ring-1 focus-visible:ring-offset-0"
                      style={{ fontSize: '11px' }}
                    />
                  </td>
                )}
                <td className="p-0 border w-[56px]">
                  {isCorrectionMode && !isTransferMode ? (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pendingEdits[priceKey]?.price !== undefined ? pendingEdits[priceKey].price! : price}
                      onChange={handlePriceChange}
                      className="h-6 px-1 py-0 text-xs border-0 rounded-none focus-visible:ring-1 focus-visible:ring-offset-0"
                      style={{ fontSize: '11px' }}
                    />
                  ) : (
                    <span className="block px-1 py-0 text-xs leading-tight">
                      {price.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="p-0 border w-[96px]">
                  <span className="block px-1 py-0 text-xs leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {variant.sku || '-'}
                  </span>
                </td>
                <td className="p-0 border w-[40px]">
                  <div className="flex items-center justify-center py-0.5">
                    {variant.active ? (
                      <Badge variant="default" className="text-[10px] px-1 py-0 h-4">On</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Off</Badge>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
