/**
 * Reusable payment method selector (Stripe, PayMe, FPS)
 * Used by event PaymentPage and product ProductPaymentPage
 */

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CreditCard, Smartphone, QrCode, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';

const BRAND = {
  green: '#0E7A3A',
  dark: '#0F1F17',
};

export type PaymentMethod = 'stripe' | 'payme' | 'fps';

export interface PaymentMethodSelectorProps {
  availableMethods: PaymentMethod[];
  selectedMethod: PaymentMethod | null;
  onSelect: (method: PaymentMethod | null) => void;
  receiptFile: File | null;
  onReceiptChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  paymentLinks: { payme?: string | null; fps?: string | null };
  isCompressing?: boolean;
}

export function PaymentMethodSelector({
  availableMethods,
  selectedMethod,
  onSelect,
  receiptFile,
  onReceiptChange,
  paymentLinks,
  isCompressing = false,
}: PaymentMethodSelectorProps) {
  const selectMethod = (method: PaymentMethod) => {
    onSelect(method);
  };

  if (availableMethods.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            No payment methods are currently available. Please contact the seller.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="font-semibold mb-4" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
          Payment methods
        </h2>
        <RadioGroup
          value={selectedMethod || ''}
          onValueChange={(value) => selectMethod(value as PaymentMethod)}
        >
          <div className="space-y-3">
            {availableMethods.includes('stripe') && (
              <div>
                <Collapsible
                  open={selectedMethod === 'stripe'}
                  onOpenChange={(open) => {
                    if (!open && selectedMethod === 'stripe') {
                      onSelect(null);
                    }
                  }}
                >
                  <CollapsibleTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2"
                      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectMethod('stripe');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          selectMethod('stripe');
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="stripe" id="stripe" onClick={(e) => e.stopPropagation()} />
                        <label htmlFor="stripe" className="flex items-center gap-3 cursor-pointer flex-1">
                          <CreditCard className="h-5 w-5" style={{ color: BRAND.green }} />
                          <span className="font-medium" style={{ fontFamily: "'Inter Tight', sans-serif" }}>Credit Card</span>
                        </label>
                      </div>
                      {selectedMethod === 'stripe' ? (
                        <ChevronUp className="h-4 w-4" style={{ color: BRAND.green }} />
                      ) : (
                        <ChevronDown className="h-4 w-4" style={{ color: BRAND.green }} />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 px-4 pb-4">
                    <p className="text-sm text-muted-foreground">
                      You will be redirected to complete payment securely.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {availableMethods.includes('payme') && (
              <div>
                <Collapsible
                  open={selectedMethod === 'payme'}
                  onOpenChange={(open) => {
                    if (!open && selectedMethod === 'payme') {
                      onSelect(null);
                    }
                  }}
                >
                  <CollapsibleTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2"
                      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectMethod('payme');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          selectMethod('payme');
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="payme" id="payme" onClick={(e) => e.stopPropagation()} />
                        <label htmlFor="payme" className="flex items-center gap-3 cursor-pointer flex-1">
                          <Smartphone className="h-5 w-5" style={{ color: BRAND.green }} />
                          <div className="flex flex-col">
                            <span className="font-medium" style={{ fontFamily: "'Inter Tight', sans-serif" }}>PayMe</span>
                            <span className="text-xs text-muted-foreground">Upload Payme Receipt after successful payment</span>
                          </div>
                        </label>
                      </div>
                      {selectedMethod === 'payme' ? (
                        <ChevronUp className="h-4 w-4" style={{ color: BRAND.green }} />
                      ) : (
                        <ChevronDown className="h-4 w-4" style={{ color: BRAND.green }} />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 px-4 pb-4 space-y-4">
                    {paymentLinks.payme && (
                      <div>
                        <Label className="text-sm font-medium mb-2 block">PayMe Payment Link</Label>
                        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                          <span className="flex-1 text-sm truncate">{paymentLinks.payme}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(paymentLinks.payme!, '_blank');
                            }}
                            style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="payme-receipt" className="text-sm font-medium mb-2 block">
                        Upload receipt
                      </Label>
                      <Input
                        id="payme-receipt"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={onReceiptChange}
                        className="cursor-pointer"
                        style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                        disabled={isCompressing}
                      />
                      {isCompressing && (
                        <p className="text-xs text-muted-foreground mt-1">Compressing image...</p>
                      )}
                      {receiptFile && selectedMethod === 'payme' && !isCompressing && (
                        <p className="text-xs text-muted-foreground mt-1">Selected: {receiptFile.name}</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {availableMethods.includes('fps') && (
              <div>
                <Collapsible
                  open={selectedMethod === 'fps'}
                  onOpenChange={(open) => {
                    if (!open && selectedMethod === 'fps') {
                      onSelect(null);
                    }
                  }}
                >
                  <CollapsibleTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2"
                      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectMethod('fps');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          selectMethod('fps');
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="fps" id="fps" onClick={(e) => e.stopPropagation()} />
                        <label htmlFor="fps" className="flex items-center gap-3 cursor-pointer flex-1">
                          <QrCode className="h-5 w-5" style={{ color: BRAND.green }} />
                          <div className="flex flex-col">
                            <span className="font-medium" style={{ fontFamily: "'Inter Tight', sans-serif" }}>FPS</span>
                            <span className="text-xs text-muted-foreground">Upload FPS Receipt/Capscreen after successful payment</span>
                          </div>
                        </label>
                      </div>
                      {selectedMethod === 'fps' ? (
                        <ChevronUp className="h-4 w-4" style={{ color: BRAND.green }} />
                      ) : (
                        <ChevronDown className="h-4 w-4" style={{ color: BRAND.green }} />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 px-4 pb-4 space-y-4">
                    {paymentLinks.fps && (
                      <div>
                        <Label className="text-sm font-medium mb-2 block">FPS Payment Link</Label>
                        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                          <span className="flex-1 text-sm truncate">{paymentLinks.fps}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(paymentLinks.fps!, '_blank');
                            }}
                            style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="fps-receipt" className="text-sm font-medium mb-2 block">
                        Upload receipt
                      </Label>
                      <Input
                        id="fps-receipt"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={onReceiptChange}
                        className="cursor-pointer"
                        style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                        disabled={isCompressing}
                      />
                      {isCompressing && (
                        <p className="text-xs text-muted-foreground mt-1">Compressing image...</p>
                      )}
                      {receiptFile && selectedMethod === 'fps' && !isCompressing && (
                        <p className="text-xs text-muted-foreground mt-1">Selected: {receiptFile.name}</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
