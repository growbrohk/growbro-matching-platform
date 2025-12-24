import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Edit, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

interface CategoryUsage {
  name: string;
  count: number;
}

interface TagUsage {
  name: string;
  count: number;
}

type DeleteCategoryAction = 'cancel' | 'delete' | 'merge';

export default function CatalogSettings() {
  const { currentOrg, refreshOrgMemberships } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Categories state
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryUsage, setCategoryUsage] = useState<CategoryUsage[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  
  // Tags state
  const [tags, setTags] = useState<string[]>([]);
  const [tagUsage, setTagUsage] = useState<TagUsage[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  
  // Edit dialogs
  const [editCategoryDialog, setEditCategoryDialog] = useState<{ open: boolean; oldName: string; newName: string }>({
    open: false,
    oldName: '',
    newName: '',
  });
  const [editTagDialog, setEditTagDialog] = useState<{ open: boolean; oldName: string; newName: string }>({
    open: false,
    oldName: '',
    newName: '',
  });
  
  // Delete dialogs
  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState<{
    open: boolean;
    categoryName: string;
    usageCount: number;
    action: DeleteCategoryAction;
    mergeTarget: string;
  }>({
    open: false,
    categoryName: '',
    usageCount: 0,
    action: 'cancel',
    mergeTarget: '',
  });
  const [deleteTagDialog, setDeleteTagDialog] = useState<{ open: boolean; tagName: string; usageCount: number }>({
    open: false,
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
      // Load org metadata
      const { data: orgData, error: orgError } = await supabase
        .from('orgs')
        .select('metadata')
        .eq('id', currentOrg.id)
        .single();
      
      if (orgError) throw orgError;
      
      const metadata = (orgData.metadata as any) || {};
      const catalogMeta = metadata.catalog || {};
      
      setCategories(Array.isArray(catalogMeta.categories) ? catalogMeta.categories : []);
      setTags(Array.isArray(catalogMeta.tags) ? catalogMeta.tags : []);
      
      // Load usage counts
      await loadUsageCounts();
    } catch (error: any) {
      console.error('Error loading catalog settings:', error);
      toast.error(error.message || 'Failed to load catalog settings');
    } finally {
      setLoading(false);
    }
  };

  const loadUsageCounts = async () => {
    if (!currentOrg) return;
    
    try {
      // Get all products for this org
      const { data: products, error } = await supabase
        .from('products')
        .select('metadata')
        .eq('org_id', currentOrg.id);
      
      if (error) throw error;
      
      // Count category usage
      const catCounts = new Map<string, number>();
      const tagCounts = new Map<string, number>();
      
      products?.forEach((p: any) => {
        const meta = p.metadata || {};
        
        // Count categories
        if (meta.category && typeof meta.category === 'string') {
          catCounts.set(meta.category, (catCounts.get(meta.category) || 0) + 1);
        }
        
        // Count tags
        if (Array.isArray(meta.tags)) {
          meta.tags.forEach((tag: string) => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
        }
      });
      
      // Convert to arrays with usage counts
      const catUsage: CategoryUsage[] = categories.map(cat => ({
        name: cat,
        count: catCounts.get(cat) || 0,
      }));
      
      const tagUsageArr: TagUsage[] = tags.map(tag => ({
        name: tag,
        count: tagCounts.get(tag) || 0,
      }));
      
      setCategoryUsage(catUsage);
      setTagUsage(tagUsageArr);
    } catch (error: any) {
      console.error('Error loading usage counts:', error);
    }
  };

  // Category functions
  const addCategory = async () => {
    if (!currentOrg || !newCategoryInput.trim()) return;
    
    const newCat = newCategoryInput.trim();
    if (categories.includes(newCat)) {
      toast.error('Category already exists');
      return;
    }
    
    setSaving(true);
    try {
      const updatedCategories = [...categories, newCat].sort();
      await updateOrgMetadata({ categories: updatedCategories, tags });
      
      setCategories(updatedCategories);
      setCategoryUsage([...categoryUsage, { name: newCat, count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryInput('');
      toast.success('Category added');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add category');
    } finally {
      setSaving(false);
    }
  };

  const renameCategory = async () => {
    if (!currentOrg || !editCategoryDialog.newName.trim()) return;
    
    const oldName = editCategoryDialog.oldName;
    const newName = editCategoryDialog.newName.trim();
    
    if (oldName === newName) {
      setEditCategoryDialog({ open: false, oldName: '', newName: '' });
      return;
    }
    
    if (categories.includes(newName)) {
      toast.error('Category already exists');
      return;
    }
    
    setSaving(true);
    try {
      // Update org metadata
      const updatedCategories = categories.map(c => c === oldName ? newName : c).sort();
      await updateOrgMetadata({ categories: updatedCategories, tags });
      
      // Bulk update products
      const { data: productsToUpdate, error: fetchError } = await supabase
        .from('products')
        .select('id, metadata')
        .eq('org_id', currentOrg.id);
      
      if (fetchError) throw fetchError;
      
      const updates = productsToUpdate
        ?.filter((p: any) => p.metadata?.category === oldName)
        .map((p: any) => ({
          id: p.id,
          metadata: { ...p.metadata, category: newName },
        })) || [];
      
      if (updates.length > 0) {
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('products')
            .update({ metadata: update.metadata })
            .eq('id', update.id);
          
          if (updateError) throw updateError;
        }
      }
      
      setCategories(updatedCategories);
      setEditCategoryDialog({ open: false, oldName: '', newName: '' });
      await loadUsageCounts();
      toast.success(`Category renamed (${updates.length} products updated)`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to rename category');
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async () => {
    if (!currentOrg || !deleteCategoryDialog.categoryName) return;
    
    const { categoryName, action, mergeTarget } = deleteCategoryDialog;
    
    if (action === 'cancel') {
      setDeleteCategoryDialog({ open: false, categoryName: '', usageCount: 0, action: 'cancel', mergeTarget: '' });
      return;
    }
    
    setSaving(true);
    try {
      // Update org metadata
      const updatedCategories = categories.filter(c => c !== categoryName);
      await updateOrgMetadata({ categories: updatedCategories, tags });
      
      // Bulk update products
      const { data: productsToUpdate, error: fetchError } = await supabase
        .from('products')
        .select('id, metadata')
        .eq('org_id', currentOrg.id);
      
      if (fetchError) throw fetchError;
      
      const updates = productsToUpdate
        ?.filter((p: any) => p.metadata?.category === categoryName)
        .map((p: any) => ({
          id: p.id,
          metadata: {
            ...p.metadata,
            category: action === 'merge' ? mergeTarget : null,
          },
        })) || [];
      
      if (updates.length > 0) {
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('products')
            .update({ metadata: update.metadata })
            .eq('id', update.id);
          
          if (updateError) throw updateError;
        }
      }
      
      setCategories(updatedCategories);
      setDeleteCategoryDialog({ open: false, categoryName: '', usageCount: 0, action: 'cancel', mergeTarget: '' });
      await loadUsageCounts();
      
      const actionText = action === 'merge' ? `merged into "${mergeTarget}"` : 'removed from products';
      toast.success(`Category deleted (${updates.length} products ${actionText})`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete category');
    } finally {
      setSaving(false);
    }
  };

  // Tag functions
  const addTag = async () => {
    if (!currentOrg || !newTagInput.trim()) return;
    
    const newTag = newTagInput.trim();
    if (tags.includes(newTag)) {
      toast.error('Tag already exists');
      return;
    }
    
    setSaving(true);
    try {
      const updatedTags = [...tags, newTag].sort();
      await updateOrgMetadata({ categories, tags: updatedTags });
      
      setTags(updatedTags);
      setTagUsage([...tagUsage, { name: newTag, count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagInput('');
      toast.success('Tag added');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add tag');
    } finally {
      setSaving(false);
    }
  };

  const renameTag = async () => {
    if (!currentOrg || !editTagDialog.newName.trim()) return;
    
    const oldName = editTagDialog.oldName;
    const newName = editTagDialog.newName.trim();
    
    if (oldName === newName) {
      setEditTagDialog({ open: false, oldName: '', newName: '' });
      return;
    }
    
    if (tags.includes(newName)) {
      toast.error('Tag already exists');
      return;
    }
    
    setSaving(true);
    try {
      // Update org metadata
      const updatedTags = tags.map(t => t === oldName ? newName : t).sort();
      await updateOrgMetadata({ categories, tags: updatedTags });
      
      // Bulk update products
      const { data: productsToUpdate, error: fetchError } = await supabase
        .from('products')
        .select('id, metadata')
        .eq('org_id', currentOrg.id);
      
      if (fetchError) throw fetchError;
      
      const updates = productsToUpdate
        ?.filter((p: any) => Array.isArray(p.metadata?.tags) && p.metadata.tags.includes(oldName))
        .map((p: any) => ({
          id: p.id,
          metadata: {
            ...p.metadata,
            tags: p.metadata.tags.map((t: string) => t === oldName ? newName : t),
          },
        })) || [];
      
      if (updates.length > 0) {
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('products')
            .update({ metadata: update.metadata })
            .eq('id', update.id);
          
          if (updateError) throw updateError;
        }
      }
      
      setTags(updatedTags);
      setEditTagDialog({ open: false, oldName: '', newName: '' });
      await loadUsageCounts();
      toast.success(`Tag renamed (${updates.length} products updated)`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to rename tag');
    } finally {
      setSaving(false);
    }
  };

  const deleteTag = async () => {
    if (!currentOrg || !deleteTagDialog.tagName) return;
    
    const tagName = deleteTagDialog.tagName;
    
    setSaving(true);
    try {
      // Update org metadata
      const updatedTags = tags.filter(t => t !== tagName);
      await updateOrgMetadata({ categories, tags: updatedTags });
      
      // Bulk update products
      const { data: productsToUpdate, error: fetchError } = await supabase
        .from('products')
        .select('id, metadata')
        .eq('org_id', currentOrg.id);
      
      if (fetchError) throw fetchError;
      
      const updates = productsToUpdate
        ?.filter((p: any) => Array.isArray(p.metadata?.tags) && p.metadata.tags.includes(tagName))
        .map((p: any) => ({
          id: p.id,
          metadata: {
            ...p.metadata,
            tags: p.metadata.tags.filter((t: string) => t !== tagName),
          },
        })) || [];
      
      if (updates.length > 0) {
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('products')
            .update({ metadata: update.metadata })
            .eq('id', update.id);
          
          if (updateError) throw updateError;
        }
      }
      
      setTags(updatedTags);
      setDeleteTagDialog({ open: false, tagName: '', usageCount: 0 });
      await loadUsageCounts();
      toast.success(`Tag deleted (removed from ${updates.length} products)`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete tag');
    } finally {
      setSaving(false);
    }
  };

  const updateOrgMetadata = async (catalog: { categories: string[]; tags: string[] }) => {
    if (!currentOrg) return;
    
    const { data: orgData, error: fetchError } = await supabase
      .from('orgs')
      .select('metadata')
      .eq('id', currentOrg.id)
      .single();
    
    if (fetchError) throw fetchError;
    
    const existingMetadata = (orgData.metadata as any) || {};
    const updatedMetadata = {
      ...existingMetadata,
      catalog,
    };
    
    const { error: updateError } = await supabase
      .from('orgs')
      .update({ metadata: updatedMetadata })
      .eq('id', currentOrg.id);
    
    if (updateError) throw updateError;
    
    await refreshOrgMemberships();
  };

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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
        </TabsList>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-lg" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
                Product Categories
              </CardTitle>
              <CardDescription>
                Add categories to organize your products. You can rename or delete categories.
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
                {categoryUsage.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: 'rgba(15,31,23,0.6)' }}>
                    No categories yet. Add your first category above.
                  </p>
                ) : (
                  categoryUsage.map((cat) => (
                    <div
                      key={cat.name}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                    >
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: '#0F1F17' }}>
                          {cat.name}
                        </p>
                        <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
                          Used by {cat.count} product{cat.count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditCategoryDialog({ open: true, oldName: cat.name, newName: cat.name })}
                          disabled={saving}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteCategoryDialog({
                              open: true,
                              categoryName: cat.name,
                              usageCount: cat.count,
                              action: 'cancel',
                              mergeTarget: '',
                            })
                          }
                          disabled={saving}
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
                {tagUsage.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: 'rgba(15,31,23,0.6)' }}>
                    No tags yet. Add your first tag above.
                  </p>
                ) : (
                  tagUsage.map((tag) => (
                    <div
                      key={tag.name}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                    >
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: '#0F1F17' }}>
                          {tag.name}
                        </p>
                        <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
                          Used by {tag.count} product{tag.count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditTagDialog({ open: true, oldName: tag.name, newName: tag.name })}
                          disabled={saving}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteTagDialog({
                              open: true,
                              tagName: tag.name,
                              usageCount: tag.count,
                            })
                          }
                          disabled={saving}
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
              onClick={() => setEditCategoryDialog({ open: false, oldName: '', newName: '' })}
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
                    value={deleteCategoryDialog.mergeTarget}
                    onValueChange={(value) =>
                      setDeleteCategoryDialog({ ...deleteCategoryDialog, mergeTarget: value })
                    }
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter(c => c !== deleteCategoryDialog.categoryName)
                        .map(cat => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
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
                deleteCategory();
              }}
              disabled={
                saving ||
                deleteCategoryDialog.action === 'cancel' ||
                (deleteCategoryDialog.action === 'merge' && !deleteCategoryDialog.mergeTarget)
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
              onClick={() => setEditTagDialog({ open: false, oldName: '', newName: '' })}
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
                deleteTag();
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

