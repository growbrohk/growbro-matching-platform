import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProductDeliveryMethod } from '@/lib/api/product-checkout';
import { SHIPPING_RATE_DOOR, SHIPPING_RATE_SF } from '@/lib/checkout/shipping';
import { cn } from '@/lib/utils';

const PANEL_BORDER = 'rgba(14,122,58,0.14)';
const BRAND_DARK = '#0F1F17';

export interface CheckoutDeliverySectionProps {
  deliveryMethod: ProductDeliveryMethod;
  onDeliveryMethodChange: (method: ProductDeliveryMethod) => void;
  doorCountry: string;
  onDoorCountryChange: (value: string) => void;
  doorBuilding: string;
  onDoorBuildingChange: (value: string) => void;
  doorStreet: string;
  onDoorStreetChange: (value: string) => void;
  doorRegion: string;
  onDoorRegionChange: (value: string) => void;
  doorDistrict: string;
  onDoorDistrictChange: (value: string) => void;
  sfLockerAddress: string;
  onSfLockerAddressChange: (value: string) => void;
  sfLockerCode: string;
  onSfLockerCodeChange: (value: string) => void;
  idPrefix?: string;
  showSectionHeader?: boolean;
}

export function CheckoutDeliverySection({
  deliveryMethod,
  onDeliveryMethodChange,
  doorCountry,
  onDoorCountryChange,
  doorBuilding,
  onDoorBuildingChange,
  doorStreet,
  onDoorStreetChange,
  doorRegion,
  onDoorRegionChange,
  doorDistrict,
  onDoorDistrictChange,
  sfLockerAddress,
  onSfLockerAddressChange,
  sfLockerCode,
  onSfLockerCodeChange,
  idPrefix = 'checkout',
  showSectionHeader = true,
}: CheckoutDeliverySectionProps) {
  return (
    <div className="mb-6">
      {showSectionHeader && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 rounded" style={{ backgroundColor: '#0E7A3A' }} />
            <h3
              className="text-base font-semibold"
              style={{ color: BRAND_DARK, fontFamily: "'Inter Tight', sans-serif" }}
            >
              Shipping address
            </h3>
          </div>
          <p className="text-sm mb-4" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Select delivery method
          </p>
        </>
      )}

      <div
        className="border rounded-2xl p-4 md:p-5 space-y-5"
        style={{ borderColor: PANEL_BORDER, backgroundColor: 'rgba(251,248,244,0.9)' }}
      >
        <RadioGroup
          value={deliveryMethod}
          onValueChange={(v) => onDeliveryMethodChange(v as ProductDeliveryMethod)}
          className="space-y-3"
        >
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors',
              deliveryMethod === 'door'
                ? 'border-[#0E7A3A] bg-[#0E7A3A]/5'
                : 'border-transparent bg-background/60',
            )}
          >
            <RadioGroupItem value="door" id={`${idPrefix}-dm-door`} className="mt-0.5" />
            <span className="flex-1" style={{ color: BRAND_DARK }}>
              <span className="font-medium">1. Deliver to Door</span>
              <span className="text-muted-foreground"> (${SHIPPING_RATE_DOOR}/kg)</span>
            </span>
          </label>
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors',
              deliveryMethod === 'sf_locker'
                ? 'border-[#0E7A3A] bg-[#0E7A3A]/5'
                : 'border-transparent bg-background/60',
            )}
          >
            <RadioGroupItem value="sf_locker" id={`${idPrefix}-dm-sf`} className="mt-0.5" />
            <span className="flex-1" style={{ color: BRAND_DARK }}>
              <span className="font-medium">2. Deliver to SF Locker</span>
              <span className="text-muted-foreground"> (${SHIPPING_RATE_SF}/kg)</span>
            </span>
          </label>
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors',
              deliveryMethod === 'event_pickup'
                ? 'border-[#0E7A3A] bg-[#0E7A3A]/5'
                : 'border-transparent bg-background/60',
            )}
          >
            <RadioGroupItem value="event_pickup" id={`${idPrefix}-dm-event`} className="mt-0.5" />
            <span className="flex-1" style={{ color: BRAND_DARK }}>
              <span className="font-medium">3. Pick up in Event</span>
              <span className="text-muted-foreground"> ($0)</span>
              <span className="block text-xs mt-1 text-muted-foreground">
                Please DM IG to arrange pick up
              </span>
            </span>
          </label>
        </RadioGroup>

        {deliveryMethod === 'door' && (
          <div className="space-y-3 pt-2 border-t" style={{ borderColor: PANEL_BORDER }}>
            <div>
              <Label>Country *</Label>
              <Select value={doorCountry} onValueChange={onDoorCountryChange}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hong Kong (SAR)">Hong Kong (SAR)</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Building name, number, floor *</Label>
              <Input
                value={doorBuilding}
                onChange={(e) => onDoorBuildingChange(e.target.value)}
                placeholder="Building Name, number, floor"
                className="mt-1 rounded-xl"
              />
            </div>
            <div>
              <Label>Street address *</Label>
              <Input
                value={doorStreet}
                onChange={(e) => onDoorStreetChange(e.target.value)}
                placeholder="Street address"
                className="mt-1 rounded-xl"
              />
            </div>
            <div>
              <Label>Region</Label>
              <Input
                value={doorRegion}
                onChange={(e) => onDoorRegionChange(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>
            <div>
              <Label>District</Label>
              <Input
                value={doorDistrict}
                onChange={(e) => onDoorDistrictChange(e.target.value)}
                className="mt-1 rounded-xl"
              />
            </div>
          </div>
        )}

        {deliveryMethod === 'sf_locker' && (
          <div className="space-y-3 pt-2 border-t" style={{ borderColor: PANEL_BORDER }}>
            <div>
              <Label>SF locker address *</Label>
              <Input
                value={sfLockerAddress}
                onChange={(e) => onSfLockerAddressChange(e.target.value)}
                placeholder="Full locker location"
                className="mt-1 rounded-xl"
              />
            </div>
            <div>
              <Label>SF Locker address code *</Label>
              <Input
                value={sfLockerCode}
                onChange={(e) => onSfLockerCodeChange(e.target.value)}
                placeholder="Code"
                className="mt-1 rounded-xl"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
