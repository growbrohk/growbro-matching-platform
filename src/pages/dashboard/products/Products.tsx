import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, ShoppingCart } from 'lucide-react';
import { getCategories, type ProductCategory } from '@/lib/api/categories-and-tags';
import { getProducts } from '@/lib/api/products';
import { getVariantConfig } from '@/lib/api/variant-config';
import { getVariantOptionValue } from '@/lib/utils/variant-parser';
import type { Product } from '@/lib/types';
import { ProductsToolbar } from '@/components/catalog/ProductsToolbar';
import { BulkDialogs } from '@/components/catalog/BulkDialogs';
import { ProductsContent } from '@/components/catalog/ProductsContent';
import { Cart, type CartItem } from '@/components/pos/Cart';
import { PosProductGrid } from '@/components/pos/PosProductGrid';
import { PosProductDetailSheet } from '@/components/pos/PosProductDetailSheet';

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

export interface ProductWithDetails extends Product {
  variants: ProductVariant[];
  inventoryItems: InventoryItem[];
}

export type { ProductVariant, InventoryItem, Warehouse };

interface ProductsProps {
  // Products is a sub-view under Catalog.
  // Do not render standalone page headers or subtab tabs when embedded.
  isEmbeddedInCatalog?: boolean;
  selectedSubtab?: 'catalog' | 'pos' | 'orders';
  onChangeSubtab?: (subtab: 'catalog' | 'pos' | 'orders') => void;
}

export default function Products({ isEmbeddedInCatalog = false, selectedSubtab: propSelectedSubtab, onChangeSubtab: propOnChangeSubtab }: ProductsProps = {}) {
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
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([]);
  const [localSelectedSubtab, setLocalSelectedSubtab] = useState<'catalog' | 'pos' | 'orders'>('catalog');
  const [filterOpen, setFilterOpen] = useState(false);
  
  // Variant option filters
  const [selectedRank1Values, setSelectedRank1Values] = useState<string[]>([]);
  const [selectedRank2Values, setSelectedRank2Values] = useState<string[]>([]);

  // Use prop subtab when embedded, otherwise use local state
  const selectedSubtab = isEmbeddedInCatalog ? (propSelectedSubtab ?? 'catalog') : localSelectedSubtab;
  const setSelectedSubtab = isEmbeddedInCatalog && propOnChangeSubtab ? propOnChangeSubtab : setLocalSelectedSubtab;
  
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
  
  // Edit-state CTA visibility
  const [showEditCta, setShowEditCta] = useState(false);
  
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

  // POS cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [posDetailOpen, setPosDetailOpen] = useState(false);
  const [posProductId, setPosProductId] = useState<string | null>(null);

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
  // This uses products filtered by physical+addon/category/search/product-type (catalog includes add-on products)
  const productsBeforeVariantFilters = useMemo(() => {
    let filtered = products.filter(p => p.type === 'physical' || p.type === 'addon');

    // Filter by product type (physical, addon)
    if (selectedProductTypes.length > 0) {
      filtered = filtered.filter(p => selectedProductTypes.includes(p.type));
    }

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
  }, [products, selectedCategoryIds, selectedProductTypes, searchQuery]);

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

  // Filter products by selected category, search query, and variant options (physical + addon)
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

  // Auto-hide CTA after 4 seconds
  useEffect(() => {
    if (!isBulkEdit || !showEditCta) return;
    const t = setTimeout(() => setShowEditCta(false), 4000);
    return () => clearTimeout(t);
  }, [isBulkEdit, showEditCta]);

  // Auto-expand all products when entering bulk mode
  // Derive once - includes correction mode
  const isInBulkMode = isBulkEdit || bulkMode === 'restock' || bulkMode === 'transfer' || bulkMode === 'correction';
  
  useEffect(() => {
    if (!isInBulkMode) return;
    // IMPORTANT: use the currently rendered list (filteredProducts) but guard for empty
    if (!Array.isArray(filteredProducts) || filteredProducts.length === 0) return;

    // Expand all products (rows) - pure computation, no function calls
    setExpandedProducts(new Set(filteredProducts.map(p => p.id)));

    // Also expand all rank1 groups so variant tables are visible without extra clicks
    const nextGroups = new Set<string>();
    filteredProducts.forEach(p => {
      const rank1Values = new Set<string>();
      (p.variants || []).forEach(v => {
        const val = getVariantOptionValue(v.name, rank1);
        if (val) rank1Values.add(val);
      });
      rank1Values.forEach(val => {
        nextGroups.add(`${p.id}:${val}`);
      });
    });
    setExpandedRank1Groups(nextGroups);
  }, [isInBulkMode, filteredProducts, rank1]);


  // Product type options with counts (for filter dropdown)
  const productTypeOptions = useMemo(() => {
    const relevantProducts = products.filter(p => p.type === 'physical' || p.type === 'addon');
    const physicalCount = relevantProducts.filter(p => p.type === 'physical').length;
    const addonCount = relevantProducts.filter(p => p.type === 'addon').length;
    return [
      { id: 'physical', name: 'Physical Product', count: physicalCount },
      { id: 'addon', name: 'Add-on Only', count: addonCount },
    ];
  }, [products]);

  // Category counts (physical + addon products)
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    
    // Count physical and addon products (catalog includes both)
    const relevantProducts = products.filter(p => p.type === 'physical' || p.type === 'addon');
    
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
    setShowEditCta(true);
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
    setShowEditCta(false);
  };

  // Exit bulk edit mode
  const handleCancelBulkEdit = () => {
    setIsBulkEdit(false);
    setPendingEdits({});
    originalValuesRef.current = {};
    setShowEditCta(false);
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
      setShowEditCta(false);
      
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

  const handlePosAddToCart = (item: CartItem) => {
    if (!selectedWarehouseId) {
      toast({
        title: 'Warehouse Required',
        description: 'Please select a warehouse in Settings',
        variant: 'destructive',
      });
      return;
    }

    const addQty = item.qty || 1;
    const variantId = item.variantId || item.productId;
    const inventoryItem = products
      .flatMap((p) => p.inventoryItems)
      .find((i) => i.variant_id === variantId && i.warehouse_id === selectedWarehouseId);

    const availableStock = inventoryItem?.quantity ?? 0;
    const existingCartItem = cart.find(
      (i) => i.productId === item.productId && i.variantId === item.variantId,
    );
    const currentCartQty = existingCartItem?.qty ?? 0;
    const newQty = currentCartQty + addQty;

    if (availableStock === 0) {
      toast({
        title: 'Out of Stock',
        description: `${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} is out of stock in the selected warehouse`,
        variant: 'destructive',
      });
      return;
    }

    if (newQty > availableStock) {
      toast({
        title: 'Insufficient Stock',
        description: `Only ${availableStock} left in this warehouse`,
        variant: 'destructive',
      });
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (i) => i.productId === item.productId && i.variantId === item.variantId,
      );
      if (existingIndex >= 0) {
        const newCart = [...prev];
        newCart[existingIndex] = {
          ...newCart[existingIndex],
          qty: newCart[existingIndex].qty + addQty,
          imageUrl: item.imageUrl ?? newCart[existingIndex].imageUrl,
          weightKgPerUnit: item.weightKgPerUnit ?? newCart[existingIndex].weightKgPerUnit,
        };
        return newCart;
      }
      return [...prev, { ...item, qty: addQty }];
    });
  };

  const posSelectedProduct = posProductId
    ? filteredProducts.find((p) => p.id === posProductId) ?? null
    : null;

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
      <ProductsToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterOpen={filterOpen}
        setFilterOpen={setFilterOpen}
        warehouses={warehouses}
        selectedWarehouseId={selectedWarehouseId}
        setSelectedWarehouseId={setSelectedWarehouseId}
        categoryOptions={categoryOptions}
        selectedCategoryIds={selectedCategoryIds}
        setSelectedCategoryIds={setSelectedCategoryIds}
        productTypeOptions={productTypeOptions}
        selectedProductTypes={selectedProductTypes}
        setSelectedProductTypes={setSelectedProductTypes}
        rank1={rank1}
        rank1Options={rank1Options}
        selectedRank1Values={selectedRank1Values}
        setSelectedRank1Values={setSelectedRank1Values}
        rank2={rank2}
        rank2Options={rank2Options}
        selectedRank2Values={selectedRank2Values}
        setSelectedRank2Values={setSelectedRank2Values}
        bulkMode={bulkMode}
        isBulkEdit={isBulkEdit}
        isSaving={isSaving}
        pendingEdits={pendingEdits}
        restockEdits={restockEdits}
        transferEdits={transferEdits}
        transferFromWarehouseId={transferFromWarehouseId}
        transferToWarehouseId={transferToWarehouseId}
        canCreate={canCreate}
        showEditCta={showEditCta}
        setShowEditCta={setShowEditCta}
        onSettingsClick={() => setSettingsOpen(true)}
        onBulkModePickerClick={handleOpenBulkModePicker}
        onAddProductClick={() => navigate('/app/products/new')}
        onExitBulkMode={handleExitBulkMode}
        onSaveBulkEdit={handleSaveBulkEdit}
        onSaveRestock={handleSaveRestock}
        onSaveTransfer={handleSaveTransfer}
        onTransferSetupClick={() => setIsTransferSetupOpen(true)}
        isPosMode={selectedSubtab === 'pos'}
        cartItemCount={selectedSubtab === 'pos' ? cart.reduce((sum, item) => sum + item.qty, 0) : 0}
        onCartClick={selectedSubtab === 'pos' ? () => setCartOpen(true) : undefined}
        isOrdersMode={selectedSubtab === 'orders'}
      />

      <BulkDialogs
        isBulkModeDialogOpen={isBulkModeDialogOpen}
        setIsBulkModeDialogOpen={setIsBulkModeDialogOpen}
        onEnterBulkEdit={handleEnterBulkEdit}
        onEnterRestock={handleEnterRestock}
        onEnterTransfer={handleEnterTransfer}
        isTransferSetupOpen={isTransferSetupOpen}
        setIsTransferSetupOpen={setIsTransferSetupOpen}
        warehouses={warehouses}
        transferFromWarehouseId={transferFromWarehouseId}
        setTransferFromWarehouseId={setTransferFromWarehouseId}
        transferToWarehouseId={transferToWarehouseId}
        setTransferToWarehouseId={setTransferToWarehouseId}
        transferReferenceNote={transferReferenceNote}
        setTransferReferenceNote={setTransferReferenceNote}
        bulkMode={bulkMode}
        setBulkMode={setBulkMode}
        onConfirmTransferSetup={handleConfirmTransferSetup}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        defaultView={defaultView}
        setDefaultView={setDefaultView}
        defaultExpand={defaultExpand}
        setDefaultExpand={setDefaultExpand}
        currentOrgId={currentOrg?.id}
        products={products}
        setExpandedProducts={setExpandedProducts}
        setExpandedRank1Groups={setExpandedRank1Groups}
        navigate={navigate}
      />

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
        {selectedSubtab === 'pos' ? (
          <>
            <PosProductGrid
              products={filteredProducts}
              onProductClick={(productId) => {
                setPosProductId(productId);
                setPosDetailOpen(true);
              }}
            />
            <PosProductDetailSheet
              open={posDetailOpen}
              onOpenChange={setPosDetailOpen}
              product={posSelectedProduct}
              orgId={currentOrg?.id ?? ''}
              orgName={currentOrg?.name ?? ''}
              onAddToCart={handlePosAddToCart}
            />
          </>
        ) : (
        <ProductsContent
          products={filteredProducts}
          categories={categories}
          categoryCounts={categoryCounts}
          selectedSubtab={selectedSubtab}
          setSelectedSubtab={setSelectedSubtab}
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
          onBeginEditing={() => setShowEditCta(false)}
        />
        )}
      </div>

      {/* Cart Modal */}
      {selectedSubtab === 'pos' && (
        <>
          <Cart
            open={cartOpen}
            onOpenChange={setCartOpen}
            cart={cart}
            onUpdateCart={setCart}
            activeWarehouseId={selectedWarehouseId || null}
            activeWarehouseName={warehouses.find(w => w.id === selectedWarehouseId)?.name || null}
          />
          
          {/* Floating Action Button for Cart */}
          {cart.reduce((sum, item) => sum + item.qty, 0) > 0 && (
            <button
              onClick={() => setCartOpen(true)}
              className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg flex items-center justify-center z-50"
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              title="Open cart"
            >
              <ShoppingCart className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#fff', color: '#0E7A3A' }}>
                {cart.reduce((sum, item) => sum + item.qty, 0)}
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Restock Panel Component (kept for backward compatibility if needed elsewhere)
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

