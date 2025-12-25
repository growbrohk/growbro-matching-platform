import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Edit, Trash2, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getUniqueVariantOptionNames } from '@/lib/utils/variant-parser';
import { getVariantConfig, upsertVariantConfig, type VariantConfig } from '@/lib/api/variant-config';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getCategoriesWithCounts,
  createCategory,
  updateCategory,
  deleteCategory,
  reassignProductsCategory,
  updateCategoriesSortOrder,
  getTagsWithCounts,
  createTag,
  updateTag,
  deleteTag,
  type CategoryWithCount,
  type TagWithCount,
} from '@/lib/api/categories-and-tags';

type DeleteCategoryAction = 'cancel' | 'delete' | 'merge';

export default function CatalogSettings() {
  const { currentOrg } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Categories state
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  
  // Tags state
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  
  // Variant options state
  const [variantOptions, setVariantOptions] = useState<string[]>([]);
  const [allVariantNames, setAllVariantNames] = useState<string[]>([]);
  const [variantConfig, setVariantConfig] = useState<VariantConfig | null>(null);
  
  // Edit dialogs
  const [editCategoryDialog, setEditCategoryDialog] = useState<{ 
    open: boolean; 
    categoryId: string;
    oldName: string; 
    newName: string;
  }>({
    open: false,
    categoryId: '',
    oldName: '',
    newName: '',
  });
  
  const [editTagDialog, setEditTagDialog] = useState<{ 
    open: boolean; 
    tagId: string;
    oldName: string; 
    newName: string;
  }>({
    open: false,
    tagId: '',
    oldName: '',
    newName: '',
  });
  
  // Delete dialogs
  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState<{
    open: boolean;
    categoryId: string;
    categoryName: string;
    usageCount: number;
    action: DeleteCategoryAction;
    mergeTargetId: string;
  }>({
    open: false,
    categoryId: '',
    categoryName: '',
    usageCount: 0,
    action: 'cancel',
    mergeTargetId: '',
  });
  
  const [deleteTagDialog, setDeleteTagDialog] = useState<{ 
    open: boolean; 
    tagId: string;
    tagName: string; 
    usageCount: number;
  }>({
    open: false,
    tagId: '',
    tagName: '',
    usageCount: 0,
  });

  useEffect(() => {
    if (!currentOrg) return;
    loadData();
  }, [currentOrg]);

  const loadData = async () => {
    if (!currentOrg) return;
    
    setLoading(true);
    try {
      await Promise.all([
        loadCategories(),
        loadTags(),
        loadVariantOptions(),
      ]);
    } catch (error: any) {
      console.error('Error loading catalog settings:', error);
      toast.error(error.message || 'Failed to load catalog settings');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    if (!currentOrg) return;
    
    try {
      const data = await getCategoriesWithCounts(currentOrg.id);
      setCategories(data);
    } catch (error: any) {
      console.error('Error loading categories:', error);
      throw error;
    }
  };

  const loadTags = async () => {
    if (!currentOrg) return;
    
    try {
      const data = await getTagsWithCounts(currentOrg.id);
      setTags(data);
    } catch (error: any) {
      console.error('Error loading tags:', error);
      throw error;
    }
  };

  const loadVariantOptions = async () => {
    if (!currentOrg) return;
    
    try {
      // Fetch all product variants for this org
      const { data: products, error: productsErr } = await (supabase as any)
        .from('products')
        .select('id')
        .eq('org_id', currentOrg.id);
      
      if (productsErr) throw productsErr;
      
      const productIds = (products || []).map(p => p.id);
      
      if (productIds.length === 0) {
        setAllVariantNames([]);
        setVariantOptions([]);
        return;
      }
      
      const { data: variants, error: variantsErr } = await (supabase as any)
        .from('product_variants')
        .select('name')
        .in('product_id', productIds);
      
      if (variantsErr) throw variantsErr;
      
      const variantNames = (variants || []).map((v: any) => v.name);
      setAllVariantNames(variantNames);
      
      // Extract unique option names
      const uniqueOptions = getUniqueVariantOptionNames(variantNames);
      
      // Load saved order from org_variant_config table
      const config = await getVariantConfig(currentOrg.id);
      setVariantConfig(config);
      
      // Build ordered options list from config
      const orderedOptions: string[] = [];
      
      // Add rank1 and rank2 from config if they exist in discovered options
      if (uniqueOptions.includes(config.rank1)) {
        orderedOptions.push(config.rank1);
      }
      if (uniqueOptions.includes(config.rank2) && config.rank2 !== config.rank1) {
        orderedOptions.push(config.rank2);
      }
      
      // Add any other discovered options that aren't in the config
      for (const option of uniqueOptions) {
        if (!orderedOptions.includes(option)) {
          orderedOptions.push(option);
        }
      }
      
      setVariantOptions(orderedOptions);
    } catch (error: any) {
      console.error('Error loading variant options:', error);
      throw error;
    }
  };

  // ============================================================================
  // CATEGORY FUNCTIONS
  // ============================================================================

  const addCategory = async () => {
    if (!currentOrg || !newCategoryInput.trim()) return;
    
    const newCatName = newCategoryInput.trim();
    if (categories.some(c => c.name.toLowerCase() === newCatName.toLowerCase())) {
      toast.error('Category already exists');
      return;
    }
    
    setSaving(true);
    try {
      await createCategory(currentOrg.id, newCatName);
      await loadCategories();
      setNewCategoryInput('');
      toast.success('Category added');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add category');
    } finally {
      setSaving(false);
    }
  };

  const renameCategory = async () => {
    if (!currentOrg || !editCategoryDialog.categoryId || !editCategoryDialog.newName.trim()) return;
    
    const newName = editCategoryDialog.newName.trim();
    
    if (editCategoryDialog.oldName === newName) {
      setEditCategoryDialog({ open: false, categoryId: '', oldName: '', newName: '' });
      return;
    }
    
    if (categories.some(c => c.name.toLowerCase() === newName.toLowerCase() && c.id !== editCategoryDialog.categoryId)) {
      toast.error('Category already exists');
      return;
    }
    
    setSaving(true);
    try {
      await updateCategory(editCategoryDialog.categoryId, { name: newName });
      await loadCategories();
      setEditCategoryDialog({ open: false, categoryId: '', oldName: '', newName: '' });
      toast.success('Category renamed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to rename category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!currentOrg || !deleteCategoryDialog.categoryId) return;
    
    const { categoryId, action, mergeTargetId } = deleteCategoryDialog;
    
    if (action === 'cancel') {
      setDeleteCategoryDialog({ 
        open: false, 
        categoryId: '',
        categoryName: '', 
        usageCount: 0, 
        action: 'cancel', 
        mergeTargetId: '' 
      });
      return;
    }
    
    setSaving(true);
    try {
      // Reassign products if merging
      if (action === 'merge' && mergeTargetId) {
        const count = await reassignProductsCategory(categoryId, mergeTargetId);
        await deleteCategory(categoryId);
        await loadCategories();
        toast.success(`Category deleted (${count} products merged)`);
      } else {
        // Delete and remove category from products
        const count = await reassignProductsCategory(categoryId, null);
        await deleteCategory(categoryId);
        await loadCategories();
        toast.success(`Category deleted (${count} products updated)`);
      }
      
      setDeleteCategoryDialog({ 
        open: false, 
        categoryId: '',
        categoryName: '', 
        usageCount: 0, 
        action: 'cancel', 
        mergeTargetId: '' 
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete category');
    } finally {
      setSaving(false);
    }
  };

  const moveCategoryUp = async (index: number) => {
    if (index === 0) return;
    
    setSaving(true);
    try {
      const newCategories = [...categories];
      [newCategories[index - 1], newCategories[index]] = [newCategories[index], newCategories[index - 1]];
      
      // Update sort orders
      const updates = newCategories.map((cat, idx) => ({
        id: cat.id,
        sort_order: idx,
      }));
      
      await updateCategoriesSortOrder(updates);
      await loadCategories();
      toast.success('Category order updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const moveCategoryDown = async (index: number) => {
    if (index === categories.length - 1) return;
    
    setSaving(true);
    try {
      const newCategories = [...categories];
      [newCategories[index], newCategories[index + 1]] = [newCategories[index + 1], newCategories[index]];
      
      // Update sort orders
      const updates = newCategories.map((cat, idx) => ({
        id: cat.id,
        sort_order: idx,
      }));
      
      await updateCategoriesSortOrder(updates);
      await loadCategories();
      toast.success('Category order updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // TAG FUNCTIONS
  // ============================================================================

  const addTag = async () => {
    if (!currentOrg || !newTagInput.trim()) return;
    
    const newTagName = newTagInput.trim();
    if (tags.some(t => t.name.toLowerCase() === newTagName.toLowerCase())) {
      toast.error('Tag already exists');
      return;
    }
    
    setSaving(true);
    try {
      await createTag(currentOrg.id, newTagName);
      await loadTags();
      setNewTagInput('');
      toast.success('Tag added');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add tag');
    } finally {
      setSaving(false);
    }
  };

  const renameTag = async () => {
    if (!currentOrg || !editTagDialog.tagId || !editTagDialog.newName.trim()) return;
    
    const newName = editTagDialog.newName.trim();
    
    if (editTagDialog.oldName === newName) {
      setEditTagDialog({ open: false, tagId: '', oldName: '', newName: '' });
      return;
    }
    
    if (tags.some(t => t.name.toLowerCase() === newName.toLowerCase() && t.id !== editTagDialog.tagId)) {
      toast.error('Tag already exists');
      return;
    }
    
    setSaving(true);
    try {
      await updateTag(editTagDialog.tagId, { name: newName });
      await loadTags();
      setEditTagDialog({ open: false, tagId: '', oldName: '', newName: '' });
      toast.success('Tag renamed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to rename tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTag = async () => {
    if (!currentOrg || !deleteTagDialog.tagId) return;
    
    setSaving(true);
    try {
      await deleteTag(deleteTagDialog.tagId);
      await loadTags();
      setDeleteTagDialog({ open: false, tagId: '', tagName: '', usageCount: 0 });
      toast.success('Tag deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete tag');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // VARIANT OPTIONS FUNCTIONS
  // ============================================================================

  const moveVariantOptionUp = async (index: number) => {
    if (index === 0) return;
    
    setSaving(true);
    try {
      const newOptions = [...variantOptions];
      [newOptions[index - 1], newOptions[index]] = [newOptions[index], newOptions[index - 1]];
      
      await saveVariantOptionOrder(newOptions);
      setVariantOptions(newOptions);
      toast.success('Variant option order updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const moveVariantOptionDown = async (index: number) => {
    if (index === variantOptions.length - 1) return;
    
    setSaving(true);
    try {
      const newOptions = [...variantOptions];
      [newOptions[index], newOptions[index + 1]] = [newOptions[index + 1], newOptions[index]];
      
      await saveVariantOptionOrder(newOptions);
      setVariantOptions(newOptions);
      toast.success('Variant option order updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const saveVariantOptionOrder = async (order: string[]) => {
    if (!currentOrg) return;
    
    // Update org_variant_config table with new rank order
    const rank1 = order[0] || 'Color';
    const rank2 = order[1] || 'Size';
    
    const config = await upsertVariantConfig(currentOrg.id, { rank1, rank2 });
    setVariantConfig(config);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 md:space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Catalog Settings
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Manage categories and tags for your product catalog
        </p>
      </div>

      <Tabs defaultValue="categories" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="variants">Variants</TabsTrigger>
        </TabsList>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                Product Categories
              </CardTitle>
              <CardDescription>
                Add categories to organize your products. You can rename, reorder, or delete categories.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 md:p-6 pt-0">
              {/* Add new category */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add a new category"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  className="h-10"
                  disabled={saving}
                />
                <Button
                  onClick={addCategory}
                  disabled={saving || !newCategoryInput.trim()}
                  style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>

              {/* Categories list */}
              <div className="space-y-2">
                {categories.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: 'rgba(15,31,23,0.6)' }}>
                    No categories yet. Add your first category above.
                  </p>
                ) : (
                  categories.map((cat, index) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                    >
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: '#0F1F17' }}>
                          {cat.name}
                        </p>
                        <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
                          Used by {cat.product_count || 0} product{cat.product_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveCategoryUp(index)}
                          disabled={saving || index === 0}
                          title="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveCategoryDown(index)}
                          disabled={saving || index === categories.length - 1}
                          title="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditCategoryDialog({ 
                            open: true, 
                            categoryId: cat.id,
                            oldName: cat.name, 
                            newName: cat.name 
                          })}
                          disabled={saving}
                          title="Rename"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteCategoryDialog({
                              open: true,
                              categoryId: cat.id,
                              categoryName: cat.name,
                              usageCount: cat.product_count || 0,
                              action: 'cancel',
                              mergeTargetId: '',
                            })
                          }
                          disabled={saving}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="space-y-4">
          <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                Product Tags
              </CardTitle>
              <CardDescription>
                Add tags to label and filter your products. You can rename or delete tags.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 md:p-6 pt-0">
              {/* Add new tag */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add a new tag"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="h-10"
                  disabled={saving}
                />
                <Button
                  onClick={addTag}
                  disabled={saving || !newTagInput.trim()}
                  style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>

              {/* Tags list */}
              <div className="space-y-2">
                {tags.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: 'rgba(15,31,23,0.6)' }}>
                    No tags yet. Add your first tag above.
                  </p>
                ) : (
                  tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                    >
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: '#0F1F17' }}>
                          {tag.name}
                        </p>
                        <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
                          Used by {tag.product_count || 0} product{tag.product_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditTagDialog({ 
                            open: true, 
                            tagId: tag.id,
                            oldName: tag.name, 
                            newName: tag.name 
                          })}
                          disabled={saving}
                          title="Rename"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteTagDialog({
                              open: true,
                              tagId: tag.id,
                              tagName: tag.name,
                              usageCount: tag.product_count || 0,
                            })
                          }
                          disabled={saving}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variants Tab */}
        <TabsContent value="variants" className="space-y-4">
          <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                Variant Option Order
              </CardTitle>
              <CardDescription>
                Control the order of variant options (e.g., Color, Size) for inventory hierarchy display.
                This order determines how variants are grouped in the inventory page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 md:p-6 pt-0">
              {allVariantNames.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
                    No product variants found. Create products with variants to manage their display order.
                  </p>
                </div>
              ) : variantOptions.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
                    No variant options detected. Make sure your variants follow the format: "Option: Value / Option: Value"
                  </p>
                  <p className="text-xs mt-2" style={{ color: 'rgba(15,31,23,0.5)' }}>
                    Example: "Color: Orange / Size: M"
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-blue-900 mb-1">How this works:</p>
                    <ul className="text-blue-800 space-y-1 ml-4 list-disc">
                      <li>Rank 1 options appear first in inventory hierarchy</li>
                      <li>Rank 2 options appear nested under Rank 1</li>
                      <li>Drag to reorder using the up/down arrows</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    {variantOptions.map((option, index) => (
                      <div
                        key={option}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                      >
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium" style={{ color: '#0F1F17' }}>
                              {option}
                            </p>
                            <p className="text-xs" style={{ color: 'rgba(15,31,23,0.6)' }}>
                              Rank {index + 1}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveVariantOptionUp(index)}
                            disabled={saving || index === 0}
                            title="Move up"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveVariantOptionDown(index)}
                            disabled={saving || index === variantOptions.length - 1}
                            title="Move down"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-muted-foreground mt-4 p-3 bg-muted/30 rounded-lg">
                    <p className="font-medium mb-1">Detected from your products:</p>
                    <p>
                      Found {variantOptions.length} unique variant option{variantOptions.length !== 1 ? 's' : ''} across {allVariantNames.length} variant{allVariantNames.length !== 1 ? 's' : ''}.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Category Dialog */}
      <Dialog open={editCategoryDialog.open} onOpenChange={(open) => !saving && setEditCategoryDialog({ ...editCategoryDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Category</DialogTitle>
            <DialogDescription>
              Enter a new name for the category. All products using this category will be updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Category Name</Label>
              <Input
                value={editCategoryDialog.newName}
                onChange={(e) => setEditCategoryDialog({ ...editCategoryDialog, newName: e.target.value })}
                placeholder="Category name"
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditCategoryDialog({ open: false, categoryId: '', oldName: '', newName: '' })}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={renameCategory} disabled={saving || !editCategoryDialog.newName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <AlertDialog open={deleteCategoryDialog.open} onOpenChange={(open) => !saving && setDeleteCategoryDialog({ ...deleteCategoryDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCategoryDialog.usageCount > 0 ? (
                <>
                  This category is used by {deleteCategoryDialog.usageCount} product{deleteCategoryDialog.usageCount !== 1 ? 's' : ''}.
                  What would you like to do?
                </>
              ) : (
                'Are you sure you want to delete this category?'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {deleteCategoryDialog.usageCount > 0 && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Choose an action:</Label>
                <Select
                  value={deleteCategoryDialog.action}
                  onValueChange={(value: DeleteCategoryAction) =>
                    setDeleteCategoryDialog({ ...deleteCategoryDialog, action: value })
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cancel">Cancel</SelectItem>
                    <SelectItem value="delete">Delete anyway (remove from products)</SelectItem>
                    <SelectItem value="merge">Merge into another category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {deleteCategoryDialog.action === 'merge' && (
                <div className="space-y-2">
                  <Label>Select target category:</Label>
                  <Select
                    value={deleteCategoryDialog.mergeTargetId}
                    onValueChange={(value) =>
                      setDeleteCategoryDialog({ ...deleteCategoryDialog, mergeTargetId: value })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter(c => c.id !== deleteCategoryDialog.categoryId)
                        .map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteCategory();
              }}
              disabled={
                saving ||
                deleteCategoryDialog.action === 'cancel' ||
                (deleteCategoryDialog.action === 'merge' && !deleteCategoryDialog.mergeTargetId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteCategoryDialog.action === 'merge' ? 'Merge & Delete' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Tag Dialog */}
      <Dialog open={editTagDialog.open} onOpenChange={(open) => !saving && setEditTagDialog({ ...editTagDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Tag</DialogTitle>
            <DialogDescription>
              Enter a new name for the tag. All products using this tag will be updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Tag Name</Label>
              <Input
                value={editTagDialog.newName}
                onChange={(e) => setEditTagDialog({ ...editTagDialog, newName: e.target.value })}
                placeholder="Tag name"
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTagDialog({ open: false, tagId: '', oldName: '', newName: '' })}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={renameTag} disabled={saving || !editTagDialog.newName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tag Dialog */}
      <AlertDialog open={deleteTagDialog.open} onOpenChange={(open) => !saving && setDeleteTagDialog({ ...deleteTagDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTagDialog.usageCount > 0 ? (
                <>
                  This tag is used by {deleteTagDialog.usageCount} product{deleteTagDialog.usageCount !== 1 ? 's' : ''}.
                  The tag will be removed from all products.
                </>
              ) : (
                'Are you sure you want to delete this tag?'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteTag();
              }}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
