import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketProductFormData } from '@/lib/types/ticketing';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface TicketTypesFormSectionProps {
  ticketProducts: TicketProductFormData[];
  onChange: (ticketProducts: TicketProductFormData[]) => void;
}

const CURRENCIES = ['HKD', 'USD', 'EUR', 'GBP'];

export function TicketTypesFormSection({
  ticketProducts,
  onChange,
}: TicketTypesFormSectionProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  const addTicketType = () => {
    const newTicketType: TicketProductFormData = {
      name: '',
      description: '',
      price: 0,
      currency: 'HKD',
      capacity_total: 100,
      sales_start: '',
      sales_end: '',
      max_per_customer: undefined,
      wave_label: '',
      valid_from: '',
      valid_until: '',
      require_holder_name: false,
      require_holder_email: false,
      allow_transfer: true,
      allow_reentry: false,
    };
    onChange([...ticketProducts, newTicketType]);
    setExpandedIndex(ticketProducts.length);
  };

  const removeTicketType = (index: number) => {
    const updated = ticketProducts.filter((_, i) => i !== index);
    onChange(updated);
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const updateTicketType = (index: number, updates: Partial<TicketProductFormData>) => {
    const updated = [...ticketProducts];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Ticket Types / 票種設定</CardTitle>
            <CardDescription>Configure ticket types for this event</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={addTicketType}>
            <Plus className="mr-2 h-4 w-4" />
            Add Ticket Type
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ticketProducts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No ticket types added yet. Click "Add Ticket Type" to get started.</p>
          </div>
        ) : (
          ticketProducts.map((ticketType, index) => (
            <Collapsible
              key={index}
              open={expandedIndex === index}
              onOpenChange={(open) => setExpandedIndex(open ? index : null)}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {expandedIndex === index ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronUp className="h-4 w-4" />
                        )}
                        <CardTitle className="text-lg">
                          {ticketType.name || `Ticket Type ${index + 1}`}
                        </CardTitle>
                        {ticketType.price > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {ticketType.currency} {ticketType.price.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTicketType(index);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4 pt-0">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>
                          Ticket Type Name / 票種名稱 <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          value={ticketType.name}
                          onChange={(e) => updateTicketType(index, { name: e.target.value })}
                          placeholder="e.g. Early Bird, General Admission"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Wave Label / 場次標籤</Label>
                        <Input
                          value={ticketType.wave_label || ''}
                          onChange={(e) => updateTicketType(index, { wave_label: e.target.value })}
                          placeholder="e.g. Wave 1 – 10:00"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Ticket Description / 票種描述</Label>
                      <Textarea
                        value={ticketType.description || ''}
                        onChange={(e) => updateTicketType(index, { description: e.target.value })}
                        placeholder="Description of this ticket type..."
                        rows={2}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>
                          Price <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={ticketType.price || ''}
                          onChange={(e) =>
                            updateTicketType(index, { price: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="0.00"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select
                          value={ticketType.currency}
                          onValueChange={(value) => updateTicketType(index, { currency: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map((curr) => (
                              <SelectItem key={curr} value={curr}>
                                {curr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>
                          Capacity / 數量上限 <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          value={ticketType.capacity_total || ''}
                          onChange={(e) =>
                            updateTicketType(index, { capacity_total: parseInt(e.target.value) || 0 })
                          }
                          placeholder="100"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Sales Start / 販售開始</Label>
                        <Input
                          type="datetime-local"
                          value={
                            ticketType.sales_start
                              ? new Date(ticketType.sales_start).toISOString().slice(0, 16)
                              : ''
                          }
                          onChange={(e) => {
                            const date = e.target.value
                              ? new Date(e.target.value).toISOString()
                              : undefined;
                            updateTicketType(index, { sales_start: date });
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Sales End / 販售結束</Label>
                        <Input
                          type="datetime-local"
                          value={
                            ticketType.sales_end
                              ? new Date(ticketType.sales_end).toISOString().slice(0, 16)
                              : ''
                          }
                          onChange={(e) => {
                            const date = e.target.value
                              ? new Date(e.target.value).toISOString()
                              : undefined;
                            updateTicketType(index, { sales_end: date });
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Max Per Customer / 每人限購數量</Label>
                        <Input
                          type="number"
                          min="1"
                          value={ticketType.max_per_customer || ''}
                          onChange={(e) =>
                            updateTicketType(index, {
                              max_per_customer: e.target.value ? parseInt(e.target.value) : undefined,
                            })
                          }
                          placeholder="No limit"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Valid From</Label>
                        <Input
                          type="datetime-local"
                          value={
                            ticketType.valid_from
                              ? new Date(ticketType.valid_from).toISOString().slice(0, 16)
                              : ''
                          }
                          onChange={(e) => {
                            const date = e.target.value
                              ? new Date(e.target.value).toISOString()
                              : undefined;
                            updateTicketType(index, { valid_from: date });
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Valid Until</Label>
                      <Input
                        type="datetime-local"
                        value={
                          ticketType.valid_until
                            ? new Date(ticketType.valid_until).toISOString().slice(0, 16)
                            : ''
                        }
                        onChange={(e) => {
                          const date = e.target.value
                            ? new Date(e.target.value).toISOString()
                            : undefined;
                          updateTicketType(index, { valid_until: date });
                        }}
                      />
                    </div>

                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Require Holder Name</Label>
                          <p className="text-xs text-muted-foreground">
                            Require ticket holder's name during purchase
                          </p>
                        </div>
                        <Switch
                          checked={ticketType.require_holder_name}
                          onCheckedChange={(checked) =>
                            updateTicketType(index, { require_holder_name: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Require Holder Email</Label>
                          <p className="text-xs text-muted-foreground">
                            Require ticket holder's email during purchase
                          </p>
                        </div>
                        <Switch
                          checked={ticketType.require_holder_email}
                          onCheckedChange={(checked) =>
                            updateTicketType(index, { require_holder_email: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Allow Transfer</Label>
                          <p className="text-xs text-muted-foreground">
                            Allow ticket to be transferred to another person
                          </p>
                        </div>
                        <Switch
                          checked={ticketType.allow_transfer}
                          onCheckedChange={(checked) =>
                            updateTicketType(index, { allow_transfer: checked })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Allow Re-entry</Label>
                          <p className="text-xs text-muted-foreground">
                            Allow ticket holder to re-enter after leaving
                          </p>
                        </div>
                        <Switch
                          checked={ticketType.allow_reentry}
                          onCheckedChange={(checked) =>
                            updateTicketType(index, { allow_reentry: checked })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))
        )}
      </CardContent>
    </Card>
  );
}

