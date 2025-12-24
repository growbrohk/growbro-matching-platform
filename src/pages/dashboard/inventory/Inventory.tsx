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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, RefreshCw } from 'lucide-react';

type Warehouse = { id: string; org_id: string; name: string; address: string | null };
type Product = { id: string; org_id: string; title: string; type: string };
type Variant = { id: string; product_id: string; name: string; sku: string | null; price: number | null };
type InventoryItem = { id: string; org_id: string; warehouse_id: string; variant_id: string; quantity: number };

type EnrichedInventoryRow = InventoryItem & {
  warehouse?: Warehouse;
  product?: Product;
  variant?: Variant;
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

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [initialStock, setInitialStock] = useState<string>('0');

  const [adjustOpenFor, setAdjustOpenFor] = useState<EnrichedInventoryRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>('0');
  const [adjustReason, setAdjustReason] = useState<string>('adjustment');
  const [adjustNote, setAdjustNote] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const variantOptions = useMemo(() => {
    return variants.filter((v) => v.product_id === selectedProductId);
  }, [selectedProductId, variants]);

  const reload = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const { data: whData, error: whErr } = await supabase
        .from('warehouses')
        .select('id, org_id, name, address')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: true });
      if (whErr) throw whErr;

      const { data: productsData, error: productsErr } = await supabase
        .from('products')
        .select('id, org_id, title, type')
        .eq('org_id', currentOrg.id)
        .order('created_at', { ascending: false });
      if (productsErr) throw productsErr;

      const productIds = ((productsData as any[]) || []).map((p) => p.id);

      const { data: variantsData, error: variantsErr } = await supabase
        .from('product_variants')
        .select('id, product_id, name, sku, price')
        .in('product_id', productIds.length > 0 ? productIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: true });
      if (variantsErr) throw variantsErr;

      const { data: invData, error: invErr } = await supabase
        .from('inventory_items')
        .select('id, org_id, warehouse_id, variant_id, quantity')
        .eq('org_id', currentOrg.id)
        .order('updated_at', { ascending: false });
      if (invErr) throw invErr;

      const wh = (whData as any as Warehouse[]) || [];
      const prods = (productsData as any as Product[]) || [];
      const vars = (variantsData as any as Variant[]) || [];
      const inv = (invData as any as InventoryItem[]) || [];

      const whMap = new Map(wh.map((w) => [w.id, w]));
      const prodMap = new Map(prods.map((p) => [p.id, p]));
      const varMap = new Map(vars.map((v) => [v.id, v]));

      const enriched: EnrichedInventoryRow[] = inv.map((row) => {
        const v = varMap.get(row.variant_id);
        const p = v ? prodMap.get(v.product_id) : undefined;
        return {
          ...row,
          warehouse: whMap.get(row.warehouse_id),
          variant: v,
          product: p,
        };
      });

      setWarehouses(wh);
      setProducts(prods);
      setVariants(vars);
      setInventory(enriched);
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

  const createInventory = async () => {
    if (!currentOrg) return;
    if (!selectedWarehouseId || !selectedVariantId) {
      toast({ title: 'Validation', description: 'Select a warehouse and variant', variant: 'destructive' });
      return;
    }

    const qty = Number(initialStock);
    if (!Number.isFinite(qty) || qty < 0) {
      toast({ title: 'Validation', description: 'Initial stock must be a number >= 0', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error: rpcErr } = await (supabase as any).rpc('create_inventory_for_variant', {
        p_org_id: currentOrg.id,
        p_warehouse_id: selectedWarehouseId,
        p_variant_id: selectedVariantId,
        p_initial_stock: qty,
      });
      if (rpcErr) throw rpcErr;

      toast({ title: 'Success', description: 'Inventory item created' });
      setCreateOpen(false);
      setSelectedWarehouseId('');
      setSelectedProductId('');
      setSelectedVariantId('');
      setInitialStock('0');
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
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Inventory
          </h1>
          <p className="mt-1" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Warehouses & stock for {currentOrg?.name || 'your org'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: '#0E7A3A', color: 'white' }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Inventory
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create inventory for a variant</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Warehouse</Label>
                  <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
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
                </div>

                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select
                    value={selectedProductId}
                    onValueChange={(v) => {
                      setSelectedProductId(v);
                      setSelectedVariantId('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Variant</Label>
                  <Select value={selectedVariantId} onValueChange={setSelectedVariantId} disabled={!selectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedProductId ? 'Select variant' : 'Select product first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {variantOptions.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.sku ? ` (${v.sku})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Initial stock</Label>
                  <Input value={initialStock} onChange={(e) => setInitialStock(e.target.value)} />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={createInventory} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Warehouses ({warehouses.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {warehouses.length === 0 ? (
            <p className="text-muted-foreground">No warehouses found. (A default warehouse is created when the org is created.)</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-muted-foreground">{w.address || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock ({inventory.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {inventory.length === 0 ? (
            <p className="text-muted-foreground">No inventory yet. Use “Add Inventory” to set initial stock for a variant.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.product?.title || '—'}</TableCell>
                    <TableCell>{row.variant?.name || '—'}</TableCell>
                    <TableCell>{row.warehouse?.name || '—'}</TableCell>
                    <TableCell className="text-right font-semibold">{row.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setAdjustOpenFor(row)}>
                        Adjust
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}


