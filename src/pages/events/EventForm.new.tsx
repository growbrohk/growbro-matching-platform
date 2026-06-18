import { useState, useEffect, FormEvent } from 'react';
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
  createTicketType, 
  updateTicketType, 
  deleteTicketType, 
  getTicketTypes,
  type CreateEventData,
  type CreateTicketTypeData 
} from '@/lib/api/events';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Event, TicketType, TicketTypeAccessVariant } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X } from 'lucide-react';
import EventDescription from '@/components/events/EventDescription';
import EventMediaBlock from '@/components/events/EventMediaBlock';
import PublicEventForm from '@/components/events/PublicEventForm';
import { EventAddonsSection } from '@/components/events/EventAddonsSection';
import { datetimeLocalToUTC, utcToDatetimeLocal } from '@/lib/utils/datetime';
import { DateTimeRow24 } from '@/components/ui/DateTimeRow24';
import { compressImageToWebp } from '@/lib/images/compressReceiptImage';
import { DEFAULT_EVENT_TICKET_TERMS } from '@/lib/constants/eventTicketTerms';
import { TICKET_TYPE_DESCRIPTION_MAX_LENGTH } from '@/lib/constants/events';
import { getEventPreviewStoragePathFromPublicUrl } from '@/lib/storage/eventPreviewPaths';
import { getOrgPaymentDefaults } from '@/lib/api/orgs';

export type EventFormCollabEditorContext = {
  hostOrgId: string;
  hostOrgSlug: string | null;
  hostOrgName: string;
};

type EventFormProps = {
  collabEditorContext?: EventFormCollabEditorContext | null;
};

interface AccessVariantForm {
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
  valid_for_days?: 'day_1' | 'day_2' | 'both';
  show_remaining_count?: boolean;
  threshold_to_show?: number | null;
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
  const [eventMetadata, setEventMetadata] = useState<Record<string, any>>({});

  // Ticket types
  const [ticketTypes, setTicketTypes] = useState<TicketTypeForm[]>([]);
  const [existingTicketTypes, setExistingTicketTypes] = useState<TicketType[]>([]);

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
        setDay2StartAt((event as any).day_2_start_at ? new Date((event as any).day_2_start_at) : null);
        setDay2EndAt((event as any).day_2_end_at ? new Date((event as any).day_2_end_at) : null);
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

        // Load ticket types with access variants
        const types = await getTicketTypes(id, false, true);
        setExistingTicketTypes(types);
        setTicketTypes(types.map(t => {
          const variants = t.access_variants && t.access_variants.length > 0
            ? t.access_variants.map((v: TicketTypeAccessVariant) => ({
                visibility_mode: v.visibility_mode,
                access_code: v.access_code || null,
                allowed_affiliates: v.allowed_affiliates || null,
                price_override: v.price_override != null ? v.price_override.toString() : null,
                discount_percent: v.discount_percent != null ? v.discount_percent.toString() : null,
                quota: v.quota != null ? v.quota.toString() : null,
                is_active: (v as any).is_active !== false,
              }))
            : [{
                visibility_mode: (t.visibility_mode || 'public') as 'public' | 'code' | 'affiliate' | 'hidden',
                access_code: t.access_code || null,
                allowed_affiliates: t.allowed_affiliates || null,
                price_override: null,
                discount_percent: null,
                quota: null,
                is_active: true,
              }];
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
            valid_for_days: (t.valid_for_days as 'day_1' | 'day_2' | 'both') || 'day_1',
            show_remaining_count: t.show_remaining_count !== undefined ? t.show_remaining_count : true,
            threshold_to_show: t.threshold_to_show !== undefined ? t.threshold_to_show : null,
          };
        }));

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

  const hasDay2 = day2StartAt != null && day2EndAt != null;
  const effectiveEventEnd = day2EndAt ?? endAt;

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
  }, [endAt, day2EndAt, effectiveEventEnd]);

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

  const updateTicketTypeForm = (index: number, field: keyof TicketTypeForm, value: string | string[] | null | boolean | Date | number) => {
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

      const mergedMeta = {
        ...eventMetadata,
        ticket_terms_and_conditions: ticketTermsAndConditions.trim() || DEFAULT_EVENT_TICKET_TERMS,
        instagram_preview_image_width: iw,
        instagram_preview_image_height: ih,
      };
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
        metadata: {
          ...nextMeta,
          ticket_terms_and_conditions: ticketTermsAndConditions.trim() || DEFAULT_EVENT_TICKET_TERMS,
        },
      });

      // Clear state
      setEventMetadata({
        ...nextMeta,
        ticket_terms_and_conditions: ticketTermsAndConditions.trim() || DEFAULT_EVENT_TICKET_TERMS,
      });
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

      const mergedMeta = {
        ...eventMetadata,
        ticket_terms_and_conditions: ticketTermsAndConditions.trim() || DEFAULT_EVENT_TICKET_TERMS,
        og_preview_image_width: ow,
        og_preview_image_height: oh,
      };
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
        metadata: {
          ...nextMeta,
          ticket_terms_and_conditions: ticketTermsAndConditions.trim() || DEFAULT_EVENT_TICKET_TERMS,
        },
      });

      setEventMetadata({
        ...nextMeta,
        ticket_terms_and_conditions: ticketTermsAndConditions.trim() || DEFAULT_EVENT_TICKET_TERMS,
      });
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
      errors.push('Event start date and time is required');
    }
    if (!endAt) {
      errors.push('Event end date and time is required');
    }
    if (startAt && endAt && startAt >= endAt) {
      errors.push('Event end time must be after start time');
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
        if (!tt.quota || parseInt(tt.quota) <= 0) {
          errors.push(`Ticket Type ${index + 1}: Available tickets must be greater than 0`);
        }

        errors.push(
          ...validateScheduledAvailability(tt, index, effectiveEventEnd)
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

    setSaving(true);
    try {
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
        location_text: locationText.trim() || null,
        status: status,
        collect_attendee_info: collectAttendeeInfo,
        enable_stripe: enableStripe || null,
        enable_payme: enablePayme || null,
        enable_fps: enableFps || null,
        payme_link: paymeLink.trim() || null,
        fps_link: fpsLink.trim() || null,
        stripe_fee_bearer: enableStripe ? stripeFeeBearer : 'host',
        metadata: {
          ...eventMetadata,
          ticket_terms_and_conditions: ticketTermsAndConditions.trim() || DEFAULT_EVENT_TICKET_TERMS,
        },
      };

      let eventId: string;

      let savedEventId: string;

      if (isEditMode && id) {
        // Update existing event
        const updatedEvent = await updateEvent({ id, ...eventData });
        savedEventId = id;
        setEventId(id);
        
        // Fetch updated event to get slug
        const refreshedEvent = await getEvent(id);
        if (refreshedEvent) {
          setEventSlug((refreshedEvent as any).slug || '');
        }

        // Handle ticket types: delete removed ones, update existing, create new
        const currentIds = ticketTypes.filter(tt => tt.id).map(tt => tt.id!);
        const toDelete = existingTicketTypes.filter(tt => !currentIds.includes(tt.id));
        
        for (const tt of toDelete) {
          await deleteTicketType(tt.id);
        }

        // Update or create ticket types
        const effectiveEventEnd = day2EndAt ? new Date(day2EndAt) : new Date(endAt);
        for (const tt of ticketTypes) {
          // Check if ticket has sales_end_at in metadata and auto-cap it to event.end_at if needed
          const ticketMetadata = (tt as any).metadata || {};
          let finalMetadata = { ...ticketMetadata };
          
          // If sales_end_at exists and is after event.end_at, cap it to event.end_at
          if (ticketMetadata.sales_end_at) {
            const salesEndAt = new Date(ticketMetadata.sales_end_at);
            if (salesEndAt > effectiveEventEnd) {
              finalMetadata.sales_end_at = effectiveEventEnd.toISOString();
            }
          }
          
          // Also check if sales_end_at is a direct field (for future schema changes)
          const salesEndAtField = (tt as any).sales_end_at;
          if (salesEndAtField) {
            const salesEndAt = new Date(salesEndAtField);
            if (salesEndAt > effectiveEventEnd) {
              finalMetadata.sales_end_at = effectiveEventEnd.toISOString();
            }
          }

          // Process availability fields
          const { availabilityMode, availableStartAt, availableEndAt } = processTicketAvailability(
            tt,
            effectiveEventEnd
          );

          const accessVariants = (tt.access_variants || []).map((v) => ({
            visibility_mode: v.visibility_mode,
            access_code: v.visibility_mode === 'code' ? (v.access_code || null) : null,
            allowed_affiliates: v.visibility_mode === 'affiliate' ? (v.allowed_affiliates || null) : null,
            price_override: v.price_override ? parseFloat(v.price_override) : null,
            discount_percent: v.discount_percent ? parseFloat(v.discount_percent) : null,
            quota: v.quota ? parseInt(v.quota, 10) : null,
            is_active: v.is_active !== false,
          }));

          if (tt.id && !tt.isNew) {
            // Update existing
            const priceStr = (tt.price || '').trim();
            const ticketPrice = priceStr === '' ? 0 : parseFloat(priceStr);
            await updateTicketType({
              id: tt.id,
              name: tt.name.trim(),
              price: ticketPrice,
              quota: parseInt(tt.quota),
              metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
              access_variants: accessVariants.length > 0 ? accessVariants : undefined,
              is_active: tt.is_active !== undefined ? tt.is_active : true,
              availability_mode: availabilityMode,
              available_start_at: availableStartAt,
              available_end_at: availableEndAt,
              valid_for_days: tt.valid_for_days || 'day_1',
              show_remaining_count: tt.show_remaining_count !== undefined ? tt.show_remaining_count : true,
              threshold_to_show: tt.threshold_to_show !== undefined ? tt.threshold_to_show : null,
              description: (tt.description || '').trim() || null,
            });
          } else {
            // Create new
            const priceStr = (tt.price || '').trim();
            const ticketPrice = priceStr === '' ? 0 : parseFloat(priceStr);
            await createTicketType({
              event_id: savedEventId,
              name: tt.name.trim(),
              price: ticketPrice,
              quota: parseInt(tt.quota),
              metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
              access_variants: accessVariants.length > 0 ? accessVariants : undefined,
              is_active: tt.is_active !== undefined ? tt.is_active : true,
              availability_mode: availabilityMode,
              available_start_at: availableStartAt,
              available_end_at: availableEndAt,
              valid_for_days: tt.valid_for_days || 'day_1',
              show_remaining_count: tt.show_remaining_count !== undefined ? tt.show_remaining_count : true,
              threshold_to_show: tt.threshold_to_show !== undefined ? tt.threshold_to_show : null,
              description: (tt.description || '').trim() || null,
            });
          }
        }
      } else {
        // Create new event
        const newEvent = await createEvent(eventData);
        savedEventId = newEvent.id;
        setEventId(newEvent.id);
        
        // Get slug from created event
        setEventSlug((newEvent as any).slug || '');

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

        // Create ticket types
        const effectiveEventEnd = day2EndAt ? new Date(day2EndAt) : new Date(endAt);
        for (const tt of ticketTypes) {
          // Check if ticket has sales_end_at in metadata and auto-cap it to event.end_at if needed
          const ticketMetadata = (tt as any).metadata || {};
          let finalMetadata = { ...ticketMetadata };
          
          // If sales_end_at exists and is after event.end_at, cap it to event.end_at
          if (ticketMetadata.sales_end_at) {
            const salesEndAt = new Date(ticketMetadata.sales_end_at);
            if (salesEndAt > effectiveEventEnd) {
              finalMetadata.sales_end_at = effectiveEventEnd.toISOString();
            }
          }
          
          // Also check if sales_end_at is a direct field (for future schema changes)
          const salesEndAtField = (tt as any).sales_end_at;
          if (salesEndAtField) {
            const salesEndAt = new Date(salesEndAtField);
            if (salesEndAt > effectiveEventEnd) {
              finalMetadata.sales_end_at = effectiveEventEnd.toISOString();
            }
          }

          // Process availability fields
          const { availabilityMode, availableStartAt, availableEndAt } = processTicketAvailability(
            tt,
            effectiveEventEnd
          );

          const accessVariantsCreate = (tt.access_variants || []).map((v) => ({
            visibility_mode: v.visibility_mode,
            access_code: v.visibility_mode === 'code' ? (v.access_code || null) : null,
            allowed_affiliates: v.visibility_mode === 'affiliate' ? (v.allowed_affiliates || null) : null,
            price_override: v.price_override ? parseFloat(v.price_override) : null,
            discount_percent: v.discount_percent ? parseFloat(v.discount_percent) : null,
            quota: v.quota ? parseInt(v.quota, 10) : null,
            is_active: v.is_active !== false,
          }));

          const priceStr = (tt.price || '').trim();
          const ticketPrice = priceStr === '' ? 0 : parseFloat(priceStr);
          await createTicketType({
            event_id: savedEventId,
            name: tt.name.trim(),
            price: ticketPrice,
            quota: parseInt(tt.quota),
            metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
            access_variants: accessVariantsCreate.length > 0 ? accessVariantsCreate : undefined,
            is_active: tt.is_active !== undefined ? tt.is_active : true,
            availability_mode: availabilityMode,
            available_start_at: availableStartAt,
            available_end_at: availableEndAt,
            valid_for_days: tt.valid_for_days || 'day_1',
            description: (tt.description || '').trim() || null,
          });
        }
      }

      toast({ 
        title: 'Success', 
        description: isEditMode ? 'Event updated successfully' : 'Event created successfully' 
      });
      // If editing, stay on the same page (EventDetail will handle navigation)
      if (isEditMode && id) {
        navigate(`/app/events/${id}?tab=edit`);
      } else {
        navigate('/app/catalog?tab=events');
      }
    } catch (error: any) {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save event', 
        variant: 'destructive' 
      });
    } finally {
      setSaving(false);
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Start Time
              <span className="text-red-500 ml-1">*</span>
            </h2>
              <DateTimeRow24
                value={startAt}
                onChange={(date) => {
                  setStartAt(date);
                  if (validationErrors.length > 0) setValidationErrors([]);
                }}
                disabled={false}
                ariaLabel="Event start date and time"
                className="w-full"
              />
            </div>

            <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              End Time
              <span className="text-red-500 ml-1">*</span>
            </h2>
              <DateTimeRow24
                value={endAt}
                onChange={(date) => {
                  setEndAt(date);
                  if (validationErrors.length > 0) setValidationErrors([]);
                }}
                disabled={false}
                min={startAt || undefined}
                ariaLabel="Event end date and time"
                className="w-full"
              />
            </div>
          </div>

          {/* Optional Day 2 */}
          {hasDay2 ? (
            <div className="space-y-4 p-4 rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-base md:text-lg font-semibold" style={{ color: '#0F1F17' }}>
                  Day 2
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDay2StartAt(null);
                    setDay2EndAt(null);
                    setTicketTypes(prev => prev.map(tt => ({
                      ...tt,
                      valid_for_days: (tt.valid_for_days === 'day_2' || tt.valid_for_days === 'both') ? 'day_1' as const : tt.valid_for_days,
                    })));
                  }}
                  className="text-muted-foreground"
                >
                  Remove Day 2
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <Label className="text-sm font-medium">Day 2 Start</Label>
                  <DateTimeRow24
                    value={day2StartAt}
                    onChange={(date) => {
                      setDay2StartAt(date);
                      if (validationErrors.length > 0) setValidationErrors([]);
                    }}
                    disabled={false}
                    min={endAt || undefined}
                    ariaLabel="Day 2 start date and time"
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Day 2 End</Label>
                  <DateTimeRow24
                    value={day2EndAt}
                    onChange={(date) => {
                      setDay2EndAt(date);
                      if (validationErrors.length > 0) setValidationErrors([]);
                    }}
                    disabled={false}
                    min={day2StartAt || endAt || undefined}
                    ariaLabel="Day 2 end date and time"
                    className="mt-1 w-full"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (startAt && endAt) {
                    const day2Start = new Date(endAt);
                    day2Start.setDate(day2Start.getDate() + 1);
                    day2Start.setHours(14, 0, 0, 0);
                    const day2End = new Date(day2Start);
                    day2End.setHours(18, 0, 0, 0);
                    setDay2StartAt(day2Start);
                    setDay2EndAt(day2End);
                  }
                }}
                disabled={!startAt || !endAt}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Day 2
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Add a second day for multi-day events. Ticket types can then be set to Day 1 only, Day 2 only, or Both days.
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

                    {hasDay2 && (
                      <div>
                        <Label htmlFor={`valid-for-days-${index}`} className="text-xs md:text-sm font-medium">
                          Valid for
                        </Label>
                        <Select
                          value={tt.valid_for_days || 'day_1'}
                          onValueChange={(value) => updateTicketTypeForm(index, 'valid_for_days', value as 'day_1' | 'day_2' | 'both')}
                        >
                          <SelectTrigger id={`valid-for-days-${index}`} className="w-full max-w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="day_1">Day 1 only</SelectItem>
                            <SelectItem value="day_2">Day 2 only</SelectItem>
                            <SelectItem value="both">Both days</SelectItem>
                          </SelectContent>
                        </Select>
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
                    </div>

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
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                handleUpdateAccessVariant(index, vIdx, 'quota', v ? v : null);
                              }}
                              placeholder="Use ticket type quota"
                              className="mt-1 max-w-[120px]"
                            />
                            <p className="text-xs text-muted-foreground mt-0.5">Max tickets through this variant. Leave empty to use ticket type quota.</p>
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
                ticketTypes={ticketTypes.map((tt, index) => ({
                  id: tt.id || `preview-${index}`,
                  event_id: eventId || generateUUID(),
                  name: tt.name.trim() || `Ticket Type ${index + 1}`,
                  price: (tt.price || '').trim() === '' ? 0 : (parseFloat(tt.price) || 0),
                  quota: isQuotaUnlimited(tt.quota) ? 999999 : parseInt(tt.quota) || 0,
                  description: (tt.description || '').trim() || null,
                  visibility_mode: tt.visibility_mode || 'public',
                  access_code: tt.access_code || null,
                  allowed_affiliates: tt.allowed_affiliates || null,
                  is_active: tt.is_active !== undefined ? tt.is_active : true,
                  availability_mode: tt.availability_mode || 'always',
                  available_start_at: tt.available_start_at ? tt.available_start_at.toISOString() : null,
                  available_end_at: tt.available_end_at ? tt.available_end_at.toISOString() : null,
                  valid_for_days: tt.valid_for_days || 'day_1',
                  metadata: {},
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }))}
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
