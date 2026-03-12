import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getEventAddons,
  addEventAddon,
  removeEventAddon,
  updateEventAddon,
  getProductsForAddonPicker,
} from '@/lib/api/event-addons';
import ProductForm from '@/pages/dashboard/products/ProductForm';

interface EventAddonsSectionProps {
  eventId: string;
  orgId: string;
}

export function EventAddonsSection({ eventId, orgId }: EventAddonsSectionProps) {
  const { toast } = useToast();
  const [addons, setAddons] = useState<
    Array<{
      id: string;
      product_id: string;
      is_required: boolean;
      sort_order: number;
      product: {
        id: string;
        title: string;
        type: string;
        base_price: number | null;
        variants: Array<{ id: string; name: string; price: number | null }>;
      };
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<
    Array<{
      id: string;
      title: string;
      type: string;
      base_price: number | null;
      variants: Array<{ id: string; name: string; price: number | null }>;
    }>
  >([]);

  const loadAddons = async () => {
    try {
      const data = await getEventAddons(eventId);
      setAddons(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadCatalog = async () => {
    try {
      const data = await getProductsForAddonPicker(orgId);
      setCatalogProducts(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    loadAddons();
  }, [eventId]);

  useEffect(() => {
    if (showAddDialog) loadCatalog();
  }, [showAddDialog]);

  const handleAddFromCatalog = async (productId: string, isRequired: boolean) => {
    try {
      await addEventAddon(eventId, productId, isRequired, addons.length);
      await loadAddons();
      setShowAddDialog(false);
      toast({ title: 'Add-on added' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemove = async (addonId: string) => {
    try {
      await removeEventAddon(addonId);
      await loadAddons();
      toast({ title: 'Add-on removed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleRequired = async (addonId: string, isRequired: boolean) => {
    try {
      await updateEventAddon(addonId, { is_required: isRequired });
      await loadAddons();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const alreadyAddedIds = new Set(addons.map((a) => a.product_id));
  const availableProducts = catalogProducts.filter((p) => !alreadyAddedIds.has(p.id));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
          Add-ons
        </h2>
        <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Products guests can add at checkout (e.g. merch, free t-shirt). Optional or required.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-3">
          {addons.length === 0 ? (
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center"
              style={{ borderColor: 'rgba(14,122,58,0.14)' }}
            >
              <p className="text-sm mb-3" style={{ color: 'rgba(15,31,23,0.72)' }}>
                No add-ons yet
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add from catalog
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowQuickCreate(true)}>
                  <Package className="h-4 w-4 mr-2" />
                  Quick create
                </Button>
              </div>
            </div>
          ) : (
            <>
              {addons.map((addon) => (
                <div
                  key={addon.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                  style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: '#0F1F17' }}>
                        {addon.product.title}
                      </span>
                      {addon.is_required && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {addon.product.variants.length > 1
                        ? `${addon.product.variants.length} variants`
                        : `HKD ${addon.product.base_price ?? 0}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={addon.is_required}
                        onCheckedChange={(c) => handleToggleRequired(addon.id, c === true)}
                      />
                      Required
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(addon.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add from catalog
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowQuickCreate(true)}>
                  <Package className="h-4 w-4 mr-2" />
                  Quick create
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Add from catalog dialog */}
      <AddFromCatalogDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        products={availableProducts}
        onSelect={handleAddFromCatalog}
      />

      {/* Quick create dialog */}
      <QuickCreateAddonDialog
        open={showQuickCreate}
        onOpenChange={setShowQuickCreate}
        eventId={eventId}
        addonsLength={addons.length}
        onCreated={async () => {
          await loadAddons();
          setShowQuickCreate(false);
        }}
      />
    </div>
  );
}

function AddFromCatalogDialog({
  open,
  onOpenChange,
  products,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Array<{
    id: string;
    title: string;
    type: string;
    base_price: number | null;
    variants: Array<{ id: string; name: string; price: number | null }>;
  }>;
  onSelect: (productId: string, isRequired: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [isRequired, setIsRequired] = useState(false);

  const handleAdd = () => {
    if (!selectedId) return;
    onSelect(selectedId, isRequired);
    setSelectedId('');
    setIsRequired(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add from catalog</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Product</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} {p.type === 'addon' && '(add-on only)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isRequired} onCheckedChange={(c) => setIsRequired(c === true)} />
            <span className="text-sm">Required (guest must select before checkout)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedId}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickCreateAddonDialog({
  open,
  onOpenChange,
  eventId,
  addonsLength,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  addonsLength: number;
  onCreated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [isRequired, setIsRequired] = useState(false);
  const [alsoShowInCatalog, setAlsoShowInCatalog] = useState(false);

  const handleSuccess = async (productId: string) => {
    try {
      await addEventAddon(eventId, productId, isRequired, addonsLength);
      await onCreated();
      toast({ title: 'Add-on created and added' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick create add-on</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isRequired} onCheckedChange={(c) => setIsRequired(c === true)} />
            <span className="text-sm">Required (guest must select before checkout)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={alsoShowInCatalog} onCheckedChange={(c) => setAlsoShowInCatalog(c === true)} />
            <span className="text-sm">Also show in product catalog</span>
          </label>
          <ProductForm
            embedded
            productType={alsoShowInCatalog ? 'physical' : 'addon'}
            onSuccess={handleSuccess}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
