import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Minus, Plus, Trash2, ShoppingCart, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PricingOverrideFields } from '@/components/pricing/PricingOverrideFields';
import { CheckoutDeliverySection } from '@/components/checkout/CheckoutDeliverySection';
import { CheckoutContactSection } from '@/components/checkout/CheckoutContactSection';
import { CheckoutOrderSummary } from '@/components/checkout/CheckoutOrderSummary';
import {
  type CreateProductOrderDelivery,
  type ProductDeliveryMethod,
} from '@/lib/api/product-checkout';
import type { ContactInfo } from '@/lib/types/booking';
import {
  computeShippingTotals,
  kgPerUnitForCartLine,
  parseShippingWeightKgFromMeta,
} from '@/lib/checkout/shipping';
import { resolveDiscountedPriceFromStrings, roundMoney } from '@/lib/pricing';

export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  variantLabel?: string;
  qty: number;
  /** Catalog unit price before POS override/discount. */
  unitPrice: number;
  priceOverride?: string | null;
  discountPercent?: string | null;
  imageUrl?: string | null;
  weightKgPerUnit?: number;
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function effectiveUnitPrice(item: CartItem): number {
  return roundMoney(
    resolveDiscountedPriceFromStrings(
      item.unitPrice,
      item.priceOverride,
      item.discountPercent
    )
  );
}

function lineSubtotal(item: CartItem): number {
  return roundMoney(effectiveUnitPrice(item) * item.qty);
}

export function Cart({ open, onOpenChange, cart, onUpdateCart, activeWarehouseId, activeWarehouseName }: CartProps) {
  const { toast } = useToast();
  const { currentOrg, user } = useAuth();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isCompleting, setIsCompleting] = useState(false);
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [deliveryMethod, setDeliveryMethod] = useState<ProductDeliveryMethod>('event_pickup');
  const [doorCountry, setDoorCountry] = useState('Hong Kong (SAR)');
  const [doorBuilding, setDoorBuilding] = useState('');
  const [doorStreet, setDoorStreet] = useState('');
  const [doorRegion, setDoorRegion] = useState('');
  const [doorDistrict, setDoorDistrict] = useState('');
  const [sfLockerAddress, setSfLockerAddress] = useState('');
  const [sfLockerCode, setSfLockerCode] = useState('');
  const [weightByProductId, setWeightByProductId] = useState<Record<string, number>>({});

  const cartProductKey = useMemo(() => cart.map((c) => c.productId).sort().join(','), [cart]);

  useEffect(() => {
    if (!currentOrg?.id || cart.length === 0) {
      setWeightByProductId({});
      return;
    }
    const needIds = [
      ...new Set(
        cart
          .filter((c) => c.weightKgPerUnit == null || !Number.isFinite(c.weightKgPerUnit))
          .map((c) => c.productId),
      ),
    ];
    if (needIds.length === 0) {
      setWeightByProductId({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, metadata')
          .eq('org_id', currentOrg.id)
          .in('id', needIds);
        if (cancelled || error || !data) return;
        const map: Record<string, number> = {};
        for (const row of data) {
          map[row.id as string] = parseShippingWeightKgFromMeta(row.metadata);
        }
        if (!cancelled) setWeightByProductId(map);
      } catch {
        if (!cancelled) setWeightByProductId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentOrg?.id, cartProductKey, cart]);

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

    if (delta > 0 && activeWarehouseId) {
      const availableStock = await getStockForItem(item);
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

  const updateItemPricing = (
    index: number,
    patch: Partial<Pick<CartItem, 'priceOverride' | 'discountPercent'>>
  ) => {
    const newCart = [...cart];
    newCart[index] = { ...newCart[index], ...patch };
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
  const catalogSubtotal = cart.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const subtotal = cart.reduce((sum, item) => sum + lineSubtotal(item), 0);
  const discountTotal = roundMoney(Math.max(0, catalogSubtotal - subtotal));

  const totalShippingKg = useMemo(
    () => cart.reduce((s, item) => s + item.qty * kgPerUnitForCartLine(item, weightByProductId), 0),
    [cart, weightByProductId],
  );

  const { billableShippingKg, shippingRatePerKg, shippingFee, showActualShippingWeight } = useMemo(
    () => computeShippingTotals(deliveryMethod, totalShippingKg),
    [deliveryMethod, totalShippingKg],
  );

  const grandTotal = subtotal + shippingFee;

  const buildDeliveryPayload = (): CreateProductOrderDelivery => {
    if (deliveryMethod === 'door') {
      return {
        delivery_method: 'door',
        delivery_details: {
          country: doorCountry.trim() || undefined,
          building: doorBuilding.trim(),
          street: doorStreet.trim(),
          region: doorRegion.trim() || undefined,
          district: doorDistrict.trim() || undefined,
        },
      };
    }
    if (deliveryMethod === 'sf_locker') {
      return {
        delivery_method: 'sf_locker',
        delivery_details: {
          sf_locker_address: sfLockerAddress.trim(),
          sf_locker_code: sfLockerCode.trim(),
        },
      };
    }
    return {
      delivery_method: 'event_pickup',
      delivery_details: {},
    };
  };

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

    if (!contactInfo.firstName?.trim()) {
      toast({
        title: 'Contact info required',
        description: 'Please enter a first name',
        variant: 'destructive',
      });
      return;
    }

    if (contactInfo.email?.trim() && !isValidEmail(contactInfo.email)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address or leave it blank',
        variant: 'destructive',
      });
      return;
    }

    if (deliveryMethod === 'door') {
      if (!doorBuilding.trim() || !doorStreet.trim()) {
        toast({
          title: 'Address required',
          description: 'Please enter building and street for door delivery',
          variant: 'destructive',
        });
        return;
      }
    } else if (deliveryMethod === 'sf_locker') {
      if (!sfLockerAddress.trim() || !sfLockerCode.trim()) {
        toast({
          title: 'Locker details required',
          description: 'Please enter SF locker address and code',
          variant: 'destructive',
        });
        return;
      }
    }

    if (deliveryMethod !== 'event_pickup' && totalShippingKg <= 0) {
      toast({
        title: 'Shipping weight missing',
        description:
          'Each product needs a shipping weight (kg) in the catalog for this delivery option.',
        variant: 'destructive',
      });
      return;
    }

    const delivery = buildDeliveryPayload();
    const fulfillmentStatus =
      deliveryMethod === 'event_pickup' ? 'confirmed' : 'pending_confirmation';

    setIsCompleting(true);

    try {
      const orderNo = `POS-${Date.now().toString(36).toUpperCase()}`;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_type: 'product',
          host_org_id: currentOrg.id,
          buyer_user_id: user.id,
          buyer_first_name: contactInfo.firstName.trim() || null,
          buyer_last_name: contactInfo.lastName.trim() || null,
          buyer_email: contactInfo.email.trim() ? contactInfo.email.trim().toLowerCase() : null,
          buyer_phone: contactInfo.phone.trim() || null,
          total_amount: grandTotal,
          currency: 'HKD',
          status: 'paid',
          payment_status: 'paid',
          payment_method: paymentMethod,
          fulfillment_status: fulfillmentStatus,
          order_no: orderNo,
          paid_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          metadata: {
            source: 'pos',
            warehouse_id: activeWarehouseId,
            catalog_subtotal: catalogSubtotal,
            discount_total: discountTotal > 0 ? discountTotal : undefined,
            delivery_method: delivery.delivery_method,
            delivery_details: delivery.delivery_details,
            shipping_fee: shippingFee > 0 ? shippingFee : undefined,
          },
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      const { data: placeholderTicketType, error: ticketTypeError } = await supabase
        .from('ticket_types')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (ticketTypeError) throw ticketTypeError;

      const productItems: Array<Record<string, unknown>> = [];

      for (const item of cart) {
        const unitPrice = effectiveUnitPrice(item);
        const lineTotal = lineSubtotal(item);
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

        if (item.qty > existingItem.quantity) {
          throw new Error(`Insufficient stock for ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''}. Available: ${existingItem.quantity}, Requested: ${item.qty}`);
        }

        if (placeholderTicketType) {
          const { error: orderItemError } = await supabase
            .from('order_items')
            .insert({
              order_id: order.id,
              ticket_type_id: placeholderTicketType.id,
              quantity: item.qty,
              unit_price: unitPrice,
              subtotal: lineTotal,
              metadata: {
                product_id: item.productId,
                variant_id: item.variantId || null,
                product_name: item.name,
                variant_label: item.variantLabel || null,
                is_product_order: true,
                catalog_unit_price: item.unitPrice,
                price_override: item.priceOverride?.trim() ? parseFloat(item.priceOverride) : null,
                discount_percent: item.discountPercent?.trim()
                  ? parseFloat(item.discountPercent)
                  : null,
              },
            } as Record<string, unknown>);

          if (orderItemError) throw orderItemError;
        }

        productItems.push({
          product_id: item.productId,
          variant_id: item.variantId || null,
          name: item.name,
          variant_label: item.variantLabel || null,
          quantity: item.qty,
          catalog_unit_price: item.unitPrice,
          unit_price: unitPrice,
          subtotal: lineTotal,
          price_override: item.priceOverride?.trim() ? parseFloat(item.priceOverride) : null,
          discount_percent: item.discountPercent?.trim() ? parseFloat(item.discountPercent) : null,
        });

        const { error: adjustError } = await supabase.rpc('adjust_stock', {
          p_inventory_item_id: existingItem.id,
          p_delta: -item.qty,
          p_reason: 'sale',
          p_note: `POS sale - Order ${orderNo}`,
        });

        if (adjustError) throw adjustError;
      }

      if (!placeholderTicketType && productItems.length > 0) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            metadata: {
              source: 'pos',
              warehouse_id: activeWarehouseId,
              catalog_subtotal: catalogSubtotal,
              discount_total: discountTotal > 0 ? discountTotal : undefined,
              delivery_method: delivery.delivery_method,
              delivery_details: delivery.delivery_details,
              shipping_fee: shippingFee > 0 ? shippingFee : undefined,
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

      onUpdateCart([]);
      setContactInfo({ firstName: '', lastName: '', email: '', phone: '' });
      setDeliveryMethod('event_pickup');
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('Error completing sale:', err);
      const description =
        err instanceof Error
          ? err.message
          : typeof err === 'object' &&
              err !== null &&
              'message' in err &&
              typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Failed to complete sale';
      toast({
        title: 'Error',
        description,
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
                className="text-xs mt-1 underline"
                style={{ color: '#0E7A3A' }}
              >
                Change in Settings
              </button>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Cart is empty</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {cart.map((item, index) => {
                  const effective = effectiveUnitPrice(item);
                  const hasDiscount = effective < item.unitPrice;
                  return (
                    <div
                      key={`${item.productId}-${item.variantId || 'no-variant'}-${index}`}
                      className="p-4 rounded-lg border space-y-3"
                      style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.3)' }}
                    >
                      <div className="flex items-start gap-3">
                        {item.imageUrl && (
                          <div
                            className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-muted border"
                            style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                          >
                            <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium" style={{ color: '#0F1F17' }}>
                              {item.name}
                            </div>
                            {item.variantLabel && (
                              <div className="text-sm text-muted-foreground">{item.variantLabel}</div>
                            )}
                            <div className="text-sm mt-1" style={{ color: '#0E7A3A' }}>
                              {hasDiscount ? (
                                <>
                                  <span className="line-through text-muted-foreground mr-2">
                                    HK${item.unitPrice.toFixed(2)}
                                  </span>
                                  <span className="font-semibold">HK${effective.toFixed(2)} each</span>
                                </>
                              ) : (
                                <span className="font-semibold">HK${item.unitPrice.toFixed(2)} each</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Line total: HK${lineSubtotal(item).toFixed(2)}
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
                      </div>
                      <div onPointerDown={(e) => e.stopPropagation()}>
                        <PricingOverrideFields
                          priceOverride={item.priceOverride ?? ''}
                          discountPercent={item.discountPercent ?? ''}
                          onPriceOverrideChange={(value) =>
                            updateItemPricing(index, {
                              priceOverride: value || null,
                              ...(value.trim() ? { discountPercent: null } : {}),
                            })
                          }
                          onDiscountPercentChange={(value) =>
                            updateItemPricing(index, {
                              discountPercent: value || null,
                              ...(value.trim() ? { priceOverride: null } : {}),
                            })
                          }
                          currencyLabel="HK$"
                          disabled={isCompleting}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <CheckoutDeliverySection
                deliveryMethod={deliveryMethod}
                onDeliveryMethodChange={setDeliveryMethod}
                doorCountry={doorCountry}
                onDoorCountryChange={setDoorCountry}
                doorBuilding={doorBuilding}
                onDoorBuildingChange={setDoorBuilding}
                doorStreet={doorStreet}
                onDoorStreetChange={setDoorStreet}
                doorRegion={doorRegion}
                onDoorRegionChange={setDoorRegion}
                doorDistrict={doorDistrict}
                onDoorDistrictChange={setDoorDistrict}
                sfLockerAddress={sfLockerAddress}
                onSfLockerAddressChange={setSfLockerAddress}
                sfLockerCode={sfLockerCode}
                onSfLockerCodeChange={setSfLockerCode}
                idPrefix="pos-cart"
              />

              <CheckoutContactSection
                contactInfo={contactInfo}
                onUpdate={setContactInfo}
                requiredFields={{ firstName: true, lastName: false, email: false, phone: false }}
                description="First name required; other fields optional"
              />

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                  disabled={isCompleting}
                >
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

              <CheckoutOrderSummary
                subtotal={subtotal}
                deliveryMethod={deliveryMethod}
                shippingFee={shippingFee}
                billableShippingKg={billableShippingKg}
                shippingRatePerKg={shippingRatePerKg}
                totalShippingKg={totalShippingKg}
                showActualShippingWeight={showActualShippingWeight}
                discountTotal={discountTotal}
                catalogSubtotal={catalogSubtotal}
                compact
              />
            </>
          )}
        </div>

        <SheetFooter className="flex-col gap-4 sm:flex-row sm:justify-between border-t pt-4">
          <div className="flex gap-2 w-full">
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
                `Complete Sale – HK$${grandTotal.toFixed(2)}`
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
