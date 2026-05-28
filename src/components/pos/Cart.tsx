import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Minus, Plus, Trash2, ShoppingCart, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  variantLabel?: string;
  qty: number;
  unitPrice: number;
}

interface CartProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  onUpdateCart: (cart: CartItem[]) => void;
  activeWarehouseId: string | null;
  activeWarehouseName: string | null;
}

type PaymentMethod = 'cash' | 'fps' | 'payme' | 'card-log' | 'other';

export function Cart({ open, onOpenChange, cart, onUpdateCart, activeWarehouseId, activeWarehouseName }: CartProps) {
  const { toast } = useToast();
  const { currentOrg, user } = useAuth();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isCompleting, setIsCompleting] = useState(false);

  // Get stock for a variant/product in the active warehouse
  const getStockForItem = async (item: CartItem): Promise<number> => {
    if (!activeWarehouseId || !currentOrg?.id) return 0;
    
    const variantId = item.variantId || item.productId;
    const { data } = await supabase
      .from('inventory_items')
      .select('quantity')
      .eq('org_id', currentOrg.id)
      .eq('warehouse_id', activeWarehouseId)
      .eq('variant_id', variantId)
      .maybeSingle();
    
    return data?.quantity ?? 0;
  };

  const updateItemQty = async (index: number, delta: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    const newQty = Math.max(0, item.qty + delta);
    
    // If increasing quantity, check stock availability (strict stock mode for POS)
    if (delta > 0 && activeWarehouseId) {
      const availableStock = await getStockForItem(item);
      
      // Calculate remaining stock: available stock minus what's already in cart (excluding current item)
      const otherCartItemsQty = cart
        .filter((c, i) => i !== index && c.productId === item.productId && c.variantId === item.variantId)
        .reduce((sum, c) => sum + c.qty, 0);
      const remainingStock = availableStock - otherCartItemsQty;
      
      if (remainingStock === 0) {
        toast({
          title: 'Out of Stock',
          description: `${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} is out of stock`,
          variant: 'destructive',
        });
        return;
      }
      
      if (newQty > remainingStock) {
        toast({
          title: 'Insufficient Stock',
          description: `Only ${remainingStock} left in this warehouse`,
          variant: 'destructive',
        });
        return;
      }
    }
    
    if (newQty === 0) {
      newCart.splice(index, 1);
    } else {
      newCart[index] = { ...item, qty: newQty };
    }
    
    onUpdateCart(newCart);
  };

  const removeItem = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    onUpdateCart(newCart);
  };

  const clearCart = () => {
    onUpdateCart([]);
    toast({
      title: 'Cart cleared',
      description: 'All items have been removed from the cart',
    });
  };

  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
  const total = cart.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  const handleCompleteSale = async () => {
    if (!currentOrg?.id || !user?.id) {
      toast({
        title: 'Error',
        description: 'Organization or user not available',
        variant: 'destructive',
      });
      return;
    }

    if (!activeWarehouseId) {
      toast({
        title: 'Warehouse Required',
        description: 'Please select a warehouse in Settings',
        variant: 'destructive',
      });
      return;
    }

    if (cart.length === 0) {
      toast({
        title: 'Cart Empty',
        description: 'Please add items to the cart',
        variant: 'destructive',
      });
      return;
    }

    setIsCompleting(true);

    try {
      // Generate order number
      const orderNo = `POS-${Date.now().toString(36).toUpperCase()}`;

      // Create order with order_type='product'
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_type: 'product',
          host_org_id: currentOrg.id,
          buyer_user_id: user.id,
          total_amount: total,
          currency: 'HKD',
          status: 'paid',
          payment_status: 'paid',
          payment_method: paymentMethod,
          fulfillment_status: 'completed',
          order_no: orderNo,
          paid_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          metadata: {
            source: 'pos',
            warehouse_id: activeWarehouseId,
          },
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Get placeholder ticket_type for order_items (required by FK constraint)
      // TODO: Create migration to make ticket_type_id nullable for product orders or add product_id/variant_id columns
      const { data: placeholderTicketType } = await supabase
        .from('ticket_types')
        .select('id')
        .limit(1)
        .single();

      // Store product items for metadata fallback
      const productItems: any[] = [];

      // Create order_items and update inventory
      for (const item of cart) {
        // Find inventory_item for this variant+warehouse
        const { data: inventoryItems, error: invError } = await supabase
          .from('inventory_items')
          .select('id, quantity')
          .eq('org_id', currentOrg.id)
          .eq('warehouse_id', activeWarehouseId)
          .eq('variant_id', item.variantId || item.productId);

        if (invError) throw invError;

        const existingItem = inventoryItems?.[0];
        if (!existingItem) {
          throw new Error(`No inventory item found for ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} in selected warehouse`);
        }

        const currentQty = existingItem.quantity;
        const inventoryItemId = existingItem.id;

        // Check stock availability
        if (item.qty > currentQty) {
          throw new Error(`Insufficient stock for ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''}. Available: ${currentQty}, Requested: ${item.qty}`);
        }

        // Create order_item if placeholder ticket_type exists
        if (placeholderTicketType) {
          const { error: orderItemError } = await supabase
            .from('order_items')
            .insert({
              order_id: order.id,
              ticket_type_id: placeholderTicketType.id, // Placeholder - product info in metadata
              quantity: item.qty,
              unit_price: item.unitPrice,
              subtotal: item.qty * item.unitPrice,
              metadata: {
                product_id: item.productId,
                variant_id: item.variantId || null,
                product_name: item.name,
                variant_label: item.variantLabel || null,
                is_product_order: true,
              },
            } as any);

          if (orderItemError) throw orderItemError;
        }

        // Store item info for metadata fallback
        productItems.push({
          product_id: item.productId,
          variant_id: item.variantId || null,
          name: item.name,
          variant_label: item.variantLabel || null,
          quantity: item.qty,
          unit_price: item.unitPrice,
          subtotal: item.qty * item.unitPrice,
        });

        // Update inventory using adjust_stock RPC
        const { error: adjustError } = await supabase.rpc('adjust_stock', {
          p_inventory_item_id: inventoryItemId,
          p_delta: -item.qty,
          p_reason: 'sale',
          p_note: `POS sale - Order ${orderNo}`,
        });

        if (adjustError) throw adjustError;
      }

      // If no ticket_types exist, store product items in order metadata
      if (!placeholderTicketType && productItems.length > 0) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            metadata: {
              source: 'pos',
              warehouse_id: activeWarehouseId,
              product_items: productItems,
            },
          })
          .eq('id', order.id);

        if (updateError) throw updateError;
      }

      toast({
        title: 'Sale Recorded',
        description: `Order ${orderNo} completed successfully`,
      });

      // Clear cart and close
      onUpdateCart([]);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error completing sale:', err);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to complete sale',
        variant: 'destructive',
      });
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Cart ({totalQty} {totalQty === 1 ? 'item' : 'items'})
          </SheetTitle>
          <SheetDescription>
            Review your items and complete the sale
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Warehouse Info */}
          {activeWarehouseName && (
            <div className="p-3 rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
              <div className="text-sm font-medium" style={{ color: '#0F1F17' }}>
                Active Warehouse: {activeWarehouseName}
              </div>
              <button
                onClick={() => {
                  navigate('/app/settings');
                  onOpenChange(false);
                }}
                className="text-xs mt-1 underline" style={{ color: '#0E7A3A' }}
              >
                Change in Settings
              </button>
            </div>
          )}

          {/* Cart Items */}
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item, index) => (
                <div
                  key={`${item.productId}-${item.variantId || 'no-variant'}-${index}`}
                  className="p-4 rounded-lg border flex items-start justify-between gap-4"
                  style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.3)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium" style={{ color: '#0F1F17' }}>
                      {item.name}
                    </div>
                    {item.variantLabel && (
                      <div className="text-sm text-muted-foreground">
                        {item.variantLabel}
                      </div>
                    )}
                    <div className="text-sm font-semibold mt-1" style={{ color: '#0E7A3A' }}>
                      HK${item.unitPrice.toFixed(2)} each
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 border rounded-lg px-2 py-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateItemQty(index, -1)}
                        disabled={isCompleting}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.qty}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateItemQty(index, 1)}
                        disabled={isCompleting}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeItem(index)}
                      disabled={isCompleting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SheetFooter className="flex-col gap-4 sm:flex-row sm:justify-between border-t pt-4">
          <div className="w-full space-y-4">
            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} disabled={isCompleting || cart.length === 0}>
                <SelectTrigger id="payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="fps">FPS</SelectItem>
                  <SelectItem value="payme">PayMe</SelectItem>
                  <SelectItem value="card-log">Card (Log)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between text-lg font-semibold pt-2 border-t">
              <span style={{ color: '#0F1F17' }}>Total:</span>
              <span style={{ color: '#0E7A3A' }}>HK${total.toFixed(2)}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={clearCart}
                disabled={isCompleting || cart.length === 0}
                className="flex-1"
              >
                Clear Cart
              </Button>
              <Button
                onClick={handleCompleteSale}
                disabled={isCompleting || cart.length === 0 || !activeWarehouseId}
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
                className="flex-1"
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Complete Sale'
                )}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
