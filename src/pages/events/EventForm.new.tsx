import { useState, useEffect, useRef, FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Loader2, Eye, Copy, ExternalLink, CreditCard, Smartphone, QrCode } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  createEvent, 
  updateEvent, 
  getEvent, 
  deleteEvent,
  getTicketTypes,
  getEventSlotSoldCounts,
  persistEventTicketTypes,
  type CreateEventData,
  type EventSlotSoldCounts,
  type EventTicketTypeBulkMutation,
} from '@/lib/api/events';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Event, TicketType, TicketTypeAccessVariant } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X } from 'lucide-react';
import EventDescription from '@/components/events/EventDescription';
import EventMediaBlock from '@/components/events/EventMediaBlock';
import PublicEventForm from '@/components/events/PublicEventForm';
import { EventAddonsSection } from '@/components/events/EventAddonsSection';
import { EventCollabSection } from '@/components/events/EventCollabSection';
import {
  validateEventPartners,
  syncEventPartners,
  loadEventPartners,
  type EventPartnerDraft,
} from '@/lib/api/event-partners';
import { datetimeLocalToUTC, utcToDatetimeLocal } from '@/lib/utils/datetime';
import { DateTimeRow24 } from '@/components/ui/DateTimeRow24';
import { compressImageToWebp } from '@/lib/images/compressReceiptImage';
import {
  DEFAULT_EVENT_TICKET_TERMS,
  DEFAULT_MARKETING_OPT_IN_LABEL,
} from '@/lib/constants/eventTicketTerms';
import { TICKET_TYPE_DESCRIPTION_MAX_LENGTH } from '@/lib/constants/events';
import { getEventPreviewStoragePathFromPublicUrl } from '@/lib/storage/eventPreviewPaths';
import { getOrgPaymentDefaults } from '@/lib/api/orgs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  formatSlotRange,
  backfillSlotCapacitiesFromTicketTypes,
  buildTicketTypeSlotSavePayload,
  deriveValidForDaysFromSlots,
  getConfiguredTimeSlots,
  getDefaultNextSlotTimes,
  getEffectiveEventEndDate,
  normalizeTicketTypeFromApi,
  stripSlotFromValidForSlots,
  stripSlotFromSlotQuotas,
  ticketTypeHasVariantQuotas,
  ticketTypeUsesPickOneSlots,
  type SlotCapacities,
  type TimeSlotKey,
  type ValidForDays,
} from '@/lib/utils/event-time-slots';

export type EventFormCollabEditorContext = {
  hostOrgId: string;
  hostOrgSlug: string | null;
  hostOrgName: string;
};

type EventFormProps = {
  collabEditorContext?: EventFormCollabEditorContext | null;
};

interface AccessVariantForm {
  id?: string;
  visibility_mode: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  price_override?: string | null;
  discount_percent?: string | null;
  quota?: string | null;
  is_active?: boolean;
}

interface TicketTypeForm {
  id?: string;
  name: string;
  price: string;
  quota: string;
  isNew?: boolean;
  description?: string | null;
  visibility_mode?: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  access_variants?: AccessVariantForm[];
  is_active?: boolean;
  availability_mode?: 'always' | 'scheduled';
  available_start_at?: Date | null;
  available_end_at?: Date | null;
  valid_for_days?: ValidForDays;
  /** Pick-one slots (multi-select). Empty when is_all_access. */
  valid_for_slots?: TimeSlotKey[];
  is_all_access?: boolean;
  show_remaining_count?: boolean;
  threshold_to_show?: number | null;
  slot_quotas?: Partial<Record<TimeSlotKey, string>>;
  /** Loaded from get_ticket_types_with_remaining for edit-mode guards */
  remaining_count?: number;
}

function processTicketAvailability(
  tt: TicketTypeForm,
  effectiveEventEnd: Date
): {
  availabilityMode: 'always' | 'scheduled';
  availableStartAt: string | null;
  availableEndAt: string | null;
} {
  const availabilityMode = tt.availability_mode || 'always';
  let availableStartAt: string | null = null;
  let availableEndAt: string | null = null;

  if (availabilityMode === 'scheduled') {
    if (tt.available_start_at) {
      availableStartAt = tt.available_start_at.toISOString();
    }
    if (tt.available_end_at) {
      const endDate = tt.available_end_at;
      const finalEndAt = endDate > effectiveEventEnd ? effectiveEventEnd : endDate;
      availableEndAt = finalEndAt.toISOString();
    }
  }

  return { availabilityMode, availableStartAt, availableEndAt };
}

function validateScheduledAvailability(
  tt: TicketTypeForm,
  index: number,
  effectiveEventEnd: Date | null
): string[] {
  const errors: string[] = [];
  const label = tt.name.trim() || `Ticket Type ${index + 1}`;
  const availabilityMode = tt.availability_mode || 'always';

  if (availabilityMode !== 'scheduled') return errors;

  if (!tt.available_start_at || !tt.available_end_at) {
    errors.push(`${label}: Both sales start and sales end are required for scheduled availability`);
    return errors;
  }

  if (tt.available_start_at >= tt.available_end_at) {
    errors.push(`${label}: Sales start must be before sales end`);
  }

  if (effectiveEventEnd && tt.available_end_at > effectiveEventEnd) {
    errors.push(`${label}: Sales end cannot be after the event end time`);
  }

  return errors;
}

const DEFAULT_ACCESS_VARIANT_FORM: AccessVariantForm = {
  visibility_mode: 'public',
  access_code: null,
  allowed_affiliates: null,
  price_override: null,
  discount_percent: null,
  quota: null,
  is_active: true,
};

function mapAccessVariantsFromApi(t: TicketType): AccessVariantForm[] {
  if (t.access_variants && t.access_variants.length > 0) {
    return t.access_variants.map((v: TicketTypeAccessVariant) => ({
      id: v.id,
      visibility_mode: v.visibility_mode,
      access_code: v.access_code || null,
      allowed_affiliates: v.allowed_affiliates || null,
      price_override: v.price_override != null ? v.price_override.toString() : null,
      discount_percent: v.discount_percent != null ? v.discount_percent.toString() : null,
      quota: v.quota != null ? v.quota.toString() : null,
      is_active: (v as { is_active?: boolean }).is_active !== false,
    }));
  }
  return [{
    visibility_mode: (t.visibility_mode || 'public') as AccessVariantForm['visibility_mode'],
    access_code: t.access_code || null,
    allowed_affiliates: t.allowed_affiliates || null,
    price_override: null,
    discount_percent: null,
    quota: null,
    is_active: true,
  }];
}

function mapTicketTypesFromApi(types: TicketType[]): TicketTypeForm[] {
  return types.map((t) => {
    const normalized = normalizeTicketTypeFromApi({
      valid_for_days: t.valid_for_days,
      valid_for_slots: t.valid_for_slots,
      slot_quotas: t.slot_quotas,
      quota: t.quota,
    });
    const variants = mapAccessVariantsFromApi(t);
    return {
      id: t.id,
      name: t.name,
      price: t.price.toString(),
      quota: t.quota.toString(),
      isNew: false,
      description: t.description || '',
      visibility_mode: t.visibility_mode || 'public',
      access_code: t.access_code || null,
      allowed_affiliates: t.allowed_affiliates || null,
      access_variants: variants,
      is_active: t.is_active !== undefined ? t.is_active : true,
      availability_mode: t.availability_mode || 'always',
      available_start_at: t.available_start_at ? new Date(t.available_start_at) : null,
      available_end_at: t.available_end_at ? new Date(t.available_end_at) : null,
      valid_for_days: (t.valid_for_days as ValidForDays) || 'day_1',
      valid_for_slots: normalized.selectedSlots,
      is_all_access: normalized.isAllAccess,
      slot_quotas: Object.keys(normalized.slotQuotas).length > 0
        ? normalized.slotQuotas
        : t.slot_quotas
          ? Object.fromEntries(
              Object.entries(t.slot_quotas).map(([k, v]) => [k, String(v)])
            ) as Partial<Record<TimeSlotKey, string>>
          : undefined,
      remaining_count: t.remaining_count,
      show_remaining_count: t.show_remaining_count !== undefined ? t.show_remaining_count : true,
      threshold_to_show: t.threshold_to_show !== undefined ? t.threshold_to_show : null,
    };
  });
}

type TicketTypeMutationPayload = EventTicketTypeBulkMutation;

type ComparableVariantFields = {
  visibility_mode: AccessVariantForm['visibility_mode'];
  access_code: string | null;
  allowed_affiliates: string[] | null;
  price_override: number | null;
  discount_percent: number | null;
  quota: number | null;
  is_active: boolean;
};

function normalizeFormVariant(
  v: AccessVariantForm,
  usesPickOneSlots: boolean
): ComparableVariantFields {
  return {
    visibility_mode: v.visibility_mode,
    access_code: v.visibility_mode === 'code' ? (v.access_code || null) : null,
    allowed_affiliates: v.visibility_mode === 'affiliate' ? (v.allowed_affiliates || null) : null,
    price_override: v.price_override ? parseFloat(v.price_override) : null,
    discount_percent: v.discount_percent ? parseFloat(v.discount_percent) : null,
    quota: usesPickOneSlots ? null : (v.quota ? parseInt(v.quota, 10) : null),
    is_active: v.is_active !== false,
  };
}

function normalizeDbVariant(v: TicketTypeAccessVariant): ComparableVariantFields {
  return {
    visibility_mode: v.visibility_mode,
    access_code: v.visibility_mode === 'code' ? (v.access_code || null) : null,
    allowed_affiliates: v.visibility_mode === 'affiliate' ? (v.allowed_affiliates || null) : null,
    price_override: v.price_override ?? null,
    discount_percent: v.discount_percent ?? null,
    quota: v.quota ?? null,
    is_active: v.is_active !== false,
  };
}

function variantFieldsEqual(a: ComparableVariantFields, b: ComparableVariantFields): boolean {
  const affiliatesEqual =
    [...(a.allowed_affiliates ?? [])].sort().join(',') ===
    [...(b.allowed_affiliates ?? [])].sort().join(',');
  return (
    a.visibility_mode === b.visibility_mode &&
    a.access_code === b.access_code &&
    affiliatesEqual &&
    a.price_override === b.price_override &&
    a.discount_percent === b.discount_percent &&
    a.quota === b.quota &&
    a.is_active === b.is_active
  );
}

function getActiveExistingVariants(existing: TicketType): TicketTypeAccessVariant[] {
  if (existing.access_variants && existing.access_variants.length > 0) {
    return existing.access_variants.filter((v) => v.is_active !== false);
  }
  return [{
    id: existing.id,
    ticket_type_id: existing.id,
    visibility_mode: (existing.visibility_mode || 'public') as TicketTypeAccessVariant['visibility_mode'],
    access_code: existing.access_code ?? null,
    allowed_affiliates: existing.allowed_affiliates ?? null,
    price_override: null,
    discount_percent: null,
    quota: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  }];
}

function accessVariantsUnchanged(
  formVariants: AccessVariantForm[],
  existing: TicketType | undefined,
  usesPickOneSlots: boolean
): boolean {
  if (!existing) return false;

  const formList = formVariants.length > 0 ? formVariants : [DEFAULT_ACCESS_VARIANT_FORM];
  const hasVariantRows = !!(existing.access_variants && existing.access_variants.length > 0);
  const activeExisting = getActiveExistingVariants(existing);

  // Legacy ticket types may have no variant rows — compare against ticket_types fields
  if (!hasVariantRows && formList.length === 1 && !formList[0].id) {
    return variantFieldsEqual(
      normalizeFormVariant(formList[0], usesPickOneSlots),
      normalizeDbVariant(activeExisting[0])
    );
  }

  if (formList.length !== activeExisting.length) return false;

  for (const formV of formList) {
    if (!formV.id) return false;

    const dbV = activeExisting.find((e) => e.id === formV.id);
    if (!dbV) return false;

    if (!variantFieldsEqual(
      normalizeFormVariant(formV, usesPickOneSlots),
      normalizeDbVariant(dbV)
    )) {
      return false;
    }
  }

  return true;
}

function buildTicketTypeMutationFromForm(
  tt: TicketTypeForm,
  effectiveEventEndDate: Date,
  hasMultipleTimeSlots: boolean,
  savedEventId: string,
  existingTicketType?: TicketType
): TicketTypeMutationPayload {
  const ticketMetadata = (tt as { metadata?: Record<string, unknown> }).metadata || {};
  let finalMetadata = { ...ticketMetadata };

  if (ticketMetadata.sales_end_at) {
    const salesEndAt = new Date(ticketMetadata.sales_end_at as string);
    if (salesEndAt > effectiveEventEndDate) {
      finalMetadata.sales_end_at = effectiveEventEndDate.toISOString();
    }
  }

  const salesEndAtField = (tt as { sales_end_at?: string }).sales_end_at;
  if (salesEndAtField) {
    const salesEndAt = new Date(salesEndAtField);
    if (salesEndAt > effectiveEventEndDate) {
      finalMetadata.sales_end_at = effectiveEventEndDate.toISOString();
    }
  }

  const { availabilityMode, availableStartAt, availableEndAt } = processTicketAvailability(
    tt,
    effectiveEventEndDate
  );

  const usesPickOneSlots = hasMultipleTimeSlots && !tt.is_all_access;
  const accessVariants = (usesPickOneSlots
    ? (tt.access_variants || []).map((v) => ({ ...v, quota: null }))
    : (tt.access_variants || [])
  ).map((v) => ({
    id: v.id,
    visibility_mode: v.visibility_mode,
    access_code: v.visibility_mode === 'code' ? (v.access_code || null) : null,
    allowed_affiliates: v.visibility_mode === 'affiliate' ? (v.allowed_affiliates || null) : null,
    price_override: v.price_override ? parseFloat(v.price_override) : null,
    discount_percent: v.discount_percent ? parseFloat(v.discount_percent) : null,
    quota: v.quota ? parseInt(v.quota, 10) : null,
    is_active: v.is_active !== false,
  }));

  const slotSave = hasMultipleTimeSlots
    ? buildTicketTypeSlotSavePayload({
        isAllAccess: !!tt.is_all_access,
        selectedSlots: tt.valid_for_slots || [],
        slotQuotas: tt.slot_quotas || {},
        aggregateQuota: parseInt(tt.quota || '0', 10) || 1,
      })
    : {
        valid_for_days: (tt.valid_for_days || 'day_1') as ValidForDays,
        valid_for_slots: null,
        slot_quotas: null,
        quota: parseInt(tt.quota || '0', 10) || 1,
      };

  const priceStr = (tt.price || '').trim();
  const ticketPrice = priceStr === '' ? 0 : parseFloat(priceStr);

  const variantsUnchanged =
    tt.id && !tt.isNew && existingTicketType
      ? accessVariantsUnchanged(tt.access_variants || [], existingTicketType, usesPickOneSlots)
      : false;

  const commonFields = {
    name: tt.name.trim(),
    price: ticketPrice,
    quota: slotSave.quota,
    slot_quotas: slotSave.slot_quotas ?? undefined,
    valid_for_slots: slotSave.valid_for_slots,
    metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
    access_variants: !variantsUnchanged && accessVariants.length > 0 ? accessVariants : undefined,
    is_active: tt.is_active !== undefined ? tt.is_active : true,
    availability_mode: availabilityMode,
    available_start_at: availableStartAt,
    available_end_at: availableEndAt,
    valid_for_days: slotSave.valid_for_days,
    show_remaining_count: tt.show_remaining_count !== undefined ? tt.show_remaining_count : true,
    threshold_to_show: tt.threshold_to_show !== undefined ? tt.threshold_to_show : null,
    description: (tt.description || '').trim() || null,
  };

  if (tt.id && !tt.isNew) {
    return {
      kind: 'update',
      data: {
        id: tt.id,
        ...commonFields,
        slot_quotas: slotSave.slot_quotas,
      },
    };
  }

  return {
    kind: 'create',
    data: {
      event_id: savedEventId,
      ...commonFields,
    },
  };
}

function mapAccessVariantsForPreview(
  variants: AccessVariantForm[] | undefined,
  ticketTypeId: string,
  fallback: Pick<TicketTypeForm, 'visibility_mode' | 'access_code' | 'allowed_affiliates'>
): TicketTypeAccessVariant[] {
  const list = variants && variants.length > 0
    ? variants
    : [{
        visibility_mode: (fallback.visibility_mode || 'public') as AccessVariantForm['visibility_mode'],
        access_code: fallback.access_code || null,
        allowed_affiliates: fallback.allowed_affiliates || null,
        is_active: true,
      }];
  const now = new Date().toISOString();
  return list.map((v, i) => ({
    id: `preview-variant-${ticketTypeId}-${i}`,
    ticket_type_id: ticketTypeId,
    visibility_mode: v.visibility_mode,
    access_code: v.access_code || null,
    allowed_affiliates: v.allowed_affiliates || null,
    price_override: v.price_override ? parseFloat(v.price_override) : null,
    discount_percent: v.discount_percent ? parseFloat(v.discount_percent) : null,
    quota: v.quota ? parseInt(v.quota, 10) : null,
    is_active: v.is_active !== false,
    created_at: now,
    updated_at: now,
  }));
}

function validateAccessVariants(tt: TicketTypeForm, index: number): string[] {
  const errors: string[] = [];
  const label = tt.name.trim() || `Ticket Type ${index + 1}`;
  const variants = tt.access_variants && tt.access_variants.length > 0
    ? tt.access_variants
    : [DEFAULT_ACCESS_VARIANT_FORM];

  variants.forEach((v, vIdx) => {
    const variantLabel = variants.length > 1
      ? `${label} access variant ${vIdx + 1}`
      : label;
    if (v.visibility_mode === 'code' && !(v.access_code || '').trim()) {
      errors.push(`${variantLabel}: Access code is required for Code visibility`);
    }
    if (
      v.visibility_mode === 'affiliate'
      && (!v.allowed_affiliates || v.allowed_affiliates.length === 0)
    ) {
      errors.push(`${variantLabel}: At least one affiliate slug is required for Affiliate visibility`);
    }
  });

  return errors;
}

interface OptionalTimeSlotFieldsProps {
  slotNumber: 2 | 3 | 4;
  startAt: Date | null;
  endAt: Date | null;
  minStart?: Date;
  onStartChange: (date: Date | null) => void;
  onEndChange: (date: Date | null) => void;
  onRemove: () => void;
  onValidationClear: () => void;
  showCapacity?: boolean;
  capacityValue?: string;
  onCapacityChange?: (value: string) => void;
}

function OptionalTimeSlotFields({
  slotNumber,
  startAt,
  endAt,
  minStart,
  onStartChange,
  onEndChange,
  onRemove,
  onValidationClear,
  showCapacity,
  capacityValue,
  onCapacityChange,
}: OptionalTimeSlotFieldsProps) {
  const slotKey = `day_${slotNumber}` as TimeSlotKey;
  return (
    <div className="space-y-4 p-4 rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-base md:text-lg font-semibold" style={{ color: '#0F1F17' }}>
          Time Slot {slotNumber}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRemove}
          className="text-muted-foreground"
        >
          Remove Time Slot {slotNumber}
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Label className="text-sm font-medium">Time Slot {slotNumber} Start</Label>
          <DateTimeRow24
            value={startAt}
            onChange={(date) => {
              onStartChange(date);
              onValidationClear();
            }}
            disabled={false}
            min={minStart}
            ariaLabel={`Time Slot ${slotNumber} start date and time`}
            className="mt-1 w-full"
          />
        </div>
        <div>
          <Label className="text-sm font-medium">Time Slot {slotNumber} End</Label>
          <DateTimeRow24
            value={endAt}
            onChange={(date) => {
              onEndChange(date);
              onValidationClear();
            }}
            disabled={false}
            min={startAt || minStart}
            ariaLabel={`Time Slot ${slotNumber} end date and time`}
            className="mt-1 w-full"
          />
        </div>
      </div>
      {showCapacity && onCapacityChange && (
        <div className="max-w-xs">
          <Label htmlFor={`slot-capacity-${slotKey}`} className="text-sm font-medium">
            Total capacity
            <span className="text-red-500 ml-1">*</span>
          </Label>
          <Input
            id={`slot-capacity-${slotKey}`}
            type="number"
            min="1"
            value={capacityValue ?? ''}
            onChange={(e) => {
              onCapacityChange(e.target.value);
              onValidationClear();
            }}
            placeholder="100"
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Shared venue capacity for Time Slot {slotNumber}. All ticket types draw from this pool.
          </p>
        </div>
      )}
    </div>
  );
}

export default function EventForm({ collabEditorContext = null }: EventFormProps) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currentOrg, user } = useAuth();
  const { toast } = useToast();

  const effectiveOrgId = collabEditorContext?.hostOrgId ?? currentOrg?.id;
  const effectiveOrgSlug = collabEditorContext?.hostOrgSlug ?? currentOrg?.slug ?? null;
  const effectiveOrgName = collabEditorContext?.hostOrgName ?? currentOrg?.name ?? '';

  // Helper to generate UUID v4
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const isEditMode = !!id;
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const saveGenerationRef = useRef(0);

  // Event fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instagramPreviewImageUrl, setInstagramPreviewImageUrl] = useState('');
  const [previewImageCacheKey, setPreviewImageCacheKey] = useState(0);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [ogPreviewImageUrl, setOgPreviewImageUrl] = useState('');
  const [ogPreviewImageCacheKey, setOgPreviewImageCacheKey] = useState(0);
  const [uploadingOgPreview, setUploadingOgPreview] = useState(false);
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [day2StartAt, setDay2StartAt] = useState<Date | null>(null);
  const [day2EndAt, setDay2EndAt] = useState<Date | null>(null);
  const [day3StartAt, setDay3StartAt] = useState<Date | null>(null);
  const [day3EndAt, setDay3EndAt] = useState<Date | null>(null);
  const [day4StartAt, setDay4StartAt] = useState<Date | null>(null);
  const [day4EndAt, setDay4EndAt] = useState<Date | null>(null);
  const [slotCapacities, setSlotCapacities] = useState<Partial<Record<TimeSlotKey, string>>>({});
  const [slotSoldCounts, setSlotSoldCounts] = useState<EventSlotSoldCounts>({});
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [locationText, setLocationText] = useState<string>('');
  const [eventSlug, setEventSlug] = useState<string>('');
  const [eventId, setEventId] = useState<string | null>(null);
  const [collectAttendeeInfo, setCollectAttendeeInfo] = useState<'primary' | 'per_ticket'>('primary');
  
  // Payment method fields
  const [enableStripe, setEnableStripe] = useState<boolean>(false);
  const [enablePayme, setEnablePayme] = useState<boolean>(false);
  const [enableFps, setEnableFps] = useState<boolean>(false);
  const [paymeLink, setPaymeLink] = useState<string>('');
  const [fpsLink, setFpsLink] = useState<string>('');
  const [stripeFeeBearer, setStripeFeeBearer] = useState<'host' | 'user'>('host');
  const [paymentDefaultsLoaded, setPaymentDefaultsLoaded] = useState(false);

  // Event Ticket Terms & Conditions (editable, preset with default)
  const [ticketTermsAndConditions, setTicketTermsAndConditions] = useState<string>(DEFAULT_EVENT_TICKET_TERMS);
  const [marketingOptInEnabled, setMarketingOptInEnabled] = useState(false);
  const [marketingOptInLabel, setMarketingOptInLabel] = useState<string>(DEFAULT_MARKETING_OPT_IN_LABEL);
  const [eventMetadata, setEventMetadata] = useState<Record<string, any>>({});

  const mergeEventMetadata = (extra: Record<string, unknown> = {}) => ({
    ...eventMetadata,
    ...extra,
    ticket_terms_and_conditions: ticketTermsAndConditions.trim() || DEFAULT_EVENT_TICKET_TERMS,
    marketing_opt_in_enabled: marketingOptInEnabled,
    marketing_opt_in_label: marketingOptInLabel.trim() || DEFAULT_MARKETING_OPT_IN_LABEL,
  });

  // Ticket types
  const [ticketTypes, setTicketTypes] = useState<TicketTypeForm[]>([]);
  const [existingTicketTypes, setExistingTicketTypes] = useState<TicketType[]>([]);

  // Partner collab / affiliate
  const [collabEnabled, setCollabEnabled] = useState(false);
  const [eventPartners, setEventPartners] = useState<EventPartnerDraft[]>([]);
  const [partnersReloadToken, setPartnersReloadToken] = useState(0);

  // Progressive disclosure states
  const [showTicketTypesSection, setShowTicketTypesSection] = useState(false);
  const [showPublishingSection, setShowPublishingSection] = useState(false);

  // Preview dialog state
  const [showPreview, setShowPreview] = useState(false);

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Validation errors state
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load event data if editing
  useEffect(() => {
    if (!isEditMode || !id || !currentOrg) return;

    const loadEvent = async () => {
      setLoading(true);
      try {
        const event = await getEvent(id);
        if (!event) {
          toast({ 
            title: 'Error', 
            description: 'Event not found', 
            variant: 'destructive' 
          });
          navigate('/app/catalog?tab=events');
          return;
        }

        if (collabEditorContext) {
          if (event.org_id !== collabEditorContext.hostOrgId) {
            toast({
              title: 'Error',
              description: 'You do not have access to this event',
              variant: 'destructive',
            });
            navigate('/app/catalog?tab=events');
            return;
          }
        } else if (event.org_id !== currentOrg.id) {
          toast({
            title: 'Error',
            description: 'You do not have access to this event',
            variant: 'destructive',
          });
          navigate('/app/catalog?tab=events');
          return;
        }

        setTitle(event.title || '');
        setDescription(event.description || '');
        setInstagramPreviewImageUrl(event.instagram_preview_image_url || '');
        setOgPreviewImageUrl(((event as any).og_preview_image_url as string) || '');
        setStartAt(event.start_at ? new Date(event.start_at) : null);
        setEndAt(event.end_at ? new Date(event.end_at) : null);
        setDay2StartAt(event.day_2_start_at ? new Date(event.day_2_start_at) : null);
        setDay2EndAt(event.day_2_end_at ? new Date(event.day_2_end_at) : null);
        setDay3StartAt(event.day_3_start_at ? new Date(event.day_3_start_at) : null);
        setDay3EndAt(event.day_3_end_at ? new Date(event.day_3_end_at) : null);
        setDay4StartAt(event.day_4_start_at ? new Date(event.day_4_start_at) : null);
        setDay4EndAt(event.day_4_end_at ? new Date(event.day_4_end_at) : null);
        setStatus(event.status === 'published' ? 'published' : 'draft');
        setLocationText(event.location_text || '');
        setEventSlug((event as any).slug || '');
        setEventId(event.id);
        setCollectAttendeeInfo(event.collect_attendee_info || 'primary');
        setEnableStripe(event.enable_stripe || false);
        setEnablePayme(event.enable_payme || false);
        setEnableFps(event.enable_fps || false);
        setPaymeLink(event.payme_link || '');
        setFpsLink(event.fps_link || '');
        setStripeFeeBearer(event.stripe_fee_bearer === 'user' ? 'user' : 'host');

        // Load T&C and full metadata (for merge on save)
        const metadata = (event as any).metadata || {};
        setEventMetadata(metadata);
        setTicketTermsAndConditions(metadata.ticket_terms_and_conditions ?? DEFAULT_EVENT_TICKET_TERMS);
        setMarketingOptInEnabled(metadata.marketing_opt_in_enabled === true);
        setMarketingOptInLabel(metadata.marketing_opt_in_label ?? DEFAULT_MARKETING_OPT_IN_LABEL);

        // Load ticket types with access variants + sold counts for floor validation
        const [types, soldCounts] = await Promise.all([
          getTicketTypes(id, true, true),
          getEventSlotSoldCounts(id).catch(() => ({} as EventSlotSoldCounts)),
        ]);
        setExistingTicketTypes(types);
        setSlotSoldCounts(soldCounts);

        const loadedCapacities = (event as { slot_capacities?: SlotCapacities | null }).slot_capacities;
        const capacityRecord: Partial<Record<TimeSlotKey, string>> = {};
        if (loadedCapacities) {
          (Object.entries(loadedCapacities) as [TimeSlotKey, number][]).forEach(([key, val]) => {
            if (val != null) capacityRecord[key] = String(val);
          });
        }

        const mappedTypes = mapTicketTypesFromApi(types);

        setTicketTypes(mappedTypes);

        const eventSlots = getConfiguredTimeSlots({
          start_at: event.start_at,
          end_at: event.end_at,
          day_2_start_at: event.day_2_start_at,
          day_2_end_at: event.day_2_end_at,
          day_3_start_at: event.day_3_start_at,
          day_3_end_at: event.day_3_end_at,
          day_4_start_at: event.day_4_start_at,
          day_4_end_at: event.day_4_end_at,
        });
        if (eventSlots.length > 1) {
          const backfilled = backfillSlotCapacitiesFromTicketTypes(
            eventSlots,
            mappedTypes,
            loadedCapacities ?? undefined
          );
          const merged: Partial<Record<TimeSlotKey, string>> = { ...capacityRecord };
          eventSlots.forEach((slot) => {
            if (!merged[slot.key] && backfilled[slot.key] != null) {
              merged[slot.key] = String(backfilled[slot.key]);
            }
          });
          setSlotCapacities(merged);
        } else {
          setSlotCapacities(capacityRecord);
        }

        // Show sections if they have data
        if (types.length > 0) setShowTicketTypesSection(true);
        setShowPublishingSection(true);
      } catch (error: any) {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to load event', 
          variant: 'destructive' 
        });
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [id, isEditMode, currentOrg, collabEditorContext, navigate, toast]);

  // Pre-fill payment methods from Brand Page settings for new events
  useEffect(() => {
    if (isEditMode || !effectiveOrgId) return;

    let cancelled = false;

    const loadPaymentDefaults = async () => {
      try {
        const defaults = await getOrgPaymentDefaults(effectiveOrgId);
        if (cancelled || !defaults) return;

        setEnablePayme(defaults.enable_payme);
        setEnableFps(defaults.enable_fps);
        setPaymeLink(defaults.payme_link);
        setFpsLink(defaults.fps_link);
        setStripeFeeBearer(defaults.stripe_fee_bearer);

        const hasAnyDefault =
          defaults.enable_payme ||
          defaults.enable_fps ||
          defaults.payme_link.trim().length > 0 ||
          defaults.fps_link.trim().length > 0 ||
          defaults.stripe_fee_bearer === 'user';
        setPaymentDefaultsLoaded(hasAnyDefault);
      } catch {
        // Form remains usable with hard defaults
      }
    };

    loadPaymentDefaults();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, effectiveOrgId]);

  // Progressive disclosure: show ticket types section when basic info is filled
  useEffect(() => {
    if (title.trim() && startAt && endAt) {
      setShowTicketTypesSection(true);
    }
  }, [title, startAt, endAt]);

  // Progressive disclosure: show publishing section when ticket types are added
  useEffect(() => {
    if (ticketTypes.length > 0) {
      setShowPublishingSection(true);
    }
  }, [ticketTypes.length]);

  const hasTimeSlot2 = day2StartAt != null && day2EndAt != null;
  const hasTimeSlot3 = day3StartAt != null && day3EndAt != null;
  const hasTimeSlot4 = day4StartAt != null && day4EndAt != null;
  const formTimeSlotEvent = startAt && endAt ? {
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    day_2_start_at: day2StartAt?.toISOString() ?? null,
    day_2_end_at: day2EndAt?.toISOString() ?? null,
    day_3_start_at: day3StartAt?.toISOString() ?? null,
    day_3_end_at: day3EndAt?.toISOString() ?? null,
    day_4_start_at: day4StartAt?.toISOString() ?? null,
    day_4_end_at: day4EndAt?.toISOString() ?? null,
  } : null;
  const configuredTimeSlots = formTimeSlotEvent ? getConfiguredTimeSlots(formTimeSlotEvent) : [];
  const hasMultipleTimeSlots = configuredTimeSlots.length > 1;
  const effectiveEventEnd = formTimeSlotEvent
    ? getEffectiveEventEndDate(formTimeSlotEvent)
    : (endAt ?? new Date());

  useEffect(() => {
    if (!hasMultipleTimeSlots) return;
    setSlotCapacities((prev) => {
      let changed = false;
      const next = { ...prev };
      configuredTimeSlots.forEach((slot) => {
        if (!next[slot.key] || parseInt(next[slot.key]!, 10) <= 0) {
          next[slot.key] = '100';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [hasMultipleTimeSlots, configuredTimeSlots.map((s) => s.key).join(',')]);

  // Re-clamp ticket schedule dates when event boundaries change
  useEffect(() => {
    if (!effectiveEventEnd) return;

    setTicketTypes((prev) => {
      let anyChanged = false;
      const next = prev.map((tt) => {
        if ((tt.availability_mode || 'always') !== 'scheduled') return tt;

        let available_start_at = tt.available_start_at ?? null;
        let available_end_at = tt.available_end_at ?? null;
        let itemChanged = false;

        if (available_end_at && available_end_at > effectiveEventEnd) {
          available_end_at = effectiveEventEnd;
          itemChanged = true;
        }
        if (available_start_at && available_end_at && available_start_at >= available_end_at) {
          available_end_at = null;
          itemChanged = true;
        }

        if (!itemChanged) return tt;
        anyChanged = true;
        return { ...tt, available_start_at, available_end_at };
      });

      return anyChanged ? next : prev;
    });
  }, [endAt, day2EndAt, day3EndAt, day4EndAt, effectiveEventEnd]);

  const generateAccessCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const addTicketType = () => {
    setTicketTypes([...ticketTypes, {
      name: '',
      price: '',
      quota: '',
      isNew: true,
      description: '',
      visibility_mode: 'public',
      access_code: null,
      allowed_affiliates: null,
      access_variants: [{ visibility_mode: 'public', access_code: null, allowed_affiliates: null, price_override: null, discount_percent: null, quota: null, is_active: true }],
      is_active: true,
      availability_mode: 'always',
      available_start_at: null,
      available_end_at: null,
      valid_for_days: 'day_1',
      valid_for_slots: ['day_1'],
      is_all_access: false,
      show_remaining_count: true,
      threshold_to_show: null,
    }]);
    setShowTicketTypesSection(true);
  };

  const removeTicketType = (index: number) => {
    const ticketType = ticketTypes[index];
    if (ticketType.id && !ticketType.isNew) {
      // Mark for deletion (we'll handle this on save)
      deleteTicketType(ticketType.id).catch(err => {
        console.error('Failed to delete ticket type:', err);
      });
    }
    setTicketTypes(ticketTypes.filter((_, i) => i !== index));
  };

  const updateSlotQuota = (ticketIndex: number, slotKey: TimeSlotKey, value: string) => {
    setTicketTypes((prev) =>
      prev.map((t, i) =>
        i === ticketIndex
          ? { ...t, slot_quotas: { ...t.slot_quotas, [slotKey]: value } }
          : t
      )
    );
    if (validationErrors.length > 0) setValidationErrors([]);
  };

  const updateSlotCapacity = (slotKey: TimeSlotKey, value: string) => {
    setSlotCapacities((prev) => ({ ...prev, [slotKey]: value }));
    if (validationErrors.length > 0) setValidationErrors([]);
  };

  const toggleTicketTypeSlot = (ticketIndex: number, slotKey: TimeSlotKey, checked: boolean) => {
    setTicketTypes((prev) =>
      prev.map((t, i) => {
        if (i !== ticketIndex) return t;
        const current = t.valid_for_slots || [];
        const nextSlots = checked
          ? [...current, slotKey].sort()
          : current.filter((k) => k !== slotKey);
        const nextQuotas = { ...t.slot_quotas };
        if (checked && !nextQuotas[slotKey]) {
          nextQuotas[slotKey] = t.quota || '100';
        }
        if (!checked) delete nextQuotas[slotKey];
        return {
          ...t,
          is_all_access: false,
          valid_for_slots: nextSlots,
          valid_for_days: deriveValidForDaysFromSlots(nextSlots, false),
          slot_quotas: nextQuotas,
        };
      })
    );
    if (validationErrors.length > 0) setValidationErrors([]);
  };

  const setTicketTypeAllAccess = (ticketIndex: number, allAccess: boolean) => {
    setTicketTypes((prev) =>
      prev.map((t, i) => {
        if (i !== ticketIndex) return t;
        if (allAccess) {
          return {
            ...t,
            is_all_access: true,
            valid_for_days: 'all',
            valid_for_slots: [],
            slot_quotas: undefined,
          };
        }
        const defaultSlots = configuredTimeSlots.length > 0
          ? [configuredTimeSlots[0].key]
          : (['day_1'] as TimeSlotKey[]);
        return {
          ...t,
          is_all_access: false,
          valid_for_slots: defaultSlots,
          valid_for_days: defaultSlots[0],
          slot_quotas: { [defaultSlots[0]]: t.quota || '100' },
        };
      })
    );
    if (validationErrors.length > 0) setValidationErrors([]);
  };

  const selectAllTicketTypeSlots = (ticketIndex: number) => {
    setTicketTypes((prev) =>
      prev.map((t, i) => {
        if (i !== ticketIndex) return t;
        const allKeys = configuredTimeSlots.map((s) => s.key);
        const nextQuotas = { ...t.slot_quotas };
        allKeys.forEach((key) => {
          if (!nextQuotas[key]) nextQuotas[key] = t.quota || '100';
        });
        return {
          ...t,
          is_all_access: false,
          valid_for_slots: allKeys,
          valid_for_days: deriveValidForDaysFromSlots(allKeys, false),
          slot_quotas: nextQuotas,
        };
      })
    );
    if (validationErrors.length > 0) setValidationErrors([]);
  };

  const updateTicketTypeForm = (index: number, field: keyof TicketTypeForm, value: string | string[] | TimeSlotKey[] | null | boolean | Date | number) => {
    setTicketTypes((prev) => prev.map((tt, i) =>
      i === index ? { ...tt, [field]: value } : tt
    ));
  };

  const handleAffiliatesChange = (index: number, value: string) => {
    // Parse comma-separated values and trim whitespace
    const affiliates = value
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    updateTicketTypeForm(index, 'allowed_affiliates', affiliates.length > 0 ? affiliates : null);
  };

  const handleAddAccessVariant = (ticketIndex: number) => {
    setTicketTypes(ticketTypes.map((tt, i) => {
      if (i !== ticketIndex) return tt;
      const variants = tt.access_variants || [{ visibility_mode: 'public', access_code: null, allowed_affiliates: null, price_override: null, discount_percent: null, quota: null, is_active: true }];
      return { ...tt, access_variants: [...variants, { visibility_mode: 'code', access_code: '', allowed_affiliates: null, price_override: null, discount_percent: null, quota: null, is_active: true }] };
    }));
  };

  const handleRemoveAccessVariant = (ticketIndex: number, variantIndex: number) => {
    setTicketTypes(ticketTypes.map((tt, i) => {
      if (i !== ticketIndex) return tt;
      const variants = tt.access_variants || [];
      if (variants.length <= 1) return tt;
      return { ...tt, access_variants: variants.filter((_, vi) => vi !== variantIndex) };
    }));
  };

  const handleUpdateAccessVariant = (ticketIndex: number, variantIndex: number, field: keyof AccessVariantForm, value: string | string[] | boolean | null, extra?: Partial<AccessVariantForm>) => {
    setTicketTypes(ticketTypes.map((tt, i) => {
      if (i !== ticketIndex) return tt;
      const variants = [...(tt.access_variants || [])];
      const v = variants[variantIndex];
      if (!v) return tt;
      variants[variantIndex] = { ...v, [field]: value, ...extra };
      return { ...tt, access_variants: variants };
    }));
  };

  const handleGenerateCodeForVariant = (ticketIndex: number, variantIndex: number) => {
    const code = generateAccessCode();
    handleUpdateAccessVariant(ticketIndex, variantIndex, 'access_code', code);
  };

  /** Copy temp/... upload to permanent path after first save (fixes orphaned temp objects). */
  const migrateEventPreviewFromTemp = async (
    publicUrl: string,
    permanentRelativePath: string
  ): Promise<string> => {
    const oldPath = getEventPreviewStoragePathFromPublicUrl(publicUrl);
    if (!oldPath || !oldPath.startsWith('temp/')) {
      return publicUrl;
    }
    const { error: copyError } = await supabase.storage
      .from('event-previews')
      .copy(oldPath, permanentRelativePath);
    if (copyError) {
      throw copyError;
    }
    await supabase.storage.from('event-previews').remove([oldPath]);
    const { data: urlData } = supabase.storage
      .from('event-previews')
      .getPublicUrl(permanentRelativePath);
    return urlData.publicUrl;
  };

  const handlePreviewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation: Check if user and org exist
    if (!user?.id || !currentOrg?.id) {
      toast({
        title: 'Error',
        description: 'Please sign in to upload preview photos',
        variant: 'destructive',
      });
      e.target.value = ''; // Clear file input
      return;
    }

    // Validation: File size (10MB max before compression)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: 'Error',
        description: 'File size must be less than 10MB',
        variant: 'destructive',
      });
      e.target.value = ''; // Clear file input
      return;
    }

    // Validation: File type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Error',
        description: 'Only JPEG, PNG, and WebP images are allowed',
        variant: 'destructive',
      });
      e.target.value = ''; // Clear file input
      return;
    }

    setUploadingPreview(true);
    try {
      // Compress to ~100KB before upload (maxDimension 800 helps complex posters compress)
      const { file: compressedFile, width: iw, height: ih } = await compressImageToWebp(file, {
        targetSizeBytes: 100 * 1024,
        maxDimension: 800,
      });

      if (compressedFile.size >= 100 * 1024) {
        toast({
          title: 'Error',
          description: 'Image is too large even after compression. Please try another image.',
          variant: 'destructive',
        });
        e.target.value = '';
        return;
      }

      // Compressed output is always WebP
      const ext = 'webp';
      let uploadPath: string;
      if (eventId && effectiveOrgId) {
        uploadPath = `${effectiveOrgId}/${eventId}/instagram-preview.${ext}`;
      } else {
        const randomUUID = generateUUID();
        uploadPath = `temp/${user.id}/${randomUUID}.${ext}`;
      }

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('event-previews')
        .upload(uploadPath, compressedFile, {
          upsert: true,
          contentType: 'image/webp',
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-previews')
        .getPublicUrl(uploadPath);

      const publicUrl = urlData.publicUrl;

      const mergedMeta = mergeEventMetadata({
        instagram_preview_image_width: iw,
        instagram_preview_image_height: ih,
      });
      setEventMetadata(mergedMeta);

      // Update state immediately
      setInstagramPreviewImageUrl(publicUrl);
      setPreviewImageCacheKey(k => k + 1);

      // If eventId exists, persist immediately to database
      if (eventId) {
        await updateEvent({
          id: eventId,
          instagram_preview_image_url: publicUrl,
          metadata: mergedMeta,
        });
      }

      toast({
        title: 'Success',
        description: 'Preview photo uploaded successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload preview photo',
        variant: 'destructive',
      });
    } finally {
      setUploadingPreview(false);
      e.target.value = ''; // Clear file input
    }
  };

  const handleRemovePreviewImage = async () => {
    if (!eventId) {
      setInstagramPreviewImageUrl('');
      setEventMetadata((prev) => {
        const n = { ...prev };
        delete n.instagram_preview_image_width;
        delete n.instagram_preview_image_height;
        return n;
      });
      return;
    }

    try {
      const nextMeta = { ...eventMetadata };
      delete nextMeta.instagram_preview_image_width;
      delete nextMeta.instagram_preview_image_height;

      // Update database
      await updateEvent({
        id: eventId,
        instagram_preview_image_url: null,
        metadata: mergeEventMetadata(nextMeta),
      });

      // Clear state
      setEventMetadata(mergeEventMetadata(nextMeta));
      setInstagramPreviewImageUrl('');

      toast({
        title: 'Success',
        description: 'Preview photo removed',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove preview photo',
        variant: 'destructive',
      });
    }
  };

  const handleOgPreviewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user?.id || !currentOrg?.id) {
      toast({
        title: 'Error',
        description: 'Please sign in to upload preview photos',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: 'Error',
        description: 'File size must be less than 10MB',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Error',
        description: 'Only JPEG, PNG, and WebP images are allowed',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    setUploadingOgPreview(true);
    try {
      const { file: compressedFile, width: ow, height: oh } = await compressImageToWebp(file, {
        targetSizeBytes: 300 * 1024,
        maxDimension: 1200,
      });

      if (compressedFile.size >= 300 * 1024) {
        toast({
          title: 'Error',
          description: 'Image is too large even after compression. Please try another image.',
          variant: 'destructive',
        });
        e.target.value = '';
        return;
      }

      const ext = 'webp';
      let uploadPath: string;
      if (eventId && effectiveOrgId) {
        uploadPath = `${effectiveOrgId}/${eventId}/og-preview.${ext}`;
      } else {
        const randomUUID = generateUUID();
        uploadPath = `temp/${user.id}/${randomUUID}-og.${ext}`;
      }

      const { error: uploadError } = await supabase.storage
        .from('event-previews')
        .upload(uploadPath, compressedFile, {
          upsert: true,
          contentType: 'image/webp',
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('event-previews')
        .getPublicUrl(uploadPath);

      const publicUrl = urlData.publicUrl;

      const mergedMeta = mergeEventMetadata({
        og_preview_image_width: ow,
        og_preview_image_height: oh,
      });
      setEventMetadata(mergedMeta);

      setOgPreviewImageUrl(publicUrl);
      setOgPreviewImageCacheKey((k) => k + 1);

      if (eventId) {
        await updateEvent({
          id: eventId,
          og_preview_image_url: publicUrl,
          metadata: mergedMeta,
        });
      }

      toast({
        title: 'Success',
        description: 'Facebook/WhatsApp preview uploaded successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload Facebook/WhatsApp preview',
        variant: 'destructive',
      });
    } finally {
      setUploadingOgPreview(false);
      e.target.value = '';
    }
  };

  const handleRemoveOgPreviewImage = async () => {
    if (!eventId) {
      setOgPreviewImageUrl('');
      setEventMetadata((prev) => {
        const n = { ...prev };
        delete n.og_preview_image_width;
        delete n.og_preview_image_height;
        return n;
      });
      return;
    }

    try {
      const nextMeta = { ...eventMetadata };
      delete nextMeta.og_preview_image_width;
      delete nextMeta.og_preview_image_height;

      await updateEvent({
        id: eventId,
        og_preview_image_url: null,
        metadata: mergeEventMetadata(nextMeta),
      });

      setEventMetadata(mergeEventMetadata(nextMeta));
      setOgPreviewImageUrl('');

      toast({
        title: 'Success',
        description: 'Facebook/WhatsApp preview removed',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove Facebook/WhatsApp preview',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!eventId || !effectiveOrgId || collabEditorContext) return;

    try {
      setDeleting(true);
      await deleteEvent(eventId, effectiveOrgId);
      toast({
        title: 'Success',
        description: 'Event deleted successfully',
      });
      navigate('/app/catalog?tab=events');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete event',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];
    
    if (!effectiveOrgId) {
      errors.push('Organization is required');
    }
    if (!title.trim()) {
      errors.push('Event title is required');
    }
    if (!startAt) {
      errors.push('Time Slot 1 start date and time is required');
    }
    if (!endAt) {
      errors.push('Time Slot 1 end date and time is required');
    }
    if (startAt && endAt && startAt >= endAt) {
      errors.push('Time Slot 1 end time must be after start time');
    }

    const optionalSlots = [
      { number: 2, start: day2StartAt, end: day2EndAt, previousEnd: endAt },
      { number: 3, start: day3StartAt, end: day3EndAt, previousEnd: day2EndAt ?? endAt },
      { number: 4, start: day4StartAt, end: day4EndAt, previousEnd: day3EndAt ?? day2EndAt ?? endAt },
    ] as const;

    for (const slot of optionalSlots) {
      const hasStart = slot.start != null;
      const hasEnd = slot.end != null;
      if (hasStart !== hasEnd) {
        errors.push(`Time Slot ${slot.number}: Both start and end times are required`);
        continue;
      }
      if (hasStart && hasEnd && slot.start! >= slot.end!) {
        errors.push(`Time Slot ${slot.number}: End time must be after start time`);
      }
      if (hasStart && hasEnd && slot.previousEnd && slot.start! < slot.previousEnd) {
        errors.push(`Time Slot ${slot.number}: Start time must be after the previous time slot ends`);
      }
    }

    if (hasMultipleTimeSlots) {
      configuredTimeSlots.forEach((slot) => {
        const raw = slotCapacities[slot.key];
        const cap = raw ? parseInt(raw, 10) : 0;
        if (!raw || cap <= 0) {
          errors.push(`Time Slot ${slot.slotNumber}: Total capacity is required`);
        } else {
          const poolSold = slotSoldCounts[slot.key]?.pool_sold ?? 0;
          if (cap < poolSold) {
            errors.push(
              `Time Slot ${slot.slotNumber}: Total capacity (${cap}) cannot be below already sold (${poolSold})`
            );
          }
        }
      });
    }
    
    // Validate ticket types if any are added
    if (ticketTypes.length > 0) {
      ticketTypes.forEach((tt, index) => {
        if (!tt.name.trim()) {
          errors.push(`Ticket Type ${index + 1}: Ticket name is required`);
        }
        // Price is optional - if empty or whitespace, it will be treated as 0 (free)
        const priceStr = (tt.price || '').trim();
        if (priceStr !== '' && (isNaN(parseFloat(priceStr)) || parseFloat(priceStr) < 0)) {
          errors.push(`Ticket Type ${index + 1}: Price must be a valid number >= 0`);
        }
        const label = tt.name.trim() || `Ticket Type ${index + 1}`;
        const usesPickOne = hasMultipleTimeSlots && !tt.is_all_access && ticketTypeUsesPickOneSlots(tt);

        if (usesPickOne) {
          const selected = tt.valid_for_slots || [];
          if (selected.length === 0) {
            errors.push(`${label}: Select at least one time slot`);
          }
          selected.forEach((slotKey) => {
            const raw = tt.slot_quotas?.[slotKey];
            const alloc = raw ? parseInt(raw, 10) : 0;
            const poolRaw = slotCapacities[slotKey];
            const poolCap = poolRaw ? parseInt(poolRaw, 10) : 0;
            const slotNum = configuredTimeSlots.find((s) => s.key === slotKey)?.slotNumber
              ?? slotKey.replace('day_', '');
            if (!raw || alloc <= 0) {
              errors.push(`${label}: Allocation for Time Slot ${slotNum} must be greater than 0`);
            } else if (poolCap > 0 && alloc > poolCap) {
              errors.push(`${label}: Allocation for Time Slot ${slotNum} cannot exceed pool capacity (${poolCap})`);
            }
            if (tt.id && alloc > 0) {
              const typeSold = slotSoldCounts[slotKey]?.by_ticket_type?.[tt.id] ?? 0;
              if (alloc < typeSold) {
                errors.push(
                  `${label}: Allocation for Time Slot ${slotNum} (${alloc}) cannot be below already sold (${typeSold})`
                );
              }
            }
          });
          if (ticketTypeHasVariantQuotas(tt.access_variants)) {
            errors.push(`${label}: Per-slot inventory cannot be combined with access variant quotas`);
          }
        } else if (!tt.quota || parseInt(tt.quota) <= 0) {
          errors.push(`${label}: Available tickets must be greater than 0`);
        }

        errors.push(
          ...validateScheduledAvailability(tt, index, effectiveEventEnd)
        );
        errors.push(
          ...validateAccessVariants(tt, index)
        );
      });
    }
    
    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      // Scroll to top to show errors
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    setValidationErrors([]);
    
    if (!currentOrg) {
      setValidationErrors(['Organization is required']);
      return;
    }

    if (!collabEditorContext) {
      const partnerErr = validateEventPartners(collabEnabled, eventPartners);
      if (partnerErr) {
        toast({ title: 'Validation', description: partnerErr, variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const slotCapacitiesPayload: SlotCapacities | null = hasMultipleTimeSlots
        ? Object.fromEntries(
            configuredTimeSlots.map((slot) => [
              slot.key,
              parseInt(slotCapacities[slot.key] || '0', 10),
            ])
          ) as SlotCapacities
        : null;

      // Prepare event data
      const eventData: CreateEventData = {
        org_id: effectiveOrgId!,
        title: title.trim(),
        description: description.trim() || undefined,
        instagram_preview_image_url: instagramPreviewImageUrl.trim() || null,
        og_preview_image_url: ogPreviewImageUrl.trim() || null,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        day_2_start_at: day2StartAt?.toISOString() ?? null,
        day_2_end_at: day2EndAt?.toISOString() ?? null,
        day_3_start_at: day3StartAt?.toISOString() ?? null,
        day_3_end_at: day3EndAt?.toISOString() ?? null,
        day_4_start_at: day4StartAt?.toISOString() ?? null,
        day_4_end_at: day4EndAt?.toISOString() ?? null,
        location_text: locationText.trim() || null,
        status: status,
        collect_attendee_info: collectAttendeeInfo,
        enable_stripe: enableStripe || null,
        enable_payme: enablePayme || null,
        enable_fps: enableFps || null,
        payme_link: paymeLink.trim() || null,
        fps_link: fpsLink.trim() || null,
        stripe_fee_bearer: enableStripe ? stripeFeeBearer : 'host',
        slot_capacities: slotCapacitiesPayload,
        metadata: mergeEventMetadata(),
      };

      let eventId: string;

      let savedEventId: string;
      let resolvedSlug = eventSlug;

      if (isEditMode && id) {
        // Update existing event
        const updatedEvent = await updateEvent({ id, ...eventData });
        savedEventId = id;
        setEventId(id);

        const updatedSlug = (updatedEvent as Event & { slug?: string }).slug;
        if (updatedSlug) {
          resolvedSlug = updatedSlug;
          setEventSlug(resolvedSlug);
        }

        // Handle ticket types: delete removed ones, update existing in parallel, create new sequentially
        const currentIds = ticketTypes.filter(tt => tt.id).map(tt => tt.id!);
        const toDelete = existingTicketTypes.filter(tt => !currentIds.includes(tt.id));

        const effectiveEventEndDate = getEffectiveEventEndDate({
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          day_2_start_at: day2StartAt?.toISOString() ?? null,
          day_2_end_at: day2EndAt?.toISOString() ?? null,
          day_3_start_at: day3StartAt?.toISOString() ?? null,
          day_3_end_at: day3EndAt?.toISOString() ?? null,
          day_4_start_at: day4StartAt?.toISOString() ?? null,
          day_4_end_at: day4EndAt?.toISOString() ?? null,
        });

        const mutations = ticketTypes.map((tt) =>
          buildTicketTypeMutationFromForm(
            tt,
            effectiveEventEndDate,
            hasMultipleTimeSlots,
            savedEventId,
            existingTicketTypes.find((e) => e.id === tt.id)
          )
        );
        await persistEventTicketTypes(
          savedEventId,
          toDelete.map((tt) => tt.id),
          mutations
        );
      } else {
        // Create new event
        const newEvent = await createEvent(eventData);
        savedEventId = newEvent.id;
        setEventId(newEvent.id);
        
        // Get slug from created event
        resolvedSlug = (newEvent as any).slug || eventSlug;
        setEventSlug(resolvedSlug);

        // Move temp uploads to permanent paths now that event id exists
        if (effectiveOrgId && user?.id) {
          try {
            const igTrim = instagramPreviewImageUrl.trim();
            const ogTrim = ogPreviewImageUrl.trim();
            const patch: {
              instagram_preview_image_url?: string | null;
              og_preview_image_url?: string | null;
            } = {};

            if (igTrim && igTrim.includes('/temp/')) {
              const nextIg = await migrateEventPreviewFromTemp(
                igTrim,
                `${effectiveOrgId}/${savedEventId}/instagram-preview.webp`
              );
              setInstagramPreviewImageUrl(nextIg);
              patch.instagram_preview_image_url = nextIg || null;
            }

            if (ogTrim && ogTrim.includes('/temp/')) {
              const nextOg = await migrateEventPreviewFromTemp(
                ogTrim,
                `${effectiveOrgId}/${savedEventId}/og-preview.webp`
              );
              setOgPreviewImageUrl(nextOg);
              patch.og_preview_image_url = nextOg || null;
            }

            if (Object.keys(patch).length > 0) {
              await updateEvent({ id: savedEventId, ...patch });
            }
          } catch (migrateErr: any) {
            console.error('[EventForm] migrate temp preview storage', migrateErr);
            toast({
              title: 'Warning',
              description:
                migrateErr?.message ||
                'Could not move preview images to permanent storage',
              variant: 'destructive',
            });
          }
        }

        // Create ticket types (sequential to preserve created_at ordering)
        const effectiveEventEndDate = getEffectiveEventEndDate({
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          day_2_start_at: day2StartAt?.toISOString() ?? null,
          day_2_end_at: day2EndAt?.toISOString() ?? null,
          day_3_start_at: day3StartAt?.toISOString() ?? null,
          day_3_end_at: day3EndAt?.toISOString() ?? null,
          day_4_start_at: day4StartAt?.toISOString() ?? null,
          day_4_end_at: day4EndAt?.toISOString() ?? null,
        });
        const createMutations = ticketTypes.map((tt) =>
          buildTicketTypeMutationFromForm(tt, effectiveEventEndDate, hasMultipleTimeSlots, savedEventId)
        );
        await persistEventTicketTypes(savedEventId, [], createMutations);
      }

      if (!collabEditorContext && effectiveOrgId) {
        const hasActivePartners = eventPartners.some((p) => !p.deleted);
        const shouldSyncPartners = collabEnabled || hasActivePartners;
        if (shouldSyncPartners) {
          await syncEventPartners({
            eventId: savedEventId,
            eventTitle: title.trim(),
            eventSlug: resolvedSlug,
            hostOrgId: effectiveOrgId,
            hostOrgSlug: effectiveOrgSlug,
            enabled: collabEnabled,
            partners: eventPartners,
          });
          const loaded = await loadEventPartners(savedEventId, effectiveOrgId);
          setEventPartners(loaded);
          setCollabEnabled(loaded.length > 0 ? true : collabEnabled);
          setPartnersReloadToken((n) => n + 1);
        }
      }

      if (isEditMode && id) {
        const refreshGeneration = ++saveGenerationRef.current;
        setSaving(false);
        toast({
          title: 'Success',
          description: 'Event updated successfully',
        });
        navigate(`/app/events/${id}?tab=edit`);
        void (async () => {
          try {
            const typesPromise = getTicketTypes(id, false, true);
            const soldCountsPromise = hasMultipleTimeSlots
              ? getEventSlotSoldCounts(id).catch(() => ({} as EventSlotSoldCounts))
              : Promise.resolve({} as EventSlotSoldCounts);
            const [types, soldCounts] = await Promise.all([typesPromise, soldCountsPromise]);
            if (saveGenerationRef.current !== refreshGeneration) return;
            setExistingTicketTypes(types);
            setSlotSoldCounts(soldCounts);
            setTicketTypes(mapTicketTypesFromApi(types));
          } catch (refreshErr) {
            console.warn('[EventForm] post-save ticket type refresh failed', refreshErr);
          }
        })();
      } else {
        setSaving(false);
        toast({
          title: 'Success',
          description: 'Event created successfully',
        });
        navigate('/app/catalog?tab=events');
      }
    } catch (error: any) {
      setSaving(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save event',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  const isQuotaUnlimited = (quota: string) => {
    const num = parseInt(quota);
    return isNaN(num) || num >= 999999;
  };

  return (
    <div className="w-full max-w-2xl mx-auto pb-12 px-4 overflow-x-hidden">
      {/* Header */}
      <div className="mb-1 overflow-hidden">
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-8 overflow-hidden">
        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-red-800">Please fix the following errors:</h3>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index} className="text-sm text-red-700">{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Section 1: Basic Information */}
        <div className="space-y-5 overflow-hidden">
          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Event Title
              <span className="text-red-500 ml-1">*</span>
            </h2>
            <Input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (validationErrors.length > 0) setValidationErrors([]);
              }}
              placeholder="e.g., Summer Music Festival 2024"
              required
              className="w-full"
            />
          </div>

          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Event Description
            </h2>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell people about your event..."
              rows={4}
              className="w-full rounded-2xl border-2 px-4 py-3"
              style={{
                borderColor: 'rgba(14,122,58,0.14)',
                backgroundColor: '#FBF8F4',
              }}
            />
          </div>

          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Preview Photo
            </h2>
            
            <div className="space-y-4 mt-3">
              {/* URL Input */}
              <Input
                type="url"
                value={instagramPreviewImageUrl}
                onChange={(e) => {
                  setInstagramPreviewImageUrl(e.target.value);
                  setEventMetadata((prev) => {
                    const n = { ...prev };
                    delete n.instagram_preview_image_width;
                    delete n.instagram_preview_image_height;
                    return n;
                  });
                }}
                placeholder="https://example.com/image.jpg"
                className="w-full text-ellipsis"
              />

              {/* Upload Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploadingPreview}
                    onChange={handlePreviewImageUpload}
                    className="flex-1"
                  />
                  {instagramPreviewImageUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemovePreviewImage}
                      disabled={uploadingPreview}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Preview Thumbnail */}
              {instagramPreviewImageUrl && (
                <div className="w-full max-w-[200px]">
                  <div className="aspect-[4/5] w-full overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                    <img
                      src={`${instagramPreviewImageUrl}${instagramPreviewImageUrl.includes('?') ? '&' : '?'}v=${previewImageCacheKey}`}
                      alt="Instagram preview"
                      className="w-full h-full object-cover object-center"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Facebook / WhatsApp Preview
              <span className="text-muted-foreground text-sm font-normal ml-2">(optional)</span>
            </h2>
            <p className="text-sm text-muted-foreground mb-2">
              Landscape ratio ~1.91:1 (e.g. 1200×600). Used for Facebook and WhatsApp link previews when people share your event URL. If omitted, the Preview Photo above may be cropped on those platforms.
            </p>
            <div className="space-y-4 mt-3">
              <Input
                type="url"
                value={ogPreviewImageUrl}
                onChange={(e) => {
                  setOgPreviewImageUrl(e.target.value);
                  setEventMetadata((prev) => {
                    const n = { ...prev };
                    delete n.og_preview_image_width;
                    delete n.og_preview_image_height;
                    return n;
                  });
                }}
                placeholder="https://example.com/og-banner.jpg"
                className="w-full text-ellipsis"
              />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploadingOgPreview}
                    onChange={handleOgPreviewImageUpload}
                    className="flex-1"
                  />
                  {ogPreviewImageUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveOgPreviewImage}
                      disabled={uploadingOgPreview}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {ogPreviewImageUrl && (
                <div className="w-full max-w-[320px]">
                  <div
                    className="aspect-[191/100] w-full overflow-hidden rounded-lg border"
                    style={{ borderColor: 'rgba(14,122,58,0.14)' }}
                  >
                    <img
                      src={`${ogPreviewImageUrl}${ogPreviewImageUrl.includes('?') ? '&' : '?'}v=${ogPreviewImageCacheKey}`}
                      alt="Facebook and WhatsApp link preview"
                      className="w-full h-full object-cover object-center"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 p-4 rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
            <h2 className="text-base md:text-lg font-semibold" style={{ color: '#0F1F17' }}>
              Time Slot 1
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium">
                  Time Slot 1 Start
                  <span className="text-red-500 ml-1">*</span>
                </Label>
                <DateTimeRow24
                  value={startAt}
                  onChange={(date) => {
                    setStartAt(date);
                    if (validationErrors.length > 0) setValidationErrors([]);
                  }}
                  disabled={false}
                  ariaLabel="Time Slot 1 start date and time"
                  className="mt-1 w-full"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">
                  Time Slot 1 End
                  <span className="text-red-500 ml-1">*</span>
                </Label>
                <DateTimeRow24
                  value={endAt}
                  onChange={(date) => {
                    setEndAt(date);
                    if (validationErrors.length > 0) setValidationErrors([]);
                  }}
                  disabled={false}
                  min={startAt || undefined}
                  ariaLabel="Time Slot 1 end date and time"
                  className="mt-1 w-full"
                />
              </div>
            </div>
            {hasMultipleTimeSlots && (
              <div className="max-w-xs">
                <Label htmlFor="slot-capacity-day_1" className="text-sm font-medium">
                  Total capacity
                  <span className="text-red-500 ml-1">*</span>
                </Label>
                <Input
                  id="slot-capacity-day_1"
                  type="number"
                  min="1"
                  value={slotCapacities.day_1 ?? ''}
                  onChange={(e) => updateSlotCapacity('day_1', e.target.value)}
                  placeholder="100"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Shared venue capacity for Time Slot 1. All ticket types draw from this pool.
                </p>
              </div>
            )}
          </div>

          {hasTimeSlot2 && (
            <OptionalTimeSlotFields
              slotNumber={2}
              startAt={day2StartAt}
              endAt={day2EndAt}
              minStart={endAt || undefined}
              onStartChange={setDay2StartAt}
              onEndChange={setDay2EndAt}
              showCapacity={hasMultipleTimeSlots}
              capacityValue={slotCapacities.day_2}
              onCapacityChange={(v) => updateSlotCapacity('day_2', v)}
              onRemove={() => {
                setDay2StartAt(null);
                setDay2EndAt(null);
                setDay3StartAt(null);
                setDay3EndAt(null);
                setDay4StartAt(null);
                setDay4EndAt(null);
                setSlotCapacities((prev) => {
                  const next = { ...prev };
                  delete next.day_2;
                  delete next.day_3;
                  delete next.day_4;
                  return next;
                });
                setTicketTypes((prev) =>
                  prev.map((tt) => {
                    const nextSlots = stripSlotFromValidForSlots(tt.valid_for_slots, 'day_2') ?? ['day_1'];
                    return {
                      ...tt,
                      valid_for_slots: nextSlots,
                      valid_for_days: deriveValidForDaysFromSlots(nextSlots, !!tt.is_all_access),
                      slot_quotas: stripSlotFromSlotQuotas(tt.slot_quotas, 'day_2'),
                    };
                  })
                );
              }}
              onValidationClear={() => {
                if (validationErrors.length > 0) setValidationErrors([]);
              }}
            />
          )}

          {hasTimeSlot3 && (
            <OptionalTimeSlotFields
              slotNumber={3}
              startAt={day3StartAt}
              endAt={day3EndAt}
              minStart={day2EndAt || endAt || undefined}
              onStartChange={setDay3StartAt}
              onEndChange={setDay3EndAt}
              showCapacity={hasMultipleTimeSlots}
              capacityValue={slotCapacities.day_3}
              onCapacityChange={(v) => updateSlotCapacity('day_3', v)}
              onRemove={() => {
                setDay3StartAt(null);
                setDay3EndAt(null);
                setDay4StartAt(null);
                setDay4EndAt(null);
                setSlotCapacities((prev) => {
                  const next = { ...prev };
                  delete next.day_3;
                  delete next.day_4;
                  return next;
                });
                setTicketTypes((prev) =>
                  prev.map((tt) => {
                    const stripped = stripSlotFromValidForSlots(tt.valid_for_slots, 'day_3');
                    const nextSlots = stripped && stripped.length > 0 ? stripped : ['day_1'];
                    return {
                      ...tt,
                      valid_for_slots: nextSlots,
                      valid_for_days: deriveValidForDaysFromSlots(nextSlots, !!tt.is_all_access),
                      slot_quotas: stripSlotFromSlotQuotas(tt.slot_quotas, 'day_3'),
                    };
                  })
                );
              }}
              onValidationClear={() => {
                if (validationErrors.length > 0) setValidationErrors([]);
              }}
            />
          )}

          {hasTimeSlot4 && (
            <OptionalTimeSlotFields
              slotNumber={4}
              startAt={day4StartAt}
              endAt={day4EndAt}
              minStart={day3EndAt || day2EndAt || endAt || undefined}
              onStartChange={setDay4StartAt}
              onEndChange={setDay4EndAt}
              showCapacity={hasMultipleTimeSlots}
              capacityValue={slotCapacities.day_4}
              onCapacityChange={(v) => updateSlotCapacity('day_4', v)}
              onRemove={() => {
                setDay4StartAt(null);
                setDay4EndAt(null);
                setSlotCapacities((prev) => {
                  const next = { ...prev };
                  delete next.day_4;
                  return next;
                });
                setTicketTypes((prev) =>
                  prev.map((tt) => {
                    const stripped = stripSlotFromValidForSlots(tt.valid_for_slots, 'day_4');
                    const nextSlots = stripped && stripped.length > 0 ? stripped : ['day_1'];
                    return {
                      ...tt,
                      valid_for_slots: nextSlots,
                      valid_for_days: deriveValidForDaysFromSlots(nextSlots, !!tt.is_all_access),
                      slot_quotas: stripSlotFromSlotQuotas(tt.slot_quotas, 'day_4'),
                    };
                  })
                );
              }}
              onValidationClear={() => {
                if (validationErrors.length > 0) setValidationErrors([]);
              }}
            />
          )}

          {!hasTimeSlot4 && (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!startAt || !endAt) return;
                  const previousEnd = hasTimeSlot3
                    ? day3EndAt!
                    : hasTimeSlot2
                      ? day2EndAt!
                      : endAt;
                  const { start, end } = getDefaultNextSlotTimes(previousEnd);
                  if (!hasTimeSlot2) {
                    setDay2StartAt(start);
                    setDay2EndAt(end);
                  } else if (!hasTimeSlot3) {
                    setDay3StartAt(start);
                    setDay3EndAt(end);
                  } else {
                    setDay4StartAt(start);
                    setDay4EndAt(end);
                  }
                }}
                disabled={!startAt || !endAt}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Time Slot {hasTimeSlot2 ? (hasTimeSlot3 ? 4 : 3) : 2}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Add another time slot for multi-session events. Ticket types can then be set to a specific time slot or all time slots.
              </p>
            </div>
          )}

          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Location
            </h2>
            <Input
              type="text"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="e.g., Koko Coffee @ G10, The Mills"
              className="w-full"
            />
          </div>

          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Information Collection
            </h2>
            <RadioGroup
              value={collectAttendeeInfo}
              onValueChange={(value) => setCollectAttendeeInfo(value as 'primary' | 'per_ticket')}
              className="space-y-3"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="primary" id="primary" />
                <Label htmlFor="primary" className="font-normal cursor-pointer">
                  Primary Booker Only
                  <span className="block text-xs text-muted-foreground mt-1">
                    Collect contact information for the person making the booking
                  </span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="per_ticket" id="per_ticket" />
                <Label htmlFor="per_ticket" className="font-normal cursor-pointer">
                  Per-Ticket Information
                  <span className="block text-xs text-muted-foreground mt-1">
                    Collect name and email for each individual ticket holder
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Event Ticket Terms & Conditions
            </h2>
            <p className="text-sm text-muted-foreground mb-2">
              These terms will be shown to participants during checkout. You can edit the default text.
            </p>
            <Textarea
              value={ticketTermsAndConditions}
              onChange={(e) => setTicketTermsAndConditions(e.target.value)}
              placeholder={DEFAULT_EVENT_TICKET_TERMS}
              rows={5}
              className="w-full rounded-2xl border-2 px-4 py-3 font-mono text-sm"
              style={{
                borderColor: 'rgba(14,122,58,0.14)',
                backgroundColor: '#FBF8F4',
              }}
            />
          </div>

          <div
            className="rounded-2xl border p-4 space-y-4"
            style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="marketing-opt-in-enabled" className="text-sm font-medium cursor-pointer">
                  Show optional marketing opt-in checkbox
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Optional for participants — left unchecked by default
                </p>
              </div>
              <Switch
                id="marketing-opt-in-enabled"
                checked={marketingOptInEnabled}
                onCheckedChange={setMarketingOptInEnabled}
              />
            </div>
            {marketingOptInEnabled && (
              <div>
                <Label htmlFor="marketing-opt-in-label" className="text-sm font-medium mb-2 block">
                  Checkbox label
                </Label>
                <Input
                  id="marketing-opt-in-label"
                  value={marketingOptInLabel}
                  onChange={(e) => setMarketingOptInLabel(e.target.value)}
                  placeholder={DEFAULT_MARKETING_OPT_IN_LABEL}
                  className="w-full rounded-2xl border-2 px-4 py-3 text-sm"
                  style={{
                    borderColor: 'rgba(14,122,58,0.14)',
                    backgroundColor: '#FBF8F4',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Section 2.5: Payment Methods */}
        <div className="space-y-6">
          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Payment Methods
            </h2>
            {paymentDefaultsLoaded && (
              <p className="text-xs text-muted-foreground">
                Pre-filled from your{' '}
                <Link to="/app/settings/brand-page" className="underline hover:text-foreground">
                  Brand Page settings
                </Link>
                . You can override for this event.
              </p>
            )}
          </div>

          <div className="space-y-4">
            {/* Stripe */}
            <div className="border rounded-lg p-4" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5" style={{ color: '#0E7A3A' }} />
                  <div>
                    <Label htmlFor="enable-stripe" className="text-xs md:text-sm font-medium cursor-pointer">
                      Credit Card
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Secure online card payments
                    </p>
                  </div>
                </div>
                <Switch
                  id="enable-stripe"
                  checked={enableStripe}
                  onCheckedChange={setEnableStripe}
                />
              </div>
              {enableStripe && (
                <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                  <Label className="text-xs md:text-sm font-medium">Credit card service charge (3.4% + HK$2.35)</Label>
                  <p className="text-xs text-muted-foreground">
                    Applies to Stripe card payments only.
                  </p>
                  <RadioGroup
                    value={stripeFeeBearer}
                    onValueChange={(value) => setStripeFeeBearer(value as 'host' | 'user')}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="host" id="stripe-fee-host" />
                      <Label htmlFor="stripe-fee-host" className="text-xs md:text-sm font-normal cursor-pointer">
                        Host bears service charge
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="user" id="stripe-fee-user" />
                      <Label htmlFor="stripe-fee-user" className="text-xs md:text-sm font-normal cursor-pointer">
                        Buyer bears service charge
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>

            {/* PayMe */}
            <div className="border rounded-lg p-4" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5" style={{ color: '#0E7A3A' }} />
                  <div>
                    <Label htmlFor="enable-payme" className="text-xs md:text-sm font-medium cursor-pointer">
                      PayMe
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Customers upload PayMe receipt after payment
                    </p>
                  </div>
                </div>
                <Switch
                  id="enable-payme"
                  checked={enablePayme}
                  onCheckedChange={setEnablePayme}
                />
              </div>
              {enablePayme && (
                <div className="mt-3">
                  <Label htmlFor="payme-link" className="text-xs md:text-sm font-medium mb-2 block">
                    PayMe Payment Link
                  </Label>
                  <Input
                    id="payme-link"
                    type="url"
                    value={paymeLink}
                    onChange={(e) => setPaymeLink(e.target.value)}
                    placeholder="https://payme.hsbc.com.hk/..."
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* FPS */}
            <div className="border rounded-lg p-4" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <QrCode className="h-5 w-5" style={{ color: '#0E7A3A' }} />
                  <div>
                    <Label htmlFor="enable-fps" className="text-xs md:text-sm font-medium cursor-pointer">
                      FPS (Faster Payment System)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Customers upload FPS receipt/screenshot after payment
                    </p>
                  </div>
                </div>
                <Switch
                  id="enable-fps"
                  checked={enableFps}
                  onCheckedChange={setEnableFps}
                />
              </div>
              {enableFps && (
                <div className="mt-3">
                  <Label htmlFor="fps-link" className="text-xs md:text-sm font-medium mb-2 block">
                    FPS Payment Link or QR Code
                  </Label>
                  <Input
                    id="fps-link"
                    type="url"
                    value={fpsLink}
                    onChange={(e) => setFpsLink(e.target.value)}
                    placeholder="https://..."
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Section 3: Ticket Types (Progressive Disclosure) */}
        {showTicketTypesSection ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
                Available Ticket Types
              </h2>
            </div>

            {ticketTypes.length === 0 ? (
              <div className="border-2 border-dashed rounded-lg p-8 text-center" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addTicketType}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Ticket Type
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {ticketTypes.map((tt, index) => (
                  <div 
                    key={index} 
                    className="border rounded-lg p-6 space-y-4" 
                    style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium" style={{ color: '#0F1F17' }}>
                        Ticket Type {index + 1}
                      </h3>
                      {ticketTypes.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTicketType(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div>
                      <Label htmlFor={`ticket-name-${index}`} className="text-xs md:text-sm font-medium">
                        Ticket name
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input
                        id={`ticket-name-${index}`}
                        type="text"
                        value={tt.name}
                        onChange={(e) => {
                          updateTicketTypeForm(index, 'name', e.target.value);
                          if (validationErrors.length > 0) setValidationErrors([]);
                        }}
                        placeholder="e.g., General Admission, VIP, Early Bird"
                        required
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`ticket-description-${index}`} className="text-xs md:text-sm font-medium">
                        Ticket description
                        <span className="text-muted-foreground font-normal ml-1">
                          (optional, {TICKET_TYPE_DESCRIPTION_MAX_LENGTH} chars max)
                        </span>
                      </Label>
                      <Textarea
                        id={`ticket-description-${index}`}
                        value={tt.description || ''}
                        onChange={(e) => updateTicketTypeForm(index, 'description', e.target.value || null)}
                        placeholder="Optional: What this ticket includes (e.g. VIP access, refreshments)"
                        maxLength={TICKET_TYPE_DESCRIPTION_MAX_LENGTH}
                        rows={3}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(tt.description?.length ?? 0)}/{TICKET_TYPE_DESCRIPTION_MAX_LENGTH}
                      </p>
                    </div>

                    {hasMultipleTimeSlots && (
                      <div className="space-y-3">
                        <Label className="text-xs md:text-sm font-medium">Valid for</Label>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`all-access-${index}`}
                            checked={!!tt.is_all_access}
                            onCheckedChange={(checked) =>
                              setTicketTypeAllAccess(index, checked === true)
                            }
                          />
                          <Label htmlFor={`all-access-${index}`} className="text-sm font-normal cursor-pointer">
                            All time slots (one ticket grants every slot)
                          </Label>
                        </div>
                        {!tt.is_all_access && (
                          <>
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                              {configuredTimeSlots.map((slot) => (
                                <div key={slot.key} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`slot-select-${index}-${slot.key}`}
                                    checked={(tt.valid_for_slots || []).includes(slot.key)}
                                    onCheckedChange={(checked) =>
                                      toggleTicketTypeSlot(index, slot.key, checked === true)
                                    }
                                  />
                                  <Label
                                    htmlFor={`slot-select-${index}-${slot.key}`}
                                    className="text-sm font-normal cursor-pointer"
                                  >
                                    Time Slot {slot.slotNumber}
                                  </Label>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => selectAllTicketTypeSlots(index)}
                              >
                                Select all slots
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Buyer picks one slot at checkout. Ticket types share the venue pool per slot.
                            </p>
                          </>
                        )}
                        {tt.is_all_access && (
                          <p className="text-xs text-muted-foreground">
                            Uses a single ticket quota (not deducted from per-slot venue pools).
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`ticket-price-${index}`} className="text-xs md:text-sm font-medium">
                          Price ($)
                        </Label>
                        <Input
                          id={`ticket-price-${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={tt.price}
                          onChange={(e) => {
                            updateTicketTypeForm(index, 'price', e.target.value);
                            if (validationErrors.length > 0) setValidationErrors([]);
                          }}
                          placeholder="0.00 (leave empty for free)"
                          className="mt-1"
                        />
                      </div>

                      {(!hasMultipleTimeSlots || tt.is_all_access) && (
                        <div>
                          <Label htmlFor={`ticket-quota-${index}`} className="text-xs md:text-sm font-medium">
                            Available tickets
                            <span className="text-red-500 ml-1">*</span>
                          </Label>
                          <Input
                            id={`ticket-quota-${index}`}
                            type="number"
                            min="1"
                            value={tt.quota}
                            onChange={(e) => {
                              updateTicketTypeForm(index, 'quota', e.target.value);
                              if (validationErrors.length > 0) setValidationErrors([]);
                            }}
                            placeholder="100"
                            required
                            className="mt-1"
                          />
                        </div>
                      )}
                    </div>

                    {hasMultipleTimeSlots && !tt.is_all_access && (tt.valid_for_slots || []).length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-xs md:text-sm font-medium">
                          Allocation per time slot
                          <span className="text-red-500 ml-1">*</span>
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(tt.valid_for_slots || []).map((slotKey) => {
                            const slot = configuredTimeSlots.find((s) => s.key === slotKey);
                            const poolCap = slotCapacities[slotKey]
                              ? parseInt(slotCapacities[slotKey], 10)
                              : undefined;
                            return (
                              <div key={slotKey}>
                                <Label htmlFor={`slot-quota-${index}-${slotKey}`} className="text-xs font-medium">
                                  Time Slot {slot?.slotNumber ?? slotKey.replace('day_', '')}
                                  {poolCap != null && !Number.isNaN(poolCap) && (
                                    <span className="text-muted-foreground font-normal">
                                      {' '}/ pool {poolCap}
                                    </span>
                                  )}
                                  {slot && (
                                    <span className="block font-normal text-muted-foreground">
                                      {formatSlotRange(slot.startAt, slot.endAt)}
                                    </span>
                                  )}
                                </Label>
                                <Input
                                  id={`slot-quota-${index}-${slotKey}`}
                                  type="number"
                                  min="1"
                                  max={poolCap && poolCap > 0 ? poolCap : undefined}
                                  value={tt.slot_quotas?.[slotKey] ?? ''}
                                  onChange={(e) => updateSlotQuota(index, slotKey, e.target.value)}
                                  placeholder={poolCap ? String(poolCap) : '100'}
                                  required
                                  className="mt-1"
                                />
                              </div>
                            );
                          })}
                        </div>
                        {ticketTypeHasVariantQuotas(tt.access_variants) && (
                          <p className="text-xs text-amber-700">
                            Per-slot allocation cannot be combined with access variant quotas.
                          </p>
                        )}
                      </div>
                    )}

                    {/* On Sale Toggle */}
                    <div className="pt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Label htmlFor={`ticket-is-active-${index}`} className="text-xs md:text-sm font-medium">
                            On sale
                          </Label>
                        </div>
                        <Switch
                          id={`ticket-is-active-${index}`}
                          checked={tt.is_active !== undefined ? tt.is_active : true}
                          onCheckedChange={(checked) => updateTicketTypeForm(index, 'is_active', checked)}
                        />
                      </div>
                    </div>

                    {/* Available Time Section */}
                    <div className="pt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                        <Label htmlFor={`availability-mode-${index}`} className="text-xs md:text-sm font-medium sm:pt-2 sm:w-[120px] sm:flex-shrink-0">
                          Available time
                        </Label>
                        <div className="flex-1 sm:max-w-[260px]">
                          <Select
                            value={tt.availability_mode || 'always'}
                            onValueChange={(value) => updateTicketTypeForm(index, 'availability_mode', value as any)}
                            disabled={tt.is_active === false}
                          >
                            <SelectTrigger id={`availability-mode-${index}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="always">Always</SelectItem>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                            </SelectContent>
                          </Select>
                          {tt.availability_mode === 'scheduled' && (
                            <div className="space-y-3 mt-3" style={{ marginLeft: '0' }}>
                              <div>
                                <Label htmlFor={`available-start-${index}`} className="text-xs font-medium">
                                  Sales start
                                </Label>
                                <DateTimeRow24
                                  id={`available-start-${index}`}
                                  value={tt.available_start_at || null}
                                  onChange={(date) => {
                                    setTicketTypes((prev) => prev.map((t, i) => {
                                      if (i !== index) return t;
                                      const next = { ...t, available_start_at: date };
                                      if (date && t.available_end_at && date >= t.available_end_at) {
                                        next.available_end_at = null;
                                      }
                                      return next;
                                    }));
                                    if (validationErrors.length > 0) setValidationErrors([]);
                                  }}
                                  disabled={tt.is_active === false}
                                  max={effectiveEventEnd || undefined}
                                  ariaLabel="Sales start date and time"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor={`available-end-${index}`} className="text-xs font-medium">
                                  Sales end
                                </Label>
                                <DateTimeRow24
                                  id={`available-end-${index}`}
                                  value={tt.available_end_at || null}
                                  onChange={(date) => {
                                    if (date && effectiveEventEnd && date > effectiveEventEnd) {
                                      updateTicketTypeForm(index, 'available_end_at', effectiveEventEnd);
                                    } else {
                                      updateTicketTypeForm(index, 'available_end_at', date);
                                    }
                                    if (validationErrors.length > 0) setValidationErrors([]);
                                  }}
                                  disabled={tt.is_active === false}
                                  min={tt.available_start_at || undefined}
                                  max={effectiveEventEnd || undefined}
                                  ariaLabel="Sales end date and time"
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Access & Visibility Section - Multiple variants per ticket */}
                    <div className="pt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                      <Label className="text-xs md:text-sm font-medium block mb-3">
                        Access & Visibility
                      </Label>
                      <p className="text-xs text-muted-foreground mb-3">
                        Add multiple access rules. Each can have a different price or discount %.
                      </p>
                      {(tt.access_variants || [{ visibility_mode: 'public', access_code: null, allowed_affiliates: null, price_override: null, discount_percent: null, quota: null, is_active: true }]).map((variant, vIdx) => (
                        <div key={vIdx} className="mb-4 p-4 rounded-lg border space-y-3" style={{ borderColor: 'rgba(14,122,58,0.2)', backgroundColor: 'rgba(251,248,244,0.3)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <Select
                              value={variant.visibility_mode}
                              onValueChange={(value) => handleUpdateAccessVariant(index, vIdx, 'visibility_mode', value as any)}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="public">Public</SelectItem>
                                <SelectItem value="code">Code</SelectItem>
                                <SelectItem value="affiliate">Affiliate</SelectItem>
                                <SelectItem value="hidden">Hidden</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <Label htmlFor={`variant-active-${index}-${vIdx}`} className="text-xs">Active</Label>
                                <Switch
                                  id={`variant-active-${index}-${vIdx}`}
                                  checked={variant.is_active !== false}
                                  onCheckedChange={(checked) => handleUpdateAccessVariant(index, vIdx, 'is_active', checked)}
                                />
                              </div>
                              {(tt.access_variants?.length ?? 1) > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveAccessVariant(index, vIdx)} className="text-red-600 hover:text-red-700">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {variant.visibility_mode === 'code' && (
                            <div className="flex gap-2">
                              <Input
                                type="text"
                                value={variant.access_code || ''}
                                onChange={(e) => handleUpdateAccessVariant(index, vIdx, 'access_code', e.target.value || null)}
                                placeholder="Enter access code"
                                className="flex-1"
                              />
                              <Button type="button" variant="outline" size="sm" onClick={() => handleGenerateCodeForVariant(index, vIdx)}>
                                Generate
                              </Button>
                            </div>
                          )}
                          {variant.visibility_mode === 'affiliate' && (
                            <Textarea
                              value={variant.allowed_affiliates?.join(', ') || ''}
                              onChange={(e) => {
                                const affiliates = e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                                handleUpdateAccessVariant(index, vIdx, 'allowed_affiliates', affiliates.length > 0 ? affiliates : null);
                              }}
                              placeholder="Allowed affiliate slugs (comma-separated)"
                              rows={2}
                              className="text-sm"
                            />
                          )}
                          {(variant.visibility_mode === 'code' || variant.visibility_mode === 'affiliate') && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs font-medium">New price ($)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={variant.price_override ?? ''}
                                  onChange={(e) => {
                                    const v = e.target.value.trim();
                                    handleUpdateAccessVariant(index, vIdx, 'price_override', v ? v : null, v ? { discount_percent: null } : undefined);
                                  }}
                                  placeholder="Override price"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-xs font-medium">Discount %</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={variant.discount_percent ?? ''}
                                  onChange={(e) => {
                                    const v = e.target.value.trim();
                                    handleUpdateAccessVariant(index, vIdx, 'discount_percent', v ? v : null, v ? { price_override: null } : undefined);
                                  }}
                                  placeholder="e.g. 20"
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          )}
                          <div>
                            <Label className="text-xs font-medium">Quota (optional)</Label>
                            <Input
                              type="number"
                              min="1"
                              value={variant.quota ?? ''}
                              disabled={
                                hasMultipleTimeSlots
                                && !tt.is_all_access
                                && ticketTypeUsesPickOneSlots(tt)
                              }
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                handleUpdateAccessVariant(index, vIdx, 'quota', v ? v : null);
                              }}
                              placeholder={
                                hasMultipleTimeSlots && !tt.is_all_access && ticketTypeUsesPickOneSlots(tt)
                                  ? 'Not available with per-slot inventory'
                                  : 'Use ticket type quota'
                              }
                              className="mt-1 max-w-[120px]"
                            />
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {hasMultipleTimeSlots && !tt.is_all_access && ticketTypeUsesPickOneSlots(tt)
                                ? 'Variant quotas are disabled when using per-slot allocation.'
                                : 'Max tickets through this variant. Leave empty to use ticket type quota.'}
                            </p>
                          </div>
                          {variant.visibility_mode === 'code' && variant.access_code && eventId && eventSlug && effectiveOrgSlug && (
                            <div>
                              <Label className="text-xs font-medium mb-1 block">Share Ticket Link</Label>
                              <div className="flex gap-2">
                                <Input readOnly value={`https://growbrohk.com/${effectiveOrgSlug}/${eventSlug}?code=${variant.access_code}`} className="flex-1 font-mono text-xs" />
                                <Button type="button" variant="outline" size="sm" onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(`https://growbrohk.com/${effectiveOrgSlug}/${eventSlug}?code=${variant.access_code}`);
                                    toast({ title: 'Copied!', description: 'Ticket link copied to clipboard' });
                                  } catch (err) {
                                    toast({ title: 'Error', description: 'Failed to copy', variant: 'destructive' });
                                  }
                                }}>
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => handleAddAccessVariant(index)} className="mt-2">
                        <Plus className="h-4 w-4 mr-1" />
                        Add access variant
                      </Button>
                    </div>

                    {/* Remaining Count Display Settings */}
                    <div className="pt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <Label htmlFor={`show-remaining-count-${index}`} className="text-xs md:text-sm font-medium">
                            Show remaining count
                          </Label>
                        </div>
                        <Switch
                          id={`show-remaining-count-${index}`}
                          checked={tt.show_remaining_count !== undefined ? tt.show_remaining_count : true}
                          onCheckedChange={(checked) => updateTicketTypeForm(index, 'show_remaining_count', checked)}
                        />
                      </div>
                      {tt.show_remaining_count !== false && (
                        <div className="mt-3">
                          <Label htmlFor={`threshold-to-show-${index}`} className="text-xs font-medium">
                            Only show when remaining ≤ (optional)
                          </Label>
                          <Input
                            id={`threshold-to-show-${index}`}
                            type="number"
                            min="0"
                            value={tt.threshold_to_show !== null && tt.threshold_to_show !== undefined ? tt.threshold_to_show.toString() : ''}
                            onChange={(e) => {
                              const value = e.target.value.trim();
                              updateTicketTypeForm(index, 'threshold_to_show', value === '' ? null : parseInt(value, 10));
                            }}
                            placeholder="e.g., 10 (only show when ≤ 10 remaining)"
                            className="mt-1"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={addTicketType}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Ticket Type
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTicketTypesSection(true)}
              className="w-full"
              disabled={!title.trim() || !startAt || !endAt}
            >
              + Add ticket types (optional)
            </Button>
            {(!title.trim() || !startAt || !endAt) && (
              <p className="text-xs mt-2 text-center" style={{ color: 'rgba(15,31,23,0.6)' }}>
                Complete basic information above first
              </p>
            )}
          </div>
        )}

        {showTicketTypesSection && <Separator />}

        {/* Partner collab / affiliate (host only) */}
        {!collabEditorContext && (
          <>
            <EventCollabSection
              eventId={eventId ?? id ?? undefined}
              hostOrgId={effectiveOrgId}
              enabled={collabEnabled}
              onEnabledChange={setCollabEnabled}
              partners={eventPartners}
              onPartnersChange={setEventPartners}
              reloadToken={partnersReloadToken}
            />
            <Separator />
          </>
        )}

        {/* Section 3b: Add-ons (shown when event exists) */}
        {eventId && currentOrg && !collabEditorContext && (
          <>
            <EventAddonsSection eventId={eventId} orgId={currentOrg.id} />
            <Separator />
          </>
        )}

        {/* Section 4: Share Link (shown if event has ID and slug) */}
        {eventId && eventSlug && effectiveOrgSlug && (
          <>
            <div className="space-y-4">
              <div>
                <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
                  Share Link
                </h2>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
                  <Input
                    readOnly
                    value={`https://growbrohk.com/${effectiveOrgSlug}/${eventSlug}`}
                    className="flex-1 font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const url = `https://growbrohk.com/${effectiveOrgSlug}/${eventSlug}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          toast({
                            title: 'Copied!',
                            description: 'Link copied to clipboard',
                          });
                        } catch (err) {
                          toast({
                            title: 'Error',
                            description: 'Failed to copy link',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = `https://growbrohk.com/${effectiveOrgSlug}/${eventSlug}`;
                        window.open(url, '_blank');
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Section 5: Publishing (Progressive Disclosure) */}
        {showPublishingSection ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
                Event Status
              </h2>
              <div className="space-y-3 mt-3">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="draft"
                    checked={status === 'draft'}
                    onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="font-medium" style={{ color: '#0F1F17' }}>
                      Save as draft
                    </div>
                    <div className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                      Keep this event private until you're ready to publish
                    </div>
                  </div>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="published"
                    checked={status === 'published'}
                    onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="font-medium" style={{ color: '#0F1F17' }}>
                      Publish now
                    </div>
                    <div className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                      Make this event visible to the public immediately
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {/* Submit Button */}
        <div className="pt-6 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
          <div className="flex gap-4 justify-between">
            <div className="flex gap-2">
              {isEditMode && eventId && !collabEditorContext && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={saving || deleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Event
                </Button>
              )}
            </div>
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (isEditMode && id) {
                    navigate(`/app/events/${id}?tab=tickets`);
                  } else {
                    navigate('/app/catalog?tab=events');
                  }
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                style={{ backgroundColor: '#0E7A3A' }}
              >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isEditMode ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                isEditMode ? 'Update Event' : 'Create Event'
              )}
            </Button>
          </div>
        </div>
        </div>
      </form>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-2xl">Event Preview</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-4">
            {effectiveOrgId && title.trim() && startAt && endAt ? (
              <PublicEventForm
                event={{
                  id: eventId || generateUUID(),
                  org_id: effectiveOrgId,
                  title: title.trim(),
                  description: description || '',
                  start_at: startAt ? startAt.toISOString() : '',
                  end_at: endAt ? endAt.toISOString() : '',
                  day_2_start_at: day2StartAt ? day2StartAt.toISOString() : null,
                  day_2_end_at: day2EndAt ? day2EndAt.toISOString() : null,
                  day_3_start_at: day3StartAt ? day3StartAt.toISOString() : null,
                  day_3_end_at: day3EndAt ? day3EndAt.toISOString() : null,
                  day_4_start_at: day4StartAt ? day4StartAt.toISOString() : null,
                  day_4_end_at: day4EndAt ? day4EndAt.toISOString() : null,
                  status: 'published',
                  location_text: locationText || null,
                  instagram_preview_image_url: instagramPreviewImageUrl || null,
                  og_preview_image_url: ogPreviewImageUrl || null,
                  metadata: { ...eventMetadata },
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }}
                org={{
                  id: effectiveOrgId,
                  name: effectiveOrgName,
                  slug: effectiveOrgSlug ?? undefined,
                }}
                ticketTypes={ticketTypes.map((tt, index) => {
                  const previewTicketId = tt.id || `preview-${index}`;
                  const previewEventId = eventId || generateUUID();
                  return {
                    id: previewTicketId,
                    event_id: previewEventId,
                    name: tt.name.trim() || `Ticket Type ${index + 1}`,
                    price: (tt.price || '').trim() === '' ? 0 : (parseFloat(tt.price) || 0),
                    quota: isQuotaUnlimited(tt.quota) ? 999999 : parseInt(tt.quota) || 0,
                    description: (tt.description || '').trim() || null,
                    visibility_mode: tt.visibility_mode || 'public',
                    access_code: tt.access_code || null,
                    allowed_affiliates: tt.allowed_affiliates || null,
                    access_variants: mapAccessVariantsForPreview(
                      tt.access_variants,
                      previewTicketId,
                      tt
                    ),
                    is_active: tt.is_active !== undefined ? tt.is_active : true,
                    availability_mode: tt.availability_mode || 'always',
                    available_start_at: tt.available_start_at ? tt.available_start_at.toISOString() : null,
                    available_end_at: tt.available_end_at ? tt.available_end_at.toISOString() : null,
                    valid_for_days: tt.valid_for_days || 'day_1',
                    valid_for_slots: tt.valid_for_slots && tt.valid_for_slots.length > 0
                      ? tt.valid_for_slots
                      : null,
                    metadata: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                })}
                mode="preview"
              />
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Please fill in the event title, start date, and end date to preview.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this event? This will permanently remove the event, all orders, tickets, and associated photos. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
