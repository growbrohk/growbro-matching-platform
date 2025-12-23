import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Package, Plus, Save, Warehouse, Store, ChevronDown, ChevronRight, Edit2, Check, X, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '@/lib/types';
import { ProductVariation } from '@/lib/types/variable-products';
import { getProductVariations, updateVariationInventory } from '@/lib/api/variable-products';
import { getEventWithTickets } from '@/lib/api/ticketing';
import { EventWithTicketProducts, TicketProductRecord } from '@/lib/types/ticketing';

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
  // Global edit mode - when true, all stocks are editable
  const [isGlobalEditMode, setIsGlobalEditMode] = useState(false);
  // Edit mode state: {productId-locationId: {editing: boolean, tempValue: number}} or {variationId-locationId: {...}}
  const [editMode, setEditMode] = useState<Record<string, { editing: boolean; tempValue: number }>>({});
  // Multi-select warehouse state
  const [selectedWarehouses, setSelectedWarehouses] = useState<Set<string>>(new Set());
  // Event data with ticket products
  const [eventDataMap, setEventDataMap] = useState<Record<string, EventWithTicketProducts>>({});

  const fetchData = useCallback(async (showLoading = true) => {
    if (!profile) return;

    if (showLoading) {
      setLoading(true);
    }
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
          // Split into chunks to avoid URL length issues
          const chunkSize = 100;
          const chunks: string[][] = [];
          for (let i = 0; i < allVariationIds.length; i += chunkSize) {
            chunks.push(allVariationIds.slice(i, i + chunkSize));
          }
          
          const allVariationInvData: any[] = [];
          for (const chunk of chunks) {
            const { data, error } = await supabase
              .from('product_variation_inventory')
              .select('variation_id, inventory_location_id, stock_quantity')
              .in('variation_id', chunk);
            
            if (error) {
              console.error('Error fetching variation inventory:', error);
              toast.error(`Failed to load some inventory data: ${error.message}`);
            } else if (data) {
              allVariationInvData.push(...data);
            }
          }
          
          if (allVariationInvData.length > 0) {
            allVariationInvData.forEach((inv) => {
              const variationId = inv.variation_id || inv.product_variation_id; // Support both column names
              if (!variationInvMap[variationId]) {
                variationInvMap[variationId] = {};
              }
              variationInvMap[variationId][inv.inventory_location_id] = inv.stock_quantity || 0;
            });
          }
        }
        
        setProductVariations(variationsMap);
        setVariationInventory(variationInvMap);

        // Fetch event data for event products
        const eventProducts = productsWithInventory.filter(p => p.product_type === 'event');
        const eventDataPromises = eventProducts.map(async (product) => {
          const eventId = (product as any).event_id;
          if (eventId && profile) {
            const { data } = await getEventWithTickets(eventId, profile);
            return { productId: product.id, eventData: data };
          }
          return { productId: product.id, eventData: null };
        });
        const eventDataResults = await Promise.all(eventDataPromises);
        const eventMap: Record<string, EventWithTicketProducts> = {};
        eventDataResults.forEach(({ productId, eventData }) => {
          if (eventData) {
            eventMap[productId] = eventData;
          }
        });
        setEventDataMap(eventMap);
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
      // Only show products where owner_type = 'venue'
      if (profile.is_venue) {
        const { data: venueInvData, error: venueInvError } = await supabase
          .from('product_inventory')
          .select(`
            *,
            inventory_location:inventory_locations(*),
            products!inner(id, name, thumbnail_url, owner_type)
          `)
          .eq('inventory_locations.venue_user_id', profile.id)
          .eq('products.owner_type', 'venue');

        if (venueInvError) throw venueInvError;
        if (venueInvData) {
          setVenueInventory(venueInvData as unknown as ProductInventory[]);
        }
      }
      setError(null);
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to load inventory';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
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
    console.log('updateStock called:', { productId, locationId, quantity, variationId, profile: profile?.id });
    if (!profile) {
      console.error('No profile found, cannot update stock');
      return;
    }

    const savingKey = variationId ? `${variationId}-${locationId}` : `${productId}-${locationId}`;
    console.log('Setting saving state:', savingKey);
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
        const { error, data: updatedData } = await updateVariationInventory(variationId, locationId, quantity, 0);

        if (error) {
          toast.error(`Failed to update variation stock: ${error.message || 'Unknown error'}`);
          console.error('Update variation inventory error:', error);
          // Revert optimistic update on error
          setVariationInventory(prev => {
            const newState = { ...prev };
            if (newState[variationId]) {
              newState[variationId] = {
                ...newState[variationId],
                [locationId]: quantityBefore // Revert to previous value
              };
            }
            return newState;
          });
        } else {
          // Use the returned data from upsert, or fall back to the quantity we sent
          const finalQuantity = updatedData?.stock_quantity ?? quantity;
          
          console.log('Stock updated successfully:', { variationId, locationId, finalQuantity, updatedData });
          
          // Update local state with the actual database value
          setVariationInventory(prev => {
            const newState = { ...prev };
            if (!newState[variationId]) {
              newState[variationId] = {};
            }
            newState[variationId] = {
              ...newState[variationId],
              [locationId]: finalQuantity
            };
            return newState;
          });

          // Log the change
          await logStockChange(productId, locationId, quantityBefore, finalQuantity, variationId);
          toast.success('Variation stock updated');
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
    console.log('handleConfirmEdit called:', { key, productId, locationId, variationId });
    const editState = editMode[key];
    if (!editState) {
      console.warn('No edit state found for key:', key);
      return;
    }

    const quantity = editState.tempValue;
    console.log('Calling updateStock with:', { productId, locationId, quantity, variationId });
    updateStock(productId, locationId, quantity, variationId);
  };

  // Global edit mode handlers
  const handleStartGlobalEdit = () => {
    setIsGlobalEditMode(true);
    // Initialize all stock values in edit mode
    const newEditMode: Record<string, { editing: boolean; tempValue: number }> = {};
    
    // For simple products
    const simpleProducts = allProducts.filter(p => p.product_type === 'simple' || !p.product_type);
    const warehouses = locations.filter((loc) => loc.type === 'warehouse' && selectedWarehouses.has(loc.id));
    
    simpleProducts.forEach((product) => {
      warehouses.forEach((warehouse) => {
        const inventory = product.product_inventory?.find(
          (inv) => inv.inventory_location_id === warehouse.id
        );
        const stock = inventory?.stock_quantity || 0;
        const key = `${product.id}-${warehouse.id}`;
        newEditMode[key] = { editing: true, tempValue: stock };
      });
    });

    // For variable products
    Object.keys(productVariations).forEach((productId) => {
      const variations = productVariations[productId];
      warehouses.forEach((warehouse) => {
        variations.forEach((variation) => {
          const stock = variationInventory[variation.id]?.[warehouse.id] || 0;
          const key = `${variation.id}-${warehouse.id}`;
          newEditMode[key] = { editing: true, tempValue: stock };
        });
      });
    });

    setEditMode(newEditMode);
  };

  const handleCancelGlobalEdit = () => {
    setIsGlobalEditMode(false);
    setEditMode({});
  };

  const handleSaveAllChanges = async () => {
    setIsGlobalEditMode(false);
    
    // Save all changes
    const savePromises: Promise<void>[] = [];
    
    Object.entries(editMode).forEach(([key, editState]) => {
      // Type guard for editState
      if (!editState || typeof editState !== 'object' || !('tempValue' in editState)) {
        return;
      }
      
      const typedEditState = editState as { editing: boolean; tempValue: number };
      
      // Parse key to get productId/locationId or variationId/locationId
      const parts = key.split('-');
      if (parts.length >= 2) {
        const firstId = parts[0];
        const locationId = parts.slice(1).join('-'); // In case location ID has dashes
        
        // Check if this is a variation (check if firstId exists in variationInventory)
        const isVariation = Object.keys(variationInventory).includes(firstId);
        
        if (isVariation) {
          // Find the product ID for this variation
          let productId = '';
          for (const [pid, variations] of Object.entries(productVariations)) {
            if (Array.isArray(variations) && variations.some((v: ProductVariation) => v.id === firstId)) {
              productId = pid;
              break;
            }
          }
          if (productId) {
            savePromises.push(updateStock(productId, locationId, typedEditState.tempValue, firstId));
          }
        } else {
          // Simple product
          const product = allProducts.find(p => p.id === firstId);
          if (product) {
            savePromises.push(updateStock(firstId, locationId, typedEditState.tempValue));
          }
        }
      }
    });

    // Wait for all saves to complete
    await Promise.all(savePromises);
    setEditMode({});
    toast.success('All stock changes saved');
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
          const warehouseId = row.warehouse_id?.trim() || warehouseMap.get((row.warehouse_name as string)?.trim().toLowerCase());
          const stockQuantity = parseInt((row.stock_quantity as string)?.trim() || '0');
          const productName = (row.product_name as string)?.trim() || '';

          if (!productId || !warehouseId) {
            errorCount++;
            continue;
          }

          // Check if this is a variable product
          const product = allProducts.find(p => p.id === productId);
          const isVariableProduct = product?.product_type === 'variable';

          if (isVariableProduct) {
            // For variable products, we need to find the matching variation
            // The product_name in CSV format is: "Product Name - Attribute1, Attribute2"
            const variationMatch = productName.match(/^(.+?)\s*-\s*(.+)$/);
            if (!variationMatch) {
              errorCount++;
              console.error('Could not parse variation attributes from product name:', productName);
              continue;
            }

            const variationAttributesStr = variationMatch[2].trim();
            // Parse attributes: "Black, S" or "Color: Black, Size: S"
            const attributeValues = variationAttributesStr.split(',').map(v => v.trim());
            
            // Get all variations for this product
            const variations = productVariations[productId] || [];
            
            // Find matching variation by comparing attributes
            let matchingVariation = null;
            for (const variation of variations) {
              const variationAttrValues = Object.values(variation.attributes).map(v => String(v).trim().toLowerCase());
              const csvAttrValues = attributeValues.map(v => v.trim().toLowerCase());
              
              // Check if all CSV attribute values match the variation attributes
              const allMatch = csvAttrValues.every(csvVal => 
                variationAttrValues.some(varVal => varVal === csvVal)
              ) && variationAttrValues.length === csvAttrValues.length;
              
              if (allMatch) {
                matchingVariation = variation;
                break;
              }
            }

            if (!matchingVariation) {
              errorCount++;
              console.error('Could not find matching variation for:', productName, 'Attributes:', attributeValues);
              continue;
            }

            // Update variation inventory using updateStock which handles state updates
            await updateStock(productId, warehouseId, stockQuantity, matchingVariation.id);
            successCount++;
          } else {
            // For simple products, update product inventory directly
            await updateStock(productId, warehouseId, stockQuantity);
            successCount++;
          }
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
            <Button onClick={() => fetchData()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="container mx-auto py-4 md:py-8 px-4">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>Inventory</h1>
            <p className="text-sm md:text-base mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
              Manage product inventory across locations
            </p>
          </div>
        </div>

        {/* Product Type Tabs - Outside Card */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4 md:mb-6">
          <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsList className="inline-flex w-full md:w-auto min-w-max h-8 md:h-10 gap-0.5 md:gap-1">
              <TabsTrigger value="all" className="whitespace-nowrap flex-shrink-0 text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-2 h-7 md:h-9">
                All ({allProducts.length})
              </TabsTrigger>
              <TabsTrigger value="simple" className="whitespace-nowrap flex-shrink-0 text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-2 h-7 md:h-9">
                Simple ({simpleProducts.length})
              </TabsTrigger>
              <TabsTrigger value="variable" className="whitespace-nowrap flex-shrink-0 text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-2 h-7 md:h-9">
                Variable ({variableProducts.length})
              </TabsTrigger>
              <TabsTrigger value="event" className="whitespace-nowrap flex-shrink-0 text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-2 h-7 md:h-9">
                Event ({eventProducts.length})
              </TabsTrigger>
              {profile?.is_venue && (
                <TabsTrigger value="venue" className="whitespace-nowrap flex-shrink-0 text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-2 h-7 md:h-9">
                  Venue ({venueInventory.length})
                </TabsTrigger>
              )}
            </TabsList>
          </div>

        <Card>
          <CardHeader className="pb-0 p-2 md:p-6">
            {/* Warehouse Selection and New Warehouse Button - Only show in simple & variable tabs */}
            {(activeTab === 'simple' || activeTab === 'variable') && (
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-3 mb-4">
                {warehouses.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs md:text-sm font-medium whitespace-nowrap">Select Warehouses:</Label>
                    <div className="flex flex-wrap gap-1 md:gap-2">
                      {warehouses.map((warehouse) => {
                        const isSelected = selectedWarehouses.has(warehouse.id);
                        return (
                          <Button
                            key={warehouse.id}
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleWarehouseSelection(warehouse.id)}
                            className="text-[10px] md:text-xs h-6 md:h-7 px-2 md:px-3"
                          >
                            <Warehouse className="mr-1 h-3 w-3 md:h-3 md:w-3" />
                            {warehouse.name}
                            {isSelected && <Check className="ml-1 h-3 w-3 md:h-3 md:w-3" />}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <Dialog open={newWarehouseOpen} onOpenChange={setNewWarehouseOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-[10px] md:text-xs h-6 md:h-7 px-2 md:px-3">
                      <Warehouse className="mr-1 h-3 w-3 md:h-3 md:w-3" />
                      <span className="hidden sm:inline">New Warehouse</span>
                      <span className="sm:hidden">New</span>
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
            )}

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
                    isGlobalEditMode={isGlobalEditMode}
                    onStockValueChange={(key, value) => {
                      setEditMode(prev => ({
                        ...prev,
                        [key]: { editing: true, tempValue: value },
                      }));
                    }}
                    onStartGlobalEdit={handleStartGlobalEdit}
                    onCancelGlobalEdit={handleCancelGlobalEdit}
                    onSaveAllChanges={handleSaveAllChanges}
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
                    isGlobalEditMode={isGlobalEditMode}
                    onStockValueChange={(key, value) => {
                      setEditMode(prev => ({
                        ...prev,
                        [key]: { editing: true, tempValue: value },
                      }));
                    }}
                    onStartGlobalEdit={handleStartGlobalEdit}
                    onCancelGlobalEdit={handleCancelGlobalEdit}
                    onSaveAllChanges={handleSaveAllChanges}
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
                  <div className="text-center py-12 text-muted-foreground">
                    Variable products inventory view has been removed. This section needs to be reimplemented.
                  </div>
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
                  <EventInventoryView
                    products={eventProducts}
                    eventDataMap={eventDataMap}
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
          </CardHeader>
        </Card>
        </Tabs>
      </div>
    </div>
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
  isGlobalEditMode: boolean;
  onStockValueChange: (key: string, value: number) => void;
  onStartGlobalEdit: () => void;
  onCancelGlobalEdit: () => void;
  onSaveAllChanges: () => Promise<void>;
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
  isGlobalEditMode,
  onStockValueChange,
  onStartGlobalEdit,
  onCancelGlobalEdit,
  onSaveAllChanges,
}: BrandInventoryViewProps) {
  // Filter warehouses to only show selected ones
  const warehouses = locations.filter((loc) => loc.type === 'warehouse' && selectedWarehouses.has(loc.id));

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-0">
        <h2 className="text-lg md:text-xl font-semibold">Product Inventory</h2>
        <div className="flex gap-2">
          {isGlobalEditMode ? (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs md:text-sm"
                onClick={onCancelGlobalEdit}
              >
                Cancel
              </Button>
              <Button 
                size="sm" 
                className="text-xs md:text-sm"
                onClick={onSaveAllChanges}
                disabled={saving !== null}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                    Save
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs md:text-sm"
              onClick={onStartGlobalEdit}
            >
              <Edit2 className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
              Edit Stock
            </Button>
          )}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 md:py-12">
          <p className="text-sm md:text-base text-muted-foreground">No products with inventory yet</p>
        </div>
      ) : selectedWarehouses.size === 0 ? (
        <div className="text-center py-8 md:py-12">
          <p className="text-sm md:text-base text-muted-foreground">Please select at least one warehouse</p>
        </div>
      ) : warehouses.length === 0 ? (
        <div className="text-center py-8 md:py-12">
          <p className="text-sm md:text-base text-muted-foreground">No warehouses available</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs md:text-sm w-[80px] md:w-[100px]">Category</TableHead>
                <TableHead className="text-xs md:text-sm min-w-[120px] md:min-w-[150px]">Product</TableHead>
                <TableHead className="text-xs md:text-sm w-[80px] md:w-[100px]">Variation</TableHead>
                <TableHead className="text-xs md:text-sm w-[80px] md:w-[100px]">Size</TableHead>
                {warehouses.map((warehouse) => (
                  <TableHead key={warehouse.id} className="text-xs md:text-sm text-center w-[100px] md:w-[120px]">
                    {warehouse.name}
                  </TableHead>
                ))}
                <TableHead className="text-xs md:text-sm text-center w-[80px] md:w-[100px]">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                // Calculate totals for simple products
                let totalStock = 0;
                warehouses.forEach((warehouse) => {
                  const inventory = product.product_inventory?.find(
                    (inv) => inv.inventory_location_id === warehouse.id
                  );
                  totalStock += inventory?.stock_quantity || 0;
                });

                return (
                  <TableRow key={product.id} className="border-b">
                    <TableCell className="text-xs md:text-sm">Simple</TableCell>
                    <TableCell className="text-xs md:text-sm font-medium">{product.name}</TableCell>
                    <TableCell className="text-xs md:text-sm">-</TableCell>
                    <TableCell className="text-xs md:text-sm">-</TableCell>
                    {warehouses.map((warehouse) => {
                      const inventory = product.product_inventory?.find(
                        (inv) => inv.inventory_location_id === warehouse.id
                      );
                      const stock = inventory?.stock_quantity || 0;
                      const key = `${product.id}-${warehouse.id}`;
                      const isEditing = editMode[key]?.editing || false;
                      const tempValue = editMode[key]?.tempValue ?? stock;

                      return (
                        <TableCell key={warehouse.id} className="text-center p-1 md:p-2">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="number"
                                value={tempValue}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value) || 0;
                                  onStartEdit(key, newValue);
                                }}
                                className="w-12 md:w-16 h-6 md:h-8 text-xs md:text-sm text-center"
                                disabled={saving === key}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    onConfirmEdit(key, product.id, warehouse.id);
                                  } else if (e.key === 'Escape') {
                                    onCancelEdit(key);
                                  }
                                }}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onConfirmEdit(key, product.id, warehouse.id)}
                                disabled={saving === key}
                                className="h-5 w-5 md:h-6 md:w-6 p-0"
                              >
                                <Check className="h-3 w-3 md:h-4 md:w-4 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onCancelEdit(key)}
                                disabled={saving === key}
                                className="h-5 w-5 md:h-6 md:w-6 p-0"
                              >
                                <X className="h-3 w-3 md:h-4 md:w-4 text-red-600" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-xs md:text-sm">{stock}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartEdit(key, stock);
                                }}
                                className="h-5 w-5 md:h-6 md:w-6 p-0"
                              >
                                <Edit2 className="h-3 w-3 md:h-4 md:w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center text-xs md:text-sm font-semibold">{totalStock}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// Event Inventory View Component
interface EventInventoryViewProps {
  products: ProductWithInventory[];
  eventDataMap: Record<string, EventWithTicketProducts>;
}

function EventInventoryView({ products, eventDataMap }: EventInventoryViewProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-8 md:py-12">
        <p className="text-sm md:text-base text-muted-foreground">No event products yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs md:text-sm w-[80px] md:w-[100px]">Category</TableHead>
              <TableHead className="text-xs md:text-sm min-w-[120px] md:min-w-[150px]">Product</TableHead>
              <TableHead className="text-xs md:text-sm w-[150px] md:w-[200px]">Ticket Type</TableHead>
              <TableHead className="text-xs md:text-sm text-center w-[120px] md:w-[150px]">Quota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const eventData = eventDataMap[product.id];
              const ticketProducts = eventData?.ticket_products || [];

              if (ticketProducts.length === 0) {
                return (
                  <TableRow key={product.id} className="border-b">
                    <TableCell className="text-xs md:text-sm">Event</TableCell>
                    <TableCell className="text-xs md:text-sm font-medium">{product.name}</TableCell>
                    <TableCell className="text-xs md:text-sm text-muted-foreground">No ticket types</TableCell>
                    <TableCell className="text-center text-xs md:text-sm">-</TableCell>
                  </TableRow>
                );
              }

              return ticketProducts.map((ticketProduct, index) => {
                const remaining = ticketProduct.capacity_remaining || 0;
                const total = ticketProduct.capacity_total || 0;
                return (
                  <TableRow key={`${product.id}-${ticketProduct.id}`} className="border-b">
                    {index === 0 && (
                      <>
                        <TableCell rowSpan={ticketProducts.length} className="text-xs md:text-sm align-top">
                          Event
                        </TableCell>
                        <TableCell rowSpan={ticketProducts.length} className="text-xs md:text-sm font-medium align-top">
                          {product.name}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-xs md:text-sm">{ticketProduct.name}</TableCell>
                    <TableCell className="text-center text-xs md:text-sm font-semibold">
                      {remaining} / {total}
                    </TableCell>
                  </TableRow>
                );
              });
            })}
          </TableBody>
        </Table>
      </div>
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
