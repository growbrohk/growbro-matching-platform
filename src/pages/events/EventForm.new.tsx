import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  createEvent, 
  updateEvent, 
  getEvent, 
  createTicketType, 
  updateTicketType, 
  deleteTicketType, 
  getTicketTypes,
  type CreateEventData,
  type CreateTicketTypeData 
} from '@/lib/api/events';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Event, TicketType } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X } from 'lucide-react';
import EventDescription from '@/components/events/EventDescription';
import EventMediaBlock from '@/components/events/EventMediaBlock';
import PublicEventForm from '@/components/events/PublicEventForm';
import { datetimeLocalToUTC, utcToDatetimeLocal } from '@/lib/utils/datetime';
import { DateTimeRow24 } from '@/components/ui/DateTimeRow24';

interface TicketTypeForm {
  id?: string;
  name: string;
  price: string;
  quota: string;
  isNew?: boolean;
  visibility_mode?: 'public' | 'code' | 'affiliate' | 'hidden';
  access_code?: string | null;
  allowed_affiliates?: string[] | null;
  is_active?: boolean;
  availability_mode?: 'always' | 'scheduled';
  available_start_at?: Date | null;
  available_end_at?: Date | null;
  show_remaining_count?: boolean;
  threshold_to_show?: number | null;
}

export default function EventForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currentOrg, user } = useAuth();
  const { toast } = useToast();

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
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);
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

  // Ticket types
  const [ticketTypes, setTicketTypes] = useState<TicketTypeForm[]>([]);
  const [existingTicketTypes, setExistingTicketTypes] = useState<TicketType[]>([]);

  // Progressive disclosure states
  const [showTicketTypesSection, setShowTicketTypesSection] = useState(false);
  const [showPublishingSection, setShowPublishingSection] = useState(false);

  // Preview dialog state
  const [showPreview, setShowPreview] = useState(false);

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

        // Check if user has access
        if (event.org_id !== currentOrg.id) {
          toast({ 
            title: 'Error', 
            description: 'You do not have access to this event', 
            variant: 'destructive' 
          });
          navigate('/app/catalog?tab=events');
          return;
        }

        setTitle(event.title || '');
        setDescription(event.description || '');
        setInstagramPreviewImageUrl(event.instagram_preview_image_url || '');
        setStartAt(event.start_at ? new Date(event.start_at) : null);
        setEndAt(event.end_at ? new Date(event.end_at) : null);
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

        // Load ticket types
        const types = await getTicketTypes(id);
        setExistingTicketTypes(types);
        setTicketTypes(types.map(t => ({
          id: t.id,
          name: t.name,
          price: t.price.toString(),
          quota: t.quota.toString(),
          isNew: false,
          visibility_mode: t.visibility_mode || 'public',
          access_code: t.access_code || null,
          allowed_affiliates: t.allowed_affiliates || null,
          is_active: t.is_active !== undefined ? t.is_active : true,
          availability_mode: t.availability_mode || 'always',
          available_start_at: t.available_start_at ? new Date(t.available_start_at) : null,
          available_end_at: t.available_end_at ? new Date(t.available_end_at) : null,
          show_remaining_count: t.show_remaining_count !== undefined ? t.show_remaining_count : true,
          threshold_to_show: t.threshold_to_show !== undefined ? t.threshold_to_show : null,
        })));

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
  }, [id, isEditMode, currentOrg, navigate, toast]);

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
      visibility_mode: 'public',
      access_code: null,
      allowed_affiliates: null,
      is_active: true,
      availability_mode: 'always',
      available_start_at: null,
      available_end_at: null,
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
    setTicketTypes(ticketTypes.map((tt, i) => 
      i === index ? { ...tt, [field]: value } : tt
    ));
  };

  const handleGenerateCode = (index: number) => {
    const code = generateAccessCode();
    updateTicketTypeForm(index, 'access_code', code);
  };

  const handleAffiliatesChange = (index: number, value: string) => {
    // Parse comma-separated values and trim whitespace
    const affiliates = value
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    updateTicketTypeForm(index, 'allowed_affiliates', affiliates.length > 0 ? affiliates : null);
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

    // Validation: File size (500KB max)
    const maxSize = 500 * 1024; // 500KB
    if (file.size > maxSize) {
      toast({
        title: 'Error',
        description: 'File size must be less than 500KB',
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

    // Determine file extension
    let ext = 'jpg';
    if (file.type === 'image/png') ext = 'png';
    else if (file.type === 'image/webp') ext = 'webp';
    else if (file.type === 'image/jpeg' || file.type === 'image/jpg') ext = 'jpg';

    // Determine upload path based on whether eventId exists
    let uploadPath: string;
    if (eventId && currentOrg?.id) {
      // Existing event: {orgId}/{eventId}/instagram-preview.{ext}
      uploadPath = `${currentOrg.id}/${eventId}/instagram-preview.${ext}`;
    } else {
      // New event: temp/{userId}/{randomUUID}.{ext}
      const randomUUID = generateUUID();
      uploadPath = `temp/${user.id}/${randomUUID}.${ext}`;
    }

    setUploadingPreview(true);
    try {
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('event-previews')
        .upload(uploadPath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('event-previews')
        .getPublicUrl(uploadPath);

      const publicUrl = urlData.publicUrl;

      // Update state immediately
      setInstagramPreviewImageUrl(publicUrl);

      // If eventId exists, persist immediately to database
      if (eventId) {
        await updateEvent({
          id: eventId,
          instagram_preview_image_url: publicUrl,
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
      return;
    }

    try {
      // Update database
      await updateEvent({
        id: eventId,
        instagram_preview_image_url: null,
      });

      // Clear state
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

  const validateForm = (): string[] => {
    const errors: string[] = [];
    
    if (!currentOrg?.id) {
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
        org_id: currentOrg.id,
        title: title.trim(),
        description: description.trim() || undefined,
        instagram_preview_image_url: instagramPreviewImageUrl.trim() || null,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        location_text: locationText.trim() || null,
        status: status,
        collect_attendee_info: collectAttendeeInfo,
        enable_stripe: enableStripe || null,
        enable_payme: enablePayme || null,
        enable_fps: enableFps || null,
        payme_link: paymeLink.trim() || null,
        fps_link: fpsLink.trim() || null,
        metadata: {},
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
        const eventEndAt = new Date(endAt);
        for (const tt of ticketTypes) {
          // Check if ticket has sales_end_at in metadata and auto-cap it to event.end_at if needed
          const ticketMetadata = (tt as any).metadata || {};
          let finalMetadata = { ...ticketMetadata };
          
          // If sales_end_at exists and is after event.end_at, cap it to event.end_at
          if (ticketMetadata.sales_end_at) {
            const salesEndAt = new Date(ticketMetadata.sales_end_at);
            if (salesEndAt > eventEndAt) {
              finalMetadata.sales_end_at = eventEndAt.toISOString();
            }
          }
          
          // Also check if sales_end_at is a direct field (for future schema changes)
          const salesEndAtField = (tt as any).sales_end_at;
          if (salesEndAtField) {
            const salesEndAt = new Date(salesEndAtField);
            if (salesEndAt > eventEndAt) {
              finalMetadata.sales_end_at = eventEndAt.toISOString();
            }
          }

          // Process availability fields
          const availabilityMode = tt.availability_mode || 'always';
          let availableStartAt: string | null = null;
          let availableEndAt: string | null = null;

          if (availabilityMode === 'scheduled') {
            // Validate and process scheduled availability
            if (tt.available_start_at) {
              availableStartAt = tt.available_start_at.toISOString();
            }
            if (tt.available_end_at) {
              const endDate = tt.available_end_at;
              // Cap available_end_at to event.end_at
              const finalEndAt = endDate > eventEndAt ? eventEndAt : endDate;
              availableEndAt = finalEndAt.toISOString();
              
              // Validate: start must be < end
              if (availableStartAt && new Date(availableStartAt) >= finalEndAt) {
                throw new Error(`Ticket "${tt.name}": Available start time must be before end time`);
              }
            } else if (availableStartAt) {
              // If start is provided but end is not, require end
              throw new Error(`Ticket "${tt.name}": Both start and end times are required for scheduled availability`);
            }
          }

          if (tt.id && !tt.isNew) {
            // Update existing
            // If price is empty or whitespace, treat as 0 (free)
            const priceStr = (tt.price || '').trim();
            const ticketPrice = priceStr === '' ? 0 : parseFloat(priceStr);
            await updateTicketType({
              id: tt.id,
              name: tt.name.trim(),
              price: ticketPrice,
              quota: parseInt(tt.quota),
              metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
              visibility_mode: tt.visibility_mode || 'public',
              access_code: tt.access_code || null,
              allowed_affiliates: tt.allowed_affiliates || null,
              is_active: tt.is_active !== undefined ? tt.is_active : true,
              availability_mode: availabilityMode,
              available_start_at: availableStartAt,
              available_end_at: availableEndAt,
              show_remaining_count: tt.show_remaining_count !== undefined ? tt.show_remaining_count : true,
              threshold_to_show: tt.threshold_to_show !== undefined ? tt.threshold_to_show : null,
            });
          } else {
            // Create new
            // If price is empty or whitespace, treat as 0 (free)
            const priceStr = (tt.price || '').trim();
            const ticketPrice = priceStr === '' ? 0 : parseFloat(priceStr);
            await createTicketType({
              event_id: savedEventId,
              name: tt.name.trim(),
              price: ticketPrice,
              quota: parseInt(tt.quota),
              metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
              visibility_mode: tt.visibility_mode || 'public',
              access_code: tt.access_code || null,
              allowed_affiliates: tt.allowed_affiliates || null,
              is_active: tt.is_active !== undefined ? tt.is_active : true,
              availability_mode: availabilityMode,
              available_start_at: availableStartAt,
              available_end_at: availableEndAt,
              show_remaining_count: tt.show_remaining_count !== undefined ? tt.show_remaining_count : true,
              threshold_to_show: tt.threshold_to_show !== undefined ? tt.threshold_to_show : null,
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

        // Create ticket types
        const eventEndAt = new Date(endAt);
        for (const tt of ticketTypes) {
          // Check if ticket has sales_end_at in metadata and auto-cap it to event.end_at if needed
          const ticketMetadata = (tt as any).metadata || {};
          let finalMetadata = { ...ticketMetadata };
          
          // If sales_end_at exists and is after event.end_at, cap it to event.end_at
          if (ticketMetadata.sales_end_at) {
            const salesEndAt = new Date(ticketMetadata.sales_end_at);
            if (salesEndAt > eventEndAt) {
              finalMetadata.sales_end_at = eventEndAt.toISOString();
            }
          }
          
          // Also check if sales_end_at is a direct field (for future schema changes)
          const salesEndAtField = (tt as any).sales_end_at;
          if (salesEndAtField) {
            const salesEndAt = new Date(salesEndAtField);
            if (salesEndAt > eventEndAt) {
              finalMetadata.sales_end_at = eventEndAt.toISOString();
            }
          }

          // Process availability fields
          const availabilityMode = tt.availability_mode || 'always';
          let availableStartAt: string | null = null;
          let availableEndAt: string | null = null;

          if (availabilityMode === 'scheduled') {
            // Validate and process scheduled availability
            if (tt.available_start_at) {
              availableStartAt = tt.available_start_at.toISOString();
            }
            if (tt.available_end_at) {
              const endDate = tt.available_end_at;
              // Cap available_end_at to event.end_at
              const finalEndAt = endDate > eventEndAt ? eventEndAt : endDate;
              availableEndAt = finalEndAt.toISOString();
              
              // Validate: start must be < end
              if (availableStartAt && new Date(availableStartAt) >= finalEndAt) {
                throw new Error(`Ticket "${tt.name}": Available start time must be before end time`);
              }
            } else if (availableStartAt) {
              // If start is provided but end is not, require end
              throw new Error(`Ticket "${tt.name}": Both start and end times are required for scheduled availability`);
            }
          }

          // If price is empty or whitespace, treat as 0 (free)
          const priceStr = (tt.price || '').trim();
          const ticketPrice = priceStr === '' ? 0 : parseFloat(priceStr);
          await createTicketType({
            event_id: savedEventId,
            name: tt.name.trim(),
            price: ticketPrice,
            quota: parseInt(tt.quota),
            metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
            visibility_mode: tt.visibility_mode || 'public',
            access_code: tt.access_code || null,
            allowed_affiliates: tt.allowed_affiliates || null,
            is_active: tt.is_active !== undefined ? tt.is_active : true,
            availability_mode: availabilityMode,
            available_start_at: availableStartAt,
            available_end_at: availableEndAt,
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
      <div className="mb-0 overflow-hidden">
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8 overflow-hidden">
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
                onChange={(e) => setInstagramPreviewImageUrl(e.target.value)}
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
                      src={instagramPreviewImageUrl}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
        </div>

        <Separator />

        {/* Section 2.5: Payment Methods */}
        <div className="space-y-6">
          <div>
            <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
              Payment Methods
            </h2>
          </div>

          <div className="space-y-4">
            {/* Stripe */}
            <div className="border rounded-lg p-4" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.5)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5" style={{ color: '#0E7A3A' }} />
                  <div>
                    <Label htmlFor="enable-stripe" className="text-xs md:text-sm font-medium cursor-pointer">
                      Stripe Card (Online)
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
                                    updateTicketTypeForm(index, 'available_start_at', date);
                                    // Validate: if end exists and new start >= end, clear end
                                    if (date && tt.available_end_at && date >= tt.available_end_at) {
                                      updateTicketTypeForm(index, 'available_end_at', null);
                                    }
                                  }}
                                  disabled={tt.is_active === false}
                                  max={endAt || undefined}
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
                                    // Cap to event.end_at if provided
                                    if (date && endAt && date > endAt) {
                                      updateTicketTypeForm(index, 'available_end_at', endAt);
                                    } else {
                                      updateTicketTypeForm(index, 'available_end_at', date);
                                    }
                                  }}
                                  disabled={tt.is_active === false}
                                  min={tt.available_start_at || startAt || undefined}
                                  max={endAt || undefined}
                                  ariaLabel="Sales end date and time"
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Access & Visibility Section */}
                    <div className="pt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                        <Label htmlFor={`visibility-mode-${index}`} className="text-xs md:text-sm font-medium sm:pt-2 sm:w-[120px] sm:flex-shrink-0">
                          Access & Visibility
                        </Label>
                        <div className="flex-1 sm:max-w-[260px]">
                          <Select
                            value={tt.visibility_mode || 'public'}
                            onValueChange={(value) => updateTicketTypeForm(index, 'visibility_mode', value as any)}
                          >
                            <SelectTrigger id={`visibility-mode-${index}`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="public">Public</SelectItem>
                              <SelectItem value="code">Code</SelectItem>
                              <SelectItem value="affiliate">Affiliate</SelectItem>
                              <SelectItem value="hidden">Hidden</SelectItem>
                            </SelectContent>
                          </Select>
                          {tt.visibility_mode === 'code' && (
                            <div className="mt-3 flex gap-2" style={{ marginLeft: '0' }}>
                              <Input
                                type="text"
                                value={tt.access_code || ''}
                                onChange={(e) => updateTicketTypeForm(index, 'access_code', e.target.value || null)}
                                placeholder="Enter access code"
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleGenerateCode(index)}
                              >
                                Generate code
                              </Button>
                            </div>
                          )}
                          {tt.visibility_mode === 'affiliate' && (
                            <div className="mt-3" style={{ marginLeft: '0' }}>
                              <Textarea
                                value={tt.allowed_affiliates?.join(', ') || ''}
                                onChange={(e) => handleAffiliatesChange(index, e.target.value)}
                                placeholder="Enter allowed affiliate slugs (comma-separated, optional)"
                                rows={2}
                                className="text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>
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

                    {/* Ticket Share Link (only shown if event and ticket are saved) */}
                    {eventId && eventSlug && currentOrg?.slug && tt.id && (
                      <div className="pt-4 border-t" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
                        <Label className="text-xs md:text-sm font-medium mb-2 block">
                          Share Ticket Link
                        </Label>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
                          <Input
                            readOnly
                            value={`https://growbrohk.com/s/${currentOrg.slug}/${eventSlug}?ticket=${tt.id}`}
                            className="flex-1 font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const url = `https://growbrohk.com/s/${currentOrg.slug}/${eventSlug}?ticket=${tt.id}`;
                              try {
                                await navigator.clipboard.writeText(url);
                                toast({
                                  title: 'Copied!',
                                  description: 'Ticket link copied to clipboard',
                                });
                              } catch (err) {
                                toast({
                                  title: 'Error',
                                  description: 'Failed to copy link',
                                  variant: 'destructive',
                                });
                              }
                            }}
                            className="flex-1 sm:flex-initial"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    )}
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

        {/* Section 4: Share Link (shown if event has ID and slug) */}
        {eventId && eventSlug && currentOrg?.slug && (
          <>
            <div className="space-y-4">
              <div>
                <h2 className="text-base md:text-lg font-semibold mb-2" style={{ color: '#0F1F17' }}>
                  Share Link
                </h2>
                <Card className="bg-muted/50 mt-3">
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Input
                        readOnly
                        value={`https://growbrohk.com/${currentOrg?.slug}/${eventSlug}`}
                        className="flex-1 font-mono text-sm"
                      />
                      <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const url = `https://growbrohk.com/${currentOrg?.slug}/${eventSlug}`;
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
                          className="flex-1 sm:flex-initial"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = `https://growbrohk.com/${currentOrg?.slug}/${eventSlug}`;
                            window.open(url, '_blank');
                          }}
                          className="flex-1 sm:flex-initial"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowPreview(true)}
                          disabled={!title.trim() || !startAt || !endAt}
                          className="flex-1 sm:flex-initial"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Preview
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
          <div className="flex gap-4 justify-end">
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
      </form>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-2xl">Event Preview</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-4">
            {currentOrg && title.trim() && startAt && endAt ? (
              <PublicEventForm
                event={{
                  id: eventId || generateUUID(),
                  org_id: currentOrg.id,
                  title: title.trim(),
                  description: description || '',
                  start_at: startAt ? startAt.toISOString() : '',
                  end_at: endAt ? endAt.toISOString() : '',
                  status: 'published',
                  location_text: locationText || null,
                  instagram_preview_image_url: instagramPreviewImageUrl || null,
                  metadata: {},
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }}
                org={{
                  id: currentOrg.id,
                  name: currentOrg.name,
                  slug: currentOrg?.slug,
                }}
                ticketTypes={ticketTypes.map((tt, index) => ({
                  id: tt.id || `preview-${index}`,
                  event_id: eventId || generateUUID(),
                  name: tt.name.trim() || `Ticket Type ${index + 1}`,
                  price: (tt.price || '').trim() === '' ? 0 : (parseFloat(tt.price) || 0),
                  quota: isQuotaUnlimited(tt.quota) ? 999999 : parseInt(tt.quota) || 0,
                  visibility_mode: tt.visibility_mode || 'public',
                  access_code: tt.access_code || null,
                  allowed_affiliates: tt.allowed_affiliates || null,
                  is_active: tt.is_active !== undefined ? tt.is_active : true,
                  availability_mode: tt.availability_mode || 'always',
                  available_start_at: tt.available_start_at ? tt.available_start_at.toISOString() : null,
                  available_end_at: tt.available_end_at ? tt.available_end_at.toISOString() : null,
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

    </div>
  );
}
