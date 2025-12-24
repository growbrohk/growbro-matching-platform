import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { getCategories, type ProductCategory } from '@/lib/api/categories-and-tags';

type Warehouse = { id: string; org_id: string; name: string; address: string | null };
type Product = { id: string; org_id: string; title: string; type: string; category_id?: string | null };
type Variant = { id: string; product_id: string; name: string; sku: string | null; price: number | null };
type InventoryItem = { id: string; org_id: string; warehouse_id: string; variant_id: string; quantity: number };

type EnrichedInventoryRow = InventoryItem & {
  warehouse?: Warehouse;
  product?: Product;
  variant?: Variant;
  category?: ProductCategory;
};

export default function Inventory() {
  const { currentOrg } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [inventory, setInventory] = useState<EnrichedInventoryRow[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createWarehouseId, setCreateWarehouseId] = useState<string>('');
  const [createSearchQuery, setCreateSearchQuery] = useState<string>('');
  const [createInitialStock, setCreateInitialStock] = useState<string>('0');
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  const [adjustOpenFor, setAdjustOpenFor] = useState<EnrichedInventoryRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>('0');
  const [adjustReason, setAdjustReason] = useState<string>('adjustment');
  const [adjustNote, setAdjustNote] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);
  const [bulkWarehouseId, setBulkWarehouseId] = useState<string>('');
  const [bulkDelta, setBulkDelta] = useState<string>('0');
  const [bulkReason, setBulkReason] = useState<string>('Restock');
  const [bulkNote, setBulkNote] = useState<string>('');

  // Bulk set stock state
  const [bulkSetOpen, setBulkSetOpen] = useState(false);
  const [bulkSetWarehouseId, setBulkSetWarehouseId] = useState<string>('');
  const [bulkSetQuantity, setBulkSetQuantity] = useState<string>('0');
  const [bulkSetReason, setBulkSetReason] = useState<string>('Correction');
  const [bulkSetNote, setBulkSetNote] = useState<string>('');

  // Filtering state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Filtered products/variants for the create modal
  const filteredProductsForCreate = useMemo(() => {
    if (!createSearchQuery.trim()) return products;
    const query = createSearchQuery.toLowerCase();
    return products.filter((p) => 
      p.title.toLowerCase().includes(query) ||
      variants.some((v) => 
        v.product_id === p.id && 
        (v.name.toLowerCase().includes(query) || v.sku?.toLowerCase().includes(query))
      )
    );
  }, [products, variants, createSearchQuery]);

  // Filtered inventory based on search, warehouse, and category filters
  const filteredInventory = useMemo(() => {
    let filtered = inventory;

    // Apply warehouse filter
    if (warehouseFilter !== 'all') {
      filtered = filtered.filter((row) => row.warehouse_id === warehouseFilter);
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'uncategorized') {
        filtered = filtered.filter((row) => !row.product?.category_id);
      } else {
        filtered = filtered.filter((row) => row.product?.category_id === categoryFilter);
      }
    }

    // Apply search filter (search in product title, variant name, sku, category name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((row) => {
        const productTitle = row.product?.title?.toLowerCase() || '';
        const variantName = row.variant?.name?.toLowerCase() || '';
        const sku = row.variant?.sku?.toLowerCase() || '';
        const categoryName = row.category?.name?.toLowerCase() || '';
        return productTitle.includes(query) || variantName.includes(query) || sku.includes(query) || categoryName.includes(query);
      });
    }

    return filtered;
  }, [inventory, warehouseFilter, categoryFilter, searchQuery]);

  // Group inventory by category → product → variant
  const groupedInventory = useMemo(() => {
    const groups = new Map<string, Map<string, EnrichedInventoryRow[]>>();
    
    filteredInventory.forEach((row) => {
      const categoryKey = row.category?.name || 'Uncategorized';
      const productKey = row.product?.id || 'unknown';
      
      if (!groups.has(categoryKey)) {
        groups.set(categoryKey, new Map());
      }
      
      const categoryGroup = groups.get(categoryKey)!;
      if (!categoryGroup.has(productKey)) {
        categoryGroup.set(productKey, []);
      }
      
      categoryGroup.get(productKey)!.push(row);
    });
    
    // Convert to sorted array
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        // "Uncategorized" goes last
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        return a.localeCompare(b);
      })
      .map(([categoryName, productMap]) => ({
        categoryName,
        products: Array.from(productMap.entries())
          .map(([productId, rows]) => ({
            productId,
            productTitle: rows[0]?.product?.title || 'Unknown Product',
            rows,
          }))
          .sort((a, b) => a.productTitle.localeCompare(b.productTitle)),
      }));
  }, [filteredInventory]);

  // Selection helpers
  const allVisibleSelected = filteredInventory.length > 0 && filteredInventory.every((row) => selectedIds.has(row.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      // Deselect all visible
      setSelectedIds(new Set());
    } else {
      // Select all visible
      setSelectedIds(new Set(filteredInventory.map((row) => row.id)));
    }
  };

  const toggleSelectRow = (rowId: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(rowId)) {
      newSet.delete(rowId);
    } else {
      newSet.add(rowId);
    }
    setSelectedIds(newSet);
  };

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [warehouseFilter, categoryFilter, searchQuery]);

  // Auto-select default warehouse when bulk adjust modal opens
  useEffect(() => {
    if (bulkAdjustOpen && !bulkWarehouseId && warehouses.length > 0) {
      // Prefer "Main Warehouse" or first warehouse
      const mainWarehouse = warehouses.find((w) => w.name.toLowerCase().includes('main'));
      const defaultWarehouse = mainWarehouse || warehouses[0];
      setBulkWarehouseId(defaultWarehouse.id);
    }
  }, [bulkAdjustOpen, bulkWarehouseId, warehouses]);

  // Auto-select default warehouse when bulk set modal opens
  useEffect(() => {
    if (bulkSetOpen && !bulkSetWarehouseId && warehouses.length > 0) {
      const mainWarehouse = warehouses.find((w) => w.name.toLowerCase().includes('main'));
      const defaultWarehouse = mainWarehouse || warehouses[0];
      setBulkSetWarehouseId(defaultWarehouse.id);
    }
  }, [bulkSetOpen, bulkSetWarehouseId, warehouses]);

  // Auto-select default warehouse when create modal opens
  useEffect(() => {
    if (createOpen && !createWarehouseId && warehouses.length > 0) {
      const mainWarehouse = warehouses.find((w) => w.name.toLowerCase().includes('main'));
      const defaultWarehouse = mainWarehouse || warehouses[0];
      setCreateWarehouseId(defaultWarehouse.id);
    }
  }, [createOpen, createWarehouseId, warehouses]);

  // Helpers for create modal variant selection
  const toggleVariantSelection = (variantId: string) => {
    const newSet = new Set(selectedVariantIds);
    if (newSet.has(variantId)) {
      newSet.delete(variantId);
    } else {
      newSet.add(variantId);
    }
    setSelectedVariantIds(newSet);
  };

  const toggleProductSelection = (productId: string) => {
    const productVariants = variants.filter((v) => v.product_id === productId);
    const variantIds = productVariants.map((v) => v.id);
    const allSelected = variantIds.every((id) => selectedVariantIds.has(id));

    const newSet = new Set(selectedVariantIds);
    if (allSelected) {
      // Deselect all variants of this product
      variantIds.forEach((id) => newSet.delete(id));
    } else {
      // Select all variants of this product
      variantIds.forEach((id) => newSet.add(id));
    }
    setSelectedVariantIds(newSet);
  };

  const isProductSelected = (productId: string) => {
    const productVariants = variants.filter((v) => v.product_id === productId);
    return productVariants.length > 0 && productVariants.every((v) => selectedVariantIds.has(v.id));
  };

  const isProductPartiallySelected = (productId: string) => {
    const productVariants = variants.filter((v) => v.product_id === productId);
    const selectedCount = productVariants.filter((v) => selectedVariantIds.has(v.id)).length;
    return selectedCount > 0 && selectedCount < productVariants.length;
  };

  const reload = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const { data: whData, error: whErr } = await (supabase as any)
        .from('warehouses')
        .select('id, org_id, name, address')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: true });
      if (whErr) throw whErr;

      const { data: productsData, error: productsErr } = await (supabase as any)
        .from('products')
        .select('id, org_id, title, type, category_id')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false });
      if (productsErr) throw productsErr;

      const productIds = ((productsData as any[]) || []).map((p) => p.id);

      const { data: variantsData, error: variantsErr } = await (supabase as any)
        .from('product_variants')
        .select('id, product_id, name, sku, price')
        .in('product_id', productIds.length > 0 ? productIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: true});
      if (variantsErr) throw variantsErr;

      const { data: invData, error: invErr } = await (supabase as any)
        .from('inventory_items')
        .select('id, org_id, warehouse_id, variant_id, quantity')
        .eq('org_id', currentOrg.id)
        .order('updated_at', { ascending: false });
      if (invErr) throw invErr;

      // Load categories
      const categoriesData = await getCategories(currentOrg.id);

      const wh = (whData as any as Warehouse[]) || [];
      const prods = (productsData as any as Product[]) || [];
      const vars = (variantsData as any as Variant[]) || [];
      const inv = (invData as any as InventoryItem[]) || [];

      const whMap = new Map(wh.map((w) => [w.id, w]));
      const prodMap = new Map(prods.map((p) => [p.id, p]));
      const varMap = new Map(vars.map((v) => [v.id, v]));
      const catMap = new Map(categoriesData.map((c) => [c.id, c]));

      const enriched: EnrichedInventoryRow[] = inv.map((row) => {
        const v = varMap.get(row.variant_id);
        const p = v ? prodMap.get(v.product_id) : undefined;
        const cat = p?.category_id ? catMap.get(p.category_id) : undefined;
        return {
          ...row,
          warehouse: whMap.get(row.warehouse_id),
          variant: v,
          product: p,
          category: cat,
        };
      });

      setWarehouses(wh);
      setProducts(prods);
      setVariants(vars);
      setInventory(enriched);
      setCategories(categoriesData);
      setError(null);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load inventory';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentOrg) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  // Bulk create inventory items for selected variants
  const createInventoryBulk = async () => {
    if (!currentOrg) return;
    if (!createWarehouseId) {
      toast({ title: 'Validation', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }
    if (selectedVariantIds.size === 0) {
      toast({ title: 'Validation', description: 'Please select at least one variant', variant: 'destructive' });
      return;
    }

    const qty = Number(createInitialStock);
    if (!Number.isFinite(qty) || qty < 0) {
      toast({ title: 'Validation', description: 'Initial stock must be a number >= 0', variant: 'destructive' });
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const variantId of selectedVariantIds) {
        try {
          // Check if inventory item already exists
          const { data: existingItem } = await (supabase as any)
            .from('inventory_items')
            .select('id, quantity')
            .eq('org_id', currentOrg.id)
            .eq('warehouse_id', createWarehouseId)
            .eq('variant_id', variantId)
            .maybeSingle();

          if (existingItem) {
            // Already exists, skip (MVP: don't overwrite)
            successCount++;
            continue;
          }

          // Create new inventory item with initial stock
          const { error: createErr } = await (supabase as any)
            .from('inventory_items')
            .insert({
              org_id: currentOrg.id,
              warehouse_id: createWarehouseId,
              variant_id: variantId,
              quantity: qty,
            });

          if (createErr) throw createErr;

          // If initial stock > 0, create movement record
          if (qty > 0) {
            // Get the created inventory item ID
            const { data: createdItem } = await (supabase as any)
              .from('inventory_items')
              .select('id')
              .eq('org_id', currentOrg.id)
              .eq('warehouse_id', createWarehouseId)
              .eq('variant_id', variantId)
              .single();

            if (createdItem) {
              await (supabase as any)
                .from('inventory_movements')
                .insert({
                  inventory_item_id: createdItem.id,
                  delta: qty,
                  reason: 'initial_stock',
                  note: 'Initial stock setup',
                  created_by: currentOrg.id, // Use user ID if available from auth
                });
            }
          }

          successCount++;
        } catch (err: any) {
          errorCount++;
          console.error('Error creating inventory for variant:', variantId, err);
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `Created inventory for ${successCount} variant${successCount > 1 ? 's' : ''}`,
        });
      }

      if (errorCount > 0) {
        toast({
          title: 'Warning',
          description: `${errorCount} item${errorCount > 1 ? 's' : ''} failed. Check console for details.`,
          variant: 'destructive',
        });
      }

      // Reset and close
      setCreateOpen(false);
      setSelectedVariantIds(new Set());
      setCreateWarehouseId('');
      setCreateSearchQuery('');
      setCreateInitialStock('0');
      await reload();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to create inventory', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const adjustStock = async () => {
    if (!adjustOpenFor) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta)) {
      toast({ title: 'Validation', description: 'Delta must be a number', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error: rpcErr } = await (supabase as any).rpc('adjust_stock', {
        p_inventory_item_id: adjustOpenFor.id,
        p_delta: delta,
        p_reason: adjustReason,
        p_note: adjustNote.trim() || null,
      });
      if (rpcErr) throw rpcErr;

      toast({ title: 'Success', description: 'Stock adjusted' });
      setAdjustOpenFor(null);
      setAdjustDelta('0');
      setAdjustReason('adjustment');
      setAdjustNote('');
      await reload();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to adjust stock', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Bulk stock adjustment
  const applyBulkAdjustment = async () => {
    if (!currentOrg || selectedIds.size === 0) return;
    if (!bulkWarehouseId) {
      toast({ title: 'Validation', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }

    const delta = Number(bulkDelta);
    if (!Number.isFinite(delta)) {
      toast({ title: 'Validation', description: 'Delta must be a number', variant: 'destructive' });
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      // Get all selected rows
      const selectedRows = inventory.filter((row) => selectedIds.has(row.id));

      for (const row of selectedRows) {
        try {
          // Step 1: Ensure inventory_item exists for this variant + warehouse combo
          // First check if an inventory item already exists for this variant + warehouse
          const { data: existingItems, error: fetchErr } = await (supabase as any)
            .from('inventory_items')
            .select('id, quantity')
            .eq('org_id', currentOrg.id)
            .eq('warehouse_id', bulkWarehouseId)
            .eq('variant_id', row.variant_id)
            .maybeSingle();

          if (fetchErr) {
            console.error('Error fetching inventory item:', fetchErr);
            throw fetchErr;
          }

          let inventoryItemId: string;

          if (existingItems) {
            // Item exists, use its ID
            inventoryItemId = existingItems.id;
          } else {
            // Step 2: Create new inventory_item with quantity 0
            const { data: newItem, error: insertErr } = await (supabase as any)
              .from('inventory_items')
              .insert({
                org_id: currentOrg.id,
                warehouse_id: bulkWarehouseId,
                variant_id: row.variant_id,
                quantity: 0,
              })
              .select('id')
              .single();

            if (insertErr) {
              console.error('Error creating inventory item:', insertErr);
              throw insertErr;
            }

            inventoryItemId = newItem.id;
          }

          // Step 3: Apply stock adjustment using RPC function
          const { error: rpcErr } = await (supabase as any).rpc('adjust_stock', {
            p_inventory_item_id: inventoryItemId,
            p_delta: delta,
            p_reason: bulkReason.toLowerCase().replace(' ', '_'),
            p_note: bulkNote.trim() || null,
          });

          if (rpcErr) throw rpcErr;

          successCount++;
        } catch (err: any) {
          errorCount++;
          const errMsg = err?.message || 'Unknown error';
          errors.push(`${row.product?.title} - ${row.variant?.name}: ${errMsg}`);
          console.error('Bulk adjust error for row:', row, err);
        }
      }

      // Show results
      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `Adjusted stock for ${successCount} item${successCount > 1 ? 's' : ''}`,
        });
      }

      if (errorCount > 0) {
        toast({
          title: 'Errors',
          description: `Failed to adjust ${errorCount} item${errorCount > 1 ? 's' : ''}. Check console for details.`,
          variant: 'destructive',
        });
      }

      // Reset and reload
      setBulkAdjustOpen(false);
      setSelectedIds(new Set());
      setBulkDelta('0');
      setBulkReason('Restock');
      setBulkNote('');
      await reload();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to apply bulk adjustment',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Bulk set stock (absolute quantity)
  const applyBulkSetStock = async () => {
    if (!currentOrg || selectedIds.size === 0) return;
    if (!bulkSetWarehouseId) {
      toast({ title: 'Validation', description: 'Please select a warehouse', variant: 'destructive' });
      return;
    }

    const newQty = Number(bulkSetQuantity);
    if (!Number.isFinite(newQty) || newQty < 0) {
      toast({ title: 'Validation', description: 'Quantity must be a number >= 0', variant: 'destructive' });
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // Get all selected rows
      const selectedRows = inventory.filter((row) => selectedIds.has(row.id));

      for (const row of selectedRows) {
        try {
          // Step 1: Ensure inventory_item exists for this variant + warehouse combo
          const { data: existingItems, error: fetchErr } = await (supabase as any)
            .from('inventory_items')
            .select('id, quantity')
            .eq('org_id', currentOrg.id)
            .eq('warehouse_id', bulkSetWarehouseId)
            .eq('variant_id', row.variant_id)
            .maybeSingle();

          if (fetchErr) {
            console.error('Error fetching inventory item:', fetchErr);
            throw fetchErr;
          }

          let inventoryItemId: string;
          let oldQty = 0;

          if (existingItems) {
            // Item exists, use its ID and old quantity
            inventoryItemId = existingItems.id;
            oldQty = existingItems.quantity;
          } else {
            // Step 2: Create new inventory_item with quantity 0
            const { data: newItem, error: insertErr } = await (supabase as any)
              .from('inventory_items')
              .insert({
                org_id: currentOrg.id,
                warehouse_id: bulkSetWarehouseId,
                variant_id: row.variant_id,
                quantity: 0,
              })
              .select('id')
              .single();

            if (insertErr) {
              console.error('Error creating inventory item:', insertErr);
              throw insertErr;
            }

            inventoryItemId = newItem.id;
            oldQty = 0;
          }

          // Step 3: Calculate delta and update quantity
          const delta = newQty - oldQty;

          // Update inventory_items quantity
          const { error: updateErr } = await (supabase as any)
            .from('inventory_items')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', inventoryItemId);

          if (updateErr) throw updateErr;

          // Step 4: Create inventory movement record
          const { error: movementErr } = await (supabase as any)
            .from('inventory_movements')
            .insert({
              inventory_item_id: inventoryItemId,
              delta: delta,
              reason: bulkSetReason.toLowerCase().replace(' ', '_'),
              note: bulkSetNote.trim() || `Set stock to ${newQty}`,
              created_by: currentOrg.id, // Use user ID if available from auth
            });

          if (movementErr) throw movementErr;

          successCount++;
        } catch (err: any) {
          errorCount++;
          const errMsg = err?.message || 'Unknown error';
          console.error('Bulk set stock error for row:', row, err);
        }
      }

      // Show results
      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `Set stock for ${successCount} item${successCount > 1 ? 's' : ''}`,
        });
      }

      if (errorCount > 0) {
        toast({
          title: 'Errors',
          description: `Failed to set stock for ${errorCount} item${errorCount > 1 ? 's' : ''}. Check console for details.`,
          variant: 'destructive',
        });
      }

      // Reset and reload
      setBulkSetOpen(false);
      setSelectedIds(new Set());
      setBulkSetQuantity('0');
      setBulkSetReason('Correction');
      setBulkSetNote('');
      await reload();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'Failed to set stock',
        variant: 'destructive',
      });
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

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Inventory
          </h1>
          <p className="mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Warehouses & stock for {currentOrg?.name || 'your org'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={reload} className="w-full sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: '#0E7A3A', color: 'white' }} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add Products to Warehouse
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] p-4 md:p-6">
              <DialogHeader className="space-y-4">
                <DialogTitle>Add Products to Warehouse</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Warehouse *</Label>
                  <Select value={createWarehouseId} onValueChange={setCreateWarehouseId}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Search Products</Label>
                  <Input
                    placeholder="Search by product, variant, or SKU..."
                    value={createSearchQuery}
                    onChange={(e) => setCreateSearchQuery(e.target.value)}
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Select Products & Variants</Label>
                  <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                    {filteredProductsForCreate.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        {products.length === 0 ? 'No products found. Create products first.' : 'No products match your search.'}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredProductsForCreate.map((product) => {
                          const productVariants = variants.filter((v) => v.product_id === product.id);
                          const isSelected = isProductSelected(product.id);
                          const isPartial = isProductPartiallySelected(product.id);
                          
                          return (
                            <div key={product.id} className="p-3">
                              {/* Product checkbox */}
                              <div className="flex items-center gap-2 mb-2">
                                <Checkbox
                                  checked={isSelected || (isPartial ? 'indeterminate' : false) as any}
                                  onCheckedChange={() => toggleProductSelection(product.id)}
                                  aria-label={`Select ${product.title}`}
                                />
                                <span className="font-medium">{product.title}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({productVariants.length} variant{productVariants.length > 1 ? 's' : ''})
                                </span>
                              </div>

                              {/* Variant checkboxes (indented) */}
                              <div className="ml-8 space-y-1.5">
                                {productVariants.map((variant) => (
                                  <div key={variant.id} className="flex items-center gap-2">
                                    <Checkbox
                                      checked={selectedVariantIds.has(variant.id)}
                                      onCheckedChange={() => toggleVariantSelection(variant.id)}
                                      aria-label={`Select ${variant.name}`}
                                    />
                                    <span className="text-sm">{variant.name}</span>
                                    {variant.sku && (
                                      <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                        {variant.sku}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedVariantIds.size} variant{selectedVariantIds.size !== 1 ? 's' : ''} selected
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Initial Stock (for all selected)</Label>
                  <Input
                    type="number"
                    value={createInitialStock}
                    onChange={(e) => setCreateInitialStock(e.target.value)}
                    placeholder="0"
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Set initial quantity for all selected variants. Existing items will be skipped.
                  </p>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button onClick={createInventoryBulk} disabled={saving || selectedVariantIds.size === 0} style={{ backgroundColor: '#0E7A3A', color: 'white' }} className="w-full sm:w-auto">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create for {selectedVariantIds.size} variant{selectedVariantIds.size !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle>Warehouses ({warehouses.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {warehouses.length === 0 ? (
            <p className="text-muted-foreground p-4 md:p-6">No warehouses found. (A default warehouse is created when the org is created.)</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-3 md:p-4">Name</TableHead>
                  <TableHead className="p-3 md:p-4">Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium p-3 md:p-4">{w.name}</TableCell>
                    <TableCell className="text-muted-foreground p-3 md:p-4">{w.address || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <CardHeader className="p-4 md:p-6">
          <CardTitle>Stock ({inventory.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Search by product, variant, SKU, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="w-full sm:w-48">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="All warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All warehouses</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredInventory.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              {inventory.length === 0
                ? 'No inventory yet. Use "Add Inventory" to set initial stock for a variant.'
                : 'No items match your filters.'}
            </p>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 p-2 md:p-3">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="p-2 md:p-3">Product / Variant</TableHead>
                    <TableHead className="p-2 md:p-3 hidden sm:table-cell">Warehouse</TableHead>
                    <TableHead className="text-right p-2 md:p-3">Quantity</TableHead>
                    <TableHead className="text-right p-2 md:p-3">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedInventory.map((categoryGroup) => (
                    <>
                      {/* Category header row */}
                      <TableRow key={`cat-${categoryGroup.categoryName}`} className="bg-muted/30">
                        <TableCell colSpan={5} className="p-2 md:p-3 font-semibold text-sm">
                          {categoryGroup.categoryName}
                        </TableCell>
                      </TableRow>
                      
                      {/* Product and variant rows */}
                      {categoryGroup.products.map((productGroup) => (
                        <>
                          {productGroup.rows.map((row, idx) => (
                            <TableRow key={row.id} className={selectedIds.has(row.id) ? 'bg-muted/50' : ''}>
                              <TableCell className="p-2 md:p-3">
                                <Checkbox
                                  checked={selectedIds.has(row.id)}
                                  onCheckedChange={() => toggleSelectRow(row.id)}
                                  aria-label={`Select ${row.product?.title}`}
                                />
                              </TableCell>
                              <TableCell className="p-2 md:p-3">
                                <div className="space-y-1">
                                  {idx === 0 && (
                                    <div className="font-medium">{row.product?.title || '—'}</div>
                                  )}
                                  <div className={`text-sm ${idx === 0 ? 'text-muted-foreground' : 'ml-4 text-muted-foreground'}`}>
                                    {row.variant?.name || '—'}
                                    {row.variant?.sku && (
                                      <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded">
                                        {row.variant.sku}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="p-2 md:p-3 hidden sm:table-cell">{row.warehouse?.name || '—'}</TableCell>
                              <TableCell className="text-right font-semibold p-2 md:p-3">{row.quantity}</TableCell>
                              <TableCell className="text-right p-2 md:p-3">
                                <Button variant="outline" size="sm" onClick={() => setAdjustOpenFor(row)}>
                                  Adjust
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky bulk action bar */}
      {someSelected && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50 px-4 py-3 md:py-4" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 max-w-7xl mx-auto">
              <span className="font-semibold text-center sm:text-left">
                {selectedIds.size} selected
              </span>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Button onClick={() => setBulkAdjustOpen(true)} style={{ backgroundColor: '#0E7A3A', color: 'white' }} className="w-full sm:w-auto">
                  Adjust Stock
                </Button>
                <Button onClick={() => setBulkSetOpen(true)} variant="default" className="w-full sm:w-auto">
                  Set Stock
                </Button>
                <Button variant="outline" onClick={() => setSelectedIds(new Set())} className="w-full sm:w-auto">
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>
        </div>
      )}

      <Dialog open={!!adjustOpenFor} onOpenChange={(open) => !open && setAdjustOpenFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {adjustOpenFor?.product?.title} — {adjustOpenFor?.variant?.name} @ {adjustOpenFor?.warehouse?.name}
            </div>

            <div className="space-y-2">
              <Label>Delta (e.g. +10 or -3)</Label>
              <Input value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={adjustReason} onValueChange={setAdjustReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="initial_stock">Initial Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdjustOpenFor(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={adjustStock} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk adjust stock modal */}
      <Dialog open={bulkAdjustOpen} onOpenChange={(open) => !open && setBulkAdjustOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Adjust Stock</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              <div className="font-medium mb-1">Adjusting {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}</div>
              <div className="text-xs">
                The adjustment will be applied to each selected variant at the chosen warehouse.
              </div>
            </div>

            <div className="space-y-2">
              <Label>Warehouse *</Label>
              <Select value={bulkWarehouseId} onValueChange={setBulkWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Stock will be adjusted at this warehouse for all selected variants.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Adjust By *</Label>
              <Input
                type="number"
                value={bulkDelta}
                onChange={(e) => setBulkDelta(e.target.value)}
                placeholder="e.g. 10 or -5"
              />
              <p className="text-xs text-muted-foreground">
                Positive to increase, negative to decrease. Final quantity will not go below 0.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={bulkReason} onValueChange={setBulkReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Restock">Restock</SelectItem>
                  <SelectItem value="Sale">Sale</SelectItem>
                  <SelectItem value="Damage">Damage</SelectItem>
                  <SelectItem value="Transfer">Transfer</SelectItem>
                  <SelectItem value="Correction">Correction</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="Add a note about this adjustment"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkAdjustOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={applyBulkAdjustment} disabled={saving} style={{ backgroundColor: '#0E7A3A', color: 'white' }}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply to {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk set stock modal */}
      <Dialog open={bulkSetOpen} onOpenChange={(open) => !open && setBulkSetOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Set Stock</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              <div className="font-medium mb-1">Setting stock for {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}</div>
              <div className="text-xs">
                Set absolute quantity for each selected variant at the chosen warehouse.
              </div>
            </div>

            <div className="space-y-2">
              <Label>Warehouse *</Label>
              <Select value={bulkSetWarehouseId} onValueChange={setBulkSetWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Stock will be set at this warehouse for all selected variants.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Set Quantity To *</Label>
              <Input
                type="number"
                value={bulkSetQuantity}
                onChange={(e) => setBulkSetQuantity(e.target.value)}
                placeholder="e.g. 100"
              />
              <p className="text-xs text-muted-foreground">
                Absolute quantity (e.g., 100 will set stock to exactly 100 units).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={bulkSetReason} onValueChange={setBulkSetReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Correction">Correction</SelectItem>
                  <SelectItem value="Restock">Restock</SelectItem>
                  <SelectItem value="Physical Count">Physical Count</SelectItem>
                  <SelectItem value="Transfer">Transfer</SelectItem>
                  <SelectItem value="Reset">Reset</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={bulkSetNote}
                onChange={(e) => setBulkSetNote(e.target.value)}
                placeholder="Add a note about this change"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkSetOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={applyBulkSetStock} disabled={saving} style={{ backgroundColor: '#0E7A3A', color: 'white' }}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Set Stock for {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


