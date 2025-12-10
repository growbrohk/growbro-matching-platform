import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Package, Plus, Save, Warehouse, Store, ChevronDown, ChevronRight, Edit2, Check, X, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '@/lib/types';
import { ProductVariation } from '@/lib/types/variable-products';
import { getProductVariations, updateVariationInventory } from '@/lib/api/variable-products';
import { VariableInventoryView } from './VariableInventoryView';

interface ProductInventory {
  id: string;
  product_id: string;
  inventory_location_id: string;
  stock_quantity: number;
  reserved_quantity: number;
  inventory_location?: InventoryLocation;
  products?: {
    id: string;
    name: string;
    thumbnail_url?: string;
    owner_type: string;
  };
}

export interface InventoryLocation {
  id: string;
  type: string;
  name: string;
  venue_user_id?: string;
  is_active: boolean;
}

export interface ProductWithInventory extends Product {
  product_inventory: (ProductInventory & { inventory_location: InventoryLocation })[];
}

export default function Inventory() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [allProducts, setAllProducts] = useState<ProductWithInventory[]>([]);
  const [venueInventory, setVenueInventory] = useState<ProductInventory[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newWarehouseOpen, setNewWarehouseOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [productVariations, setProductVariations] = useState<Record<string, ProductVariation[]>>({});
  const [variationInventory, setVariationInventory] = useState<Record<string, Record<string, number>>>({}); // Format: {variationId: {locationId: stock}}
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedColors, setExpandedColors] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('all'); // Default to 'all'
  // Edit mode state: {productId-locationId: {editing: boolean, tempValue: number}} or {variationId-locationId: {...}}
  const [editMode, setEditMode] = useState<Record<string, { editing: boolean; tempValue: number }>>({});
  // Multi-select warehouse state
  const [selectedWarehouses, setSelectedWarehouses] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Fetch brand products with inventory (all users)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          product_inventory(*, inventory_location:inventory_locations(*))
        `)
        .eq('owner_user_id', profile.id)
        .eq('owner_type', 'brand');

      if (productsError) throw productsError;
      if (productsData) {
        const productsWithInventory = productsData as unknown as ProductWithInventory[];
        setAllProducts(productsWithInventory);
        
        // Fetch variations for variable products in parallel
        const variableProducts = productsWithInventory.filter(p => p.product_type === 'variable');
        const variationsMap: Record<string, ProductVariation[]> = {};
        const variationInvMap: Record<string, Record<string, number>> = {};
        
        // Batch fetch all variations in parallel
        const variationPromises = variableProducts.map(async (product) => {
          const { data: varsData } = await getProductVariations(product.id);
          return { productId: product.id, varsData: varsData || [] };
        });
        
        const variationResults = await Promise.all(variationPromises);
        
        // Collect all variation IDs for batch inventory fetch
        const allVariationIds: string[] = [];
        variationResults.forEach(({ productId, varsData }) => {
          if (varsData.length > 0) {
            variationsMap[productId] = varsData;
            varsData.forEach(v => allVariationIds.push(v.id));
          }
        });
        
        // Batch fetch all variation inventory in one query
        if (allVariationIds.length > 0) {
          const { data: allVariationInvData } = await supabase
            .from('product_variation_inventory')
            .select('product_variation_id, inventory_location_id, stock_quantity')
            .in('product_variation_id', allVariationIds);
          
          if (allVariationInvData) {
            allVariationInvData.forEach((inv) => {
              if (!variationInvMap[inv.product_variation_id]) {
                variationInvMap[inv.product_variation_id] = {};
              }
              variationInvMap[inv.product_variation_id][inv.inventory_location_id] = inv.stock_quantity || 0;
            });
          }
        }
        
        setProductVariations(variationsMap);
        setVariationInventory(variationInvMap);
      }

      // Fetch all active locations
      const { data: locationsData, error: locationsError } = await supabase
        .from('inventory_locations')
        .select('*')
        .eq('is_active', true);

      if (locationsError) throw locationsError;
      if (locationsData) {
        setLocations(locationsData as unknown as InventoryLocation[]);
      }

      // Fetch venue inventory (only if user is venue)
      if (profile.is_venue) {
        const { data: venueInvData, error: venueInvError } = await supabase
          .from('product_inventory')
          .select(`
            *,
            inventory_location:inventory_locations(*),
            products(id, name, thumbnail_url, owner_type)
          `)
          .eq('inventory_locations.venue_user_id', profile.id);

        if (venueInvError) throw venueInvError;
        if (venueInvData) {
          setVenueInventory(venueInvData as unknown as ProductInventory[]);
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.id) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]); // Only fetch on profile change, not on tab change

  async function createWarehouse() {
    if (!newWarehouseName.trim() || !profile) return;

    const { error } = await supabase
      .from('inventory_locations')
      .insert({
        type: 'warehouse',
        name: newWarehouseName.trim(),
        is_active: true,
      });

    if (error) {
      toast.error('Failed to create warehouse');
    } else {
      toast.success('Warehouse created');
      setNewWarehouseName('');
      setNewWarehouseOpen(false);
      fetchData();
    }
  }

  async function logStockChange(
    productId: string,
    locationId: string,
    quantityBefore: number,
    quantityAfter: number,
    variationId?: string,
    notes?: string
  ) {
    if (!profile) return;

    const { error } = await supabase.from('stock_log').insert({
      product_id: productId,
      product_variation_id: variationId || null,
      inventory_location_id: locationId,
      user_id: profile.id,
      change_type: 'adjustment',
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      notes: notes || null,
    });

    if (error) {
      console.error('Failed to log stock change:', error);
      // Don't throw - logging failure shouldn't prevent stock update
    }
  }

  async function updateStock(productId: string, locationId: string, quantity: number, variationId?: string) {
    if (!profile) return;

    const savingKey = variationId ? `${variationId}-${locationId}` : `${productId}-${locationId}`;
    setSaving(savingKey);

    try {
      // Get current stock for logging
      let quantityBefore = 0;
      if (variationId) {
        const currentInv = variationInventory[variationId]?.[locationId] || 0;
        quantityBefore = currentInv;
      } else {
        const product = allProducts.find(p => p.id === productId);
        const inventory = product?.product_inventory?.find(inv => inv.inventory_location_id === locationId);
        quantityBefore = inventory?.stock_quantity || 0;
      }

      if (variationId) {
        // Update variation inventory using the API
        const { error } = await updateVariationInventory(variationId, locationId, quantity, 0);

        if (error) {
          toast.error('Failed to update variation stock');
        } else {
          // Log the change
          await logStockChange(productId, locationId, quantityBefore, quantity, variationId);
          toast.success('Variation stock updated');
          fetchData();
        }
      } else {
        // Update simple product inventory
        const { error } = await supabase
          .from('product_inventory')
          .upsert(
            {
              product_id: productId,
              inventory_location_id: locationId,
              stock_quantity: quantity,
            },
            { onConflict: 'product_id,inventory_location_id' }
          );

        if (error) {
          toast.error('Failed to update stock');
        } else {
          // Log the change
          await logStockChange(productId, locationId, quantityBefore, quantity);
          toast.success('Stock updated');
          fetchData();
        }
      }

      // Exit edit mode
      setEditMode(prev => {
        const newMode = { ...prev };
        delete newMode[savingKey];
        return newMode;
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update stock');
    } finally {
      setSaving(null);
    }
  }

  const toggleProductExpansion = (productId: string) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const toggleColorExpansion = (productId: string, color: string) => {
    const key = `${productId}-${color}`;
    const newExpanded = new Set(expandedColors);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedColors(newExpanded);
  };

  const simpleProducts = allProducts.filter(p => p.product_type === 'simple' || !p.product_type);
  const variableProducts = allProducts.filter(p => p.product_type === 'variable');
  const eventProducts = allProducts.filter(p => p.product_type === 'event');
  const warehouses = locations.filter((loc) => loc.type === 'warehouse');

  // Initialize selected warehouses to all warehouses on first load
  useEffect(() => {
    if (warehouses.length > 0 && selectedWarehouses.size === 0) {
      setSelectedWarehouses(new Set(warehouses.map(w => w.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses.length]);

  const toggleWarehouseSelection = (warehouseId: string) => {
    setSelectedWarehouses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(warehouseId)) {
        newSet.delete(warehouseId);
      } else {
        newSet.add(warehouseId);
      }
      return newSet;
    });
  };

  const getCurrentProducts = () => {
    if (activeTab === 'all') {
      return allProducts;
    } else if (activeTab === 'simple') {
      return simpleProducts;
    } else if (activeTab === 'variable') {
      return variableProducts;
    } else if (activeTab === 'event') {
      return eventProducts;
    }
    return allProducts;
  };

  async function addProductToLocation() {
    if (!selectedProduct || !selectedLocationId || !profile) return;

    const { error } = await supabase.from('product_inventory').upsert(
      {
        product_id: selectedProduct,
        inventory_location_id: selectedLocationId,
        stock_quantity: 0,
      },
      { onConflict: 'product_id,inventory_location_id' }
    );

    if (error) {
      toast.error('Failed to add product to location');
    } else {
      toast.success('Product added to location');
      setAddLocationOpen(false);
      setSelectedProduct(null);
      setSelectedLocationId('');
      fetchData();
    }
  }

  const handleStartEdit = (key: string, currentValue: number) => {
    setEditMode(prev => ({
      ...prev,
      [key]: { editing: true, tempValue: currentValue },
    }));
  };

  const handleCancelEdit = (key: string) => {
    setEditMode(prev => {
      const newMode = { ...prev };
      delete newMode[key];
      return newMode;
    });
  };

  const handleConfirmEdit = (key: string, productId: string, locationId: string, variationId?: string) => {
    const editState = editMode[key];
    if (!editState) return;

    const quantity = editState.tempValue;
    updateStock(productId, locationId, quantity, variationId);
  };

  // CSV Export for inventory
  const handleExportCSV = (productType: 'all' | 'simple' | 'variable' | 'event') => {
    const productsToExport = productType === 'all' 
      ? getCurrentProducts()
      : productType === 'simple' 
        ? simpleProducts 
        : productType === 'variable'
          ? variableProducts
          : eventProducts;

    if (productsToExport.length === 0) {
      // Download template if no products
      handleDownloadTemplate(productType);
      return;
    }

    // CSV Headers
    const headers = ['product_id', 'product_name', 'warehouse_id', 'warehouse_name', 'stock_quantity'];

    // Convert inventory to CSV rows
    const rows: string[][] = [];
    const selectedWarehouseList = warehouses.filter(w => selectedWarehouses.has(w.id));

    productsToExport.forEach((product) => {
      if (productType === 'variable') {
        // For variable products, export variations
        const variations = productVariations[product.id] || [];
        variations.forEach((variation) => {
          selectedWarehouseList.forEach((warehouse) => {
            const stock = variationInventory[variation.id]?.[warehouse.id] || 0;
            rows.push([
              product.id,
              `${product.name} - ${Object.values(variation.attributes).join(', ')}`,
              warehouse.id,
              warehouse.name,
              stock.toString(),
            ]);
          });
        });
      } else {
        // For simple products, export product inventory
        selectedWarehouseList.forEach((warehouse) => {
          const inventory = product.product_inventory?.find(
            (inv) => inv.inventory_location_id === warehouse.id
          );
          const stock = inventory?.stock_quantity || 0;
          rows.push([
            product.id,
            product.name,
            warehouse.id,
            warehouse.name,
            stock.toString(),
          ]);
        });
      }
    });

    // Escape CSV values
    const escapeCSV = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory-${productType}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${rows.length} inventory records to CSV`);
  };

  // Download CSV template
  const handleDownloadTemplate = (productType: 'all' | 'simple' | 'variable' | 'event') => {
    const headers = ['product_id', 'product_name', 'warehouse_id', 'warehouse_name', 'stock_quantity'];
    const exampleRow = ['', 'Product Name', '', 'Warehouse Name', '0'];
    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory-${productType}-template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV template downloaded');
  };

  // Parse CSV file
  const parseCSV = (csvText: string): any[] => {
    const lines = csvText.split('\n').filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values: string[] = [];
      let currentValue = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          if (inQuotes && line[j + 1] === '"') {
            currentValue += '"';
            j++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return rows;
  };

  // Handle CSV import
  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>, productType: 'all' | 'simple' | 'variable' | 'event') => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        throw new Error('CSV file is empty');
      }

      let successCount = 0;
      let errorCount = 0;

      // Create a map of warehouse names to IDs
      const warehouseMap = new Map<string, string>();
      warehouses.forEach(w => warehouseMap.set(w.name.toLowerCase(), w.id));

      for (const row of rows) {
        try {
          const productId = row.product_id?.trim();
          const warehouseId = row.warehouse_id?.trim() || warehouseMap.get(row.warehouse_name?.trim().toLowerCase());
          const stockQuantity = parseInt(row.stock_quantity?.trim() || '0');

          if (!productId || !warehouseId) {
            errorCount++;
            continue;
          }

          // Update stock
          await updateStock(productId, warehouseId, stockQuantity);
          successCount++;
        } catch (error: any) {
          errorCount++;
          console.error('Error importing row:', error);
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully imported ${successCount} inventory record(s)`);
        fetchData();
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} record(s) failed to import`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to process CSV file');
    } finally {
      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    }
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
      <div className="container mx-auto py-4 md:py-8 px-4">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventory</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Manage product inventory across locations
            </p>
          </div>
          <Dialog open={newWarehouseOpen} onOpenChange={setNewWarehouseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs md:text-sm">
                <Warehouse className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">New Warehouse</span>
                <span className="sm:hidden">Warehouse</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Warehouse</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Warehouse Name</Label>
                  <Input
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                    placeholder="Main Warehouse"
                  />
                </div>
                <Button onClick={createWarehouse} className="w-full">
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Warehouse Multi-Select - Outside Card */}
        {warehouses.length > 0 && (
          <div className="mb-4 md:mb-6">
            <Label className="text-sm font-medium mb-2 block">Select Warehouses</Label>
            <div className="flex flex-wrap gap-2">
              {warehouses.map((warehouse) => {
                const isSelected = selectedWarehouses.has(warehouse.id);
                return (
                  <Button
                    key={warehouse.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleWarehouseSelection(warehouse.id)}
                    className="text-xs md:text-sm"
                  >
                    <Warehouse className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                    {warehouse.name}
                    {isSelected && <Check className="ml-1 md:ml-2 h-3 w-3 md:h-4 md:w-4" />}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="pb-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <TabsList className="inline-flex w-full md:w-auto min-w-max">
                  <TabsTrigger value="all" className="whitespace-nowrap flex-shrink-0">
                    All Products ({allProducts.length})
                  </TabsTrigger>
                  <TabsTrigger value="simple" className="whitespace-nowrap flex-shrink-0">
                    Simple Products ({simpleProducts.length})
                  </TabsTrigger>
                  <TabsTrigger value="variable" className="whitespace-nowrap flex-shrink-0">
                    Variable Products ({variableProducts.length})
                  </TabsTrigger>
                  <TabsTrigger value="event" className="whitespace-nowrap flex-shrink-0">
                    Event Tickets ({eventProducts.length})
                  </TabsTrigger>
                  {profile?.is_venue && (
                    <TabsTrigger value="venue" className="whitespace-nowrap flex-shrink-0">
                      Venue Inventory ({venueInventory.length})
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <TabsContent value="all" className="mt-6">
                <CardContent className="p-2 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleExportCSV('all')}>
                        <Download className="mr-2 h-4 w-4" />
                        {getCurrentProducts().length > 0 ? 'Export CSV' : 'Download Template'}
                      </Button>
                      <label>
                        <Button variant="outline" size="sm" asChild>
                          <span>
                            <Upload className="mr-2 h-4 w-4" />
                            Import CSV
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => handleImportCSV(e, 'all')}
                        />
                      </label>
                    </div>
                  </div>
                  <BrandInventoryView
                    products={getCurrentProducts()}
                    locations={locations}
                    selectedWarehouses={selectedWarehouses}
                    onUpdateStock={updateStock}
                    saving={saving}
                    editMode={editMode}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onConfirmEdit={handleConfirmEdit}
                    onAddProductToLocation={addProductToLocation}
                    addLocationOpen={addLocationOpen}
                    setAddLocationOpen={setAddLocationOpen}
                    selectedProduct={selectedProduct}
                    setSelectedProduct={setSelectedProduct}
                    selectedLocationId={selectedLocationId}
                    setSelectedLocationId={setSelectedLocationId}
                    onCreateProduct={() => navigate('/dashboard/products/select-type?owner_type=brand')}
                  />
                </CardContent>
              </TabsContent>

              <TabsContent value="simple" className="mt-6">
                <CardContent className="p-2 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleExportCSV('simple')}>
                        <Download className="mr-2 h-4 w-4" />
                        {simpleProducts.length > 0 ? 'Export CSV' : 'Download Template'}
                      </Button>
                      <label>
                        <Button variant="outline" size="sm" asChild>
                          <span>
                            <Upload className="mr-2 h-4 w-4" />
                            Import CSV
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => handleImportCSV(e, 'simple')}
                        />
                      </label>
                    </div>
                  </div>
                  <BrandInventoryView
                    products={simpleProducts}
                    locations={locations}
                    selectedWarehouses={selectedWarehouses}
                    onUpdateStock={updateStock}
                    saving={saving}
                    editMode={editMode}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onConfirmEdit={handleConfirmEdit}
                    onAddProductToLocation={addProductToLocation}
                    addLocationOpen={addLocationOpen}
                    setAddLocationOpen={setAddLocationOpen}
                    selectedProduct={selectedProduct}
                    setSelectedProduct={setSelectedProduct}
                    selectedLocationId={selectedLocationId}
                    setSelectedLocationId={setSelectedLocationId}
                    onCreateProduct={() => navigate('/dashboard/products/new?product_type=simple&owner_type=brand')}
                  />
                </CardContent>
              </TabsContent>

              <TabsContent value="variable" className="mt-6">
                <CardContent className="p-2 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleExportCSV('variable')}>
                        <Download className="mr-2 h-4 w-4" />
                        {variableProducts.length > 0 ? 'Export CSV' : 'Download Template'}
                      </Button>
                      <label>
                        <Button variant="outline" size="sm" asChild>
                          <span>
                            <Upload className="mr-2 h-4 w-4" />
                            Import CSV
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => handleImportCSV(e, 'variable')}
                        />
                      </label>
                    </div>
                  </div>
                  <VariableInventoryView
                    products={variableProducts}
                    locations={locations}
                    selectedWarehouses={selectedWarehouses}
                    onUpdateStock={updateStock}
                    saving={saving}
                    editMode={editMode}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onConfirmEdit={handleConfirmEdit}
                    productVariations={productVariations}
                    variationInventory={variationInventory}
                    expandedProducts={expandedProducts}
                    expandedColors={expandedColors}
                    onToggleExpansion={toggleProductExpansion}
                    onToggleColorExpansion={toggleColorExpansion}
                    onCreateProduct={() => navigate('/dashboard/products/new?product_type=variable&owner_type=brand')}
                  />
                </CardContent>
              </TabsContent>

              <TabsContent value="event" className="mt-6">
                <CardContent className="p-2 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleExportCSV('event')}>
                        <Download className="mr-2 h-4 w-4" />
                        {eventProducts.length > 0 ? 'Export CSV' : 'Download Template'}
                      </Button>
                      <label>
                        <Button variant="outline" size="sm" asChild>
                          <span>
                            <Upload className="mr-2 h-4 w-4" />
                            Import CSV
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => handleImportCSV(e, 'event')}
                        />
                      </label>
                    </div>
                  </div>
                  <BrandInventoryView
                    products={eventProducts}
                    locations={locations}
                    selectedWarehouses={selectedWarehouses}
                    onUpdateStock={updateStock}
                    saving={saving}
                    editMode={editMode}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onConfirmEdit={handleConfirmEdit}
                    onAddProductToLocation={addProductToLocation}
                    addLocationOpen={addLocationOpen}
                    setAddLocationOpen={setAddLocationOpen}
                    selectedProduct={selectedProduct}
                    setSelectedProduct={setSelectedProduct}
                    selectedLocationId={selectedLocationId}
                    setSelectedLocationId={setSelectedLocationId}
                    onCreateProduct={() => navigate('/events/new')}
                  />
                </CardContent>
              </TabsContent>

              {profile?.is_venue && (
                <TabsContent value="venue" className="mt-6">
                  <CardContent className="p-2 md:p-6">
                    <VenueInventoryView inventory={venueInventory} />
                  </CardContent>
                </TabsContent>
              )}
            </Tabs>
          </CardHeader>
        </Card>
      </div>
    </Layout>
  );
}

// Brand Inventory View Component
interface BrandInventoryViewProps {
  products: ProductWithInventory[];
  locations: InventoryLocation[];
  selectedWarehouses: Set<string>;
  onUpdateStock: (productId: string, locationId: string, quantity: number) => void;
  saving: string | null;
  editMode: Record<string, { editing: boolean; tempValue: number }>;
  onStartEdit: (key: string, currentValue: number) => void;
  onCancelEdit: (key: string) => void;
  onConfirmEdit: (key: string, productId: string, locationId: string) => void;
  onAddProductToLocation: () => void;
  addLocationOpen: boolean;
  setAddLocationOpen: (open: boolean) => void;
  selectedProduct: string | null;
  setSelectedProduct: (product: string | null) => void;
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
  onCreateProduct?: () => void;
}

function BrandInventoryView({
  products,
  locations,
  selectedWarehouses,
  onUpdateStock,
  saving,
  editMode,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  onAddProductToLocation,
  addLocationOpen,
  setAddLocationOpen,
  selectedProduct,
  setSelectedProduct,
  selectedLocationId,
  setSelectedLocationId,
  onCreateProduct,
}: BrandInventoryViewProps) {
  // Filter warehouses to only show selected ones
  const warehouses = locations.filter((loc) => loc.type === 'warehouse' && selectedWarehouses.has(loc.id));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-0">
        <h2 className="text-lg md:text-xl font-semibold">Product Inventory</h2>
        <div className="flex gap-2">
          {onCreateProduct && (
            <Button variant="outline" size="sm" onClick={onCreateProduct} className="text-xs md:text-sm">
              <Plus className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Create Product</span>
              <span className="sm:hidden">Create</span>
            </Button>
          )}
          <Dialog open={addLocationOpen} onOpenChange={setAddLocationOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs md:text-sm">
                <Plus className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Product to Location</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select value={selectedProduct || ''} onValueChange={setSelectedProduct}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={onAddProductToLocation} className="w-full">
                  Add
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 md:py-12">
          <p className="text-sm md:text-base text-muted-foreground">No products with inventory yet</p>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          {products.map((product) => (
            <Card key={product.id} className="border">
              <CardHeader className="p-3 md:p-6">
                <div className="flex items-center gap-2 md:gap-3">
                  {product.thumbnail_url ? (
                    <img
                      src={product.thumbnail_url}
                      alt={product.name}
                      className="w-8 h-8 md:w-12 md:h-12 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 md:w-12 md:h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Package className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm md:text-lg truncate">{product.name}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                <div className="space-y-2 md:space-y-4">
                  {selectedWarehouses.size === 0 ? (
                    <p className="text-xs md:text-sm text-muted-foreground">Please select at least one warehouse</p>
                  ) : warehouses.length === 0 ? (
                    <p className="text-xs md:text-sm text-muted-foreground">No warehouses available</p>
                  ) : (
                    warehouses.map((warehouse) => {
                      const inventory = product.product_inventory?.find(
                        (inv) => inv.inventory_location_id === warehouse.id
                      );
                      const stock = inventory?.stock_quantity || 0;
                      const key = `${product.id}-${warehouse.id}`;
                      const isEditing = editMode[key]?.editing || false;
                      const tempValue = editMode[key]?.tempValue ?? stock;

                      return (
                        <div key={warehouse.id} className="flex items-center gap-2 md:gap-4 py-1 md:py-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 md:gap-2">
                              <Warehouse className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-xs md:text-sm truncate">{warehouse.name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                            {isEditing ? (
                              <>
                                <Input
                                  type="number"
                                  value={tempValue}
                                  onChange={(e) => {
                                    const newValue = parseInt(e.target.value) || 0;
                                    onStartEdit(key, newValue);
                                  }}
                                  className="w-16 md:w-24 h-7 md:h-10 text-xs md:text-sm"
                                  disabled={saving === key}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      onConfirmEdit(key, product.id, warehouse.id);
                                    } else if (e.key === 'Escape') {
                                      onCancelEdit(key);
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onConfirmEdit(key, product.id, warehouse.id)}
                                  disabled={saving === key}
                                  className="h-7 w-7 md:h-8 md:w-8 p-0"
                                >
                                  <Check className="h-3 w-3 md:h-4 md:w-4 text-green-600" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onCancelEdit(key)}
                                  disabled={saving === key}
                                  className="h-7 w-7 md:h-8 md:w-8 p-0"
                                >
                                  <X className="h-3 w-3 md:h-4 md:w-4 text-red-600" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="text-xs md:text-sm font-medium w-12 md:w-16 text-right">{stock}</span>
                                <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">units</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onStartEdit(key, stock);
                                  }}
                                  className="h-7 w-7 md:h-8 md:w-8 p-0"
                                >
                                  <Edit2 className="h-3 w-3 md:h-4 md:w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Venue Inventory View Component
interface VenueInventoryViewProps {
  inventory: ProductInventory[];
}

function VenueInventoryView({ inventory }: VenueInventoryViewProps) {
  if (inventory.length === 0) {
    return (
      <div className="text-center py-8 md:py-12">
        <p className="text-sm md:text-base text-muted-foreground">No inventory at your venue yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h2 className="text-lg md:text-xl font-semibold">Venue Inventory</h2>
      <div className="space-y-2 md:space-y-4">
        {inventory.map((item) => (
          <Card key={item.id} className="border">
            <CardContent className="p-3 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                  {item.products?.thumbnail_url ? (
                    <img
                      src={item.products.thumbnail_url}
                      alt={item.products.name}
                      className="w-8 h-8 md:w-12 md:h-12 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 md:w-12 md:h-12 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Package className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs md:text-sm truncate">{item.products?.name || 'Unknown Product'}</p>
                    <p className="text-[10px] md:text-sm text-muted-foreground truncate">
                      {item.inventory_location?.name || 'Unknown Location'}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-sm md:text-base">{item.stock_quantity}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">in stock</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
