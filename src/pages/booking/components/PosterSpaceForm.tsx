import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { X, Plus, Upload, Loader2, Trash2 } from 'lucide-react';
import {
  upsertPosterSpace,
  uploadPosterSpacePhoto,
  deletePosterSpacePhoto,
  type UpsertPosterSpaceInput,
  type PosterSpace,
} from '@/lib/api/poster-spaces';
import { useTypeDefinitions } from '@/hooks/use-type-definitions';
import type { TypeDefinition } from '@/lib/api/type-definitions';
import PosterSpacePreview from './PosterSpacePreview';

// Fallback values for backward compatibility
const FALLBACK_SPACE_TYPES: TypeDefinition[] = [
  { id: '1', domain: 'space_type', value: 'consignment', label: 'Consignment', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['consignment_shelf', 'shelf', 'booth', 'counter'], sort_order: 1, active: true, created_at: '', updated_at: '' },
  { id: '2', domain: 'space_type', value: 'promotion', label: 'Promotion', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['poster_space', 'cup_sleeve_promotion'], sort_order: 2, active: true, created_at: '', updated_at: '' },
  { id: '3', domain: 'space_type', value: 'event', label: 'Event Hosting', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['event_hosting'], sort_order: 3, active: true, created_at: '', updated_at: '' },
];

const FALLBACK_PROMOTION_TYPES: TypeDefinition[] = [
  { id: '6', domain: 'promotion_type', value: 'poster', label: 'Poster', parent_domain: 'space_type', parent_value: 'promotion', db_table: 'poster_spaces', db_column: 'category', db_values: ['poster_space'], sort_order: 1, active: true, created_at: '', updated_at: '' },
  { id: '7', domain: 'promotion_type', value: 'cupsleeve', label: 'Cupsleeve', parent_domain: 'space_type', parent_value: 'promotion', db_table: 'poster_spaces', db_column: 'category', db_values: ['cup_sleeve_promotion'], sort_order: 2, active: true, created_at: '', updated_at: '' },
];

interface PosterSpaceFormProps {
  spaceId?: string;
  initialData?: PosterSpace;
  initialCategory?: string;
  onSave?: (space: PosterSpace) => void;
  onCancel?: () => void;
}

/**
 * Map DB category value to UI space type and promotion type
 */
function mapCategoryToUiTypes(
  category: string,
  spaceTypes: TypeDefinition[],
  promoTypes: TypeDefinition[]
): { spaceType: string | null; promoType: string | null } {
  // Check promotion types first (more specific)
  const promoMatch = promoTypes.find((pt) => pt.db_values.includes(category));
  if (promoMatch) {
    return { spaceType: 'promotion', promoType: promoMatch.value };
  }

  // Check space types
  const spaceMatch = spaceTypes.find((st) => st.db_values.includes(category));
  if (spaceMatch) {
    return { spaceType: spaceMatch.value, promoType: null };
  }

  // Default fallback
  return { spaceType: 'promotion', promoType: 'poster' };
}

/**
 * Map UI selections to DB category value
 */
function mapUiTypesToCategory(
  spaceType: string | null,
  promoType: string | null,
  spaceTypes: TypeDefinition[],
  promoTypes: TypeDefinition[]
): string {
  // If promotion selected with subtype, use subtype
  if (spaceType === 'promotion' && promoType) {
    const promoDef = promoTypes.find((pt) => pt.value === promoType);
    if (promoDef && promoDef.db_values.length > 0) {
      return promoDef.db_values[0];
    }
  }

  // Otherwise use space type's first db_value
  if (spaceType) {
    const spaceDef = spaceTypes.find((st) => st.value === spaceType);
    if (spaceDef && spaceDef.db_values.length > 0) {
      return spaceDef.db_values[0];
    }
  }

  // Default fallback
  return 'poster_space';
}

export default function PosterSpaceForm({
  spaceId,
  initialData,
  initialCategory,
  onSave,
  onCancel,
}: PosterSpaceFormProps) {
  const { currentOrg } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState<number[]>([]);

  // Fetch type definitions
  const { typeDefinitions: spaceTypes } = useTypeDefinitions({
    domain: 'space_type',
    fallback: FALLBACK_SPACE_TYPES,
  });

  const { typeDefinitions: promoTypes } = useTypeDefinitions({
    domain: 'promotion_type',
    parent_domain: 'space_type',
    parent_value: 'promotion',
    fallback: FALLBACK_PROMOTION_TYPES,
  });

  // Map old 'poster' to new 'poster_space' for backward compatibility
  const getInitialCategory = () => {
    if (initialCategory) {
      return initialCategory === 'poster' ? 'poster_space' : initialCategory;
    }
    if (initialData?.category) {
      return initialData.category === 'poster' ? 'poster_space' : initialData.category;
    }
    return 'poster_space';
  };

  const initialCategoryValue = getInitialCategory();
  
  // Map initial category to UI types
  const initialUiTypes = useMemo(() => {
    return mapCategoryToUiTypes(initialCategoryValue, spaceTypes, promoTypes);
  }, [initialCategoryValue, spaceTypes, promoTypes]);

  const [selectedSpaceType, setSelectedSpaceType] = useState<string | null>(initialUiTypes.spaceType);
  const [selectedPromoType, setSelectedPromoType] = useState<string | null>(initialUiTypes.promoType);

  // Compute category from UI selections
  const computedCategory = useMemo(() => {
    return mapUiTypesToCategory(selectedSpaceType, selectedPromoType, spaceTypes, promoTypes);
  }, [selectedSpaceType, selectedPromoType, spaceTypes, promoTypes]);

  // Compute kind/subtype from UI selections
  const computedKind = useMemo(() => {
    if (selectedSpaceType === 'consignment') return 'consignment';
    if (selectedSpaceType === 'promotion') return 'promotion';
    if (selectedSpaceType === 'event') return 'event_hosting';
    return 'promotion' as const; // Default fallback
  }, [selectedSpaceType]);

  const computedSubtype = useMemo(() => {
    if (computedKind === 'promotion') {
      if (selectedPromoType === 'poster') return 'poster' as const;
      if (selectedPromoType === 'cupsleeve') return 'cupsleeve' as const;
    }
    return null;
  }, [computedKind, selectedPromoType]);

  const [formData, setFormData] = useState<UpsertPosterSpaceInput>({
    org_id: currentOrg?.id || '',
    title: '',
    category: initialCategoryValue as any,
    kind: computedKind,
    subtype: computedSubtype,
    short_description: '',
    bullets: [],
    photos: [],
    booking_unit: 'week',
    allowed_durations: [1, 2, 4],
    price_cents: null,
    currency: 'HKD',
    approval_flow: 'request_approve',
    blackout_ranges: [],
    tracking_enabled: true,
    tracking_prefix: null,
    default_host_split_percent: 10,
    listing_fee_cents: 0,
    status: 'draft',
  });

  // Update category, kind, and subtype when UI selections change
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      category: computedCategory as any,
      kind: computedKind,
      subtype: computedSubtype,
    }));
  }, [computedCategory, computedKind, computedSubtype]);

  const [newBullet, setNewBullet] = useState('');
  const [blackoutStart, setBlackoutStart] = useState('');
  const [blackoutEnd, setBlackoutEnd] = useState('');

  useEffect(() => {
    if (initialData && spaceTypes.length > 0 && promoTypes.length > 0) {
      // Map old 'poster' to new 'poster_space' for backward compatibility
      const category = initialData.category === 'poster' ? 'poster_space' : initialData.category;
      const uiTypes = mapCategoryToUiTypes(category, spaceTypes, promoTypes);
      setSelectedSpaceType(uiTypes.spaceType);
      setSelectedPromoType(uiTypes.promoType);
      
      // Derive kind/subtype from initialData if available, otherwise from category
      const kind = initialData.kind || (uiTypes.spaceType === 'consignment' ? 'consignment' : uiTypes.spaceType === 'event' ? 'event_hosting' : 'promotion');
      const subtype = initialData.subtype || (uiTypes.promoType === 'poster' ? 'poster' : uiTypes.promoType === 'cupsleeve' ? 'cupsleeve' : null);
      
      setFormData({
        org_id: initialData.org_id,
        title: initialData.title,
        category: category as any,
        kind: kind as 'consignment' | 'promotion' | 'event_hosting',
        subtype: subtype as 'poster' | 'cupsleeve' | null,
        short_description: initialData.short_description || '',
        bullets: initialData.bullets || [],
        photos: initialData.photos || [],
        booking_unit: initialData.booking_unit,
        allowed_durations: initialData.allowed_durations || [1, 2, 4],
        price_cents: initialData.price_cents,
        currency: initialData.currency,
        approval_flow: initialData.approval_flow,
        blackout_ranges: initialData.blackout_ranges || [],
        tracking_enabled: initialData.tracking_enabled,
        tracking_prefix: initialData.tracking_prefix || null,
        default_host_split_percent: initialData.default_host_split_percent ?? 10,
        listing_fee_cents: initialData.listing_fee_cents ?? 0,
        status: initialData.status,
      });
    } else if (initialCategory && spaceTypes.length > 0 && promoTypes.length > 0) {
      // Set category when creating new space with initial category
      const category = initialCategory === 'poster' ? 'poster_space' : initialCategory;
      const uiTypes = mapCategoryToUiTypes(category, spaceTypes, promoTypes);
      setSelectedSpaceType(uiTypes.spaceType);
      setSelectedPromoType(uiTypes.promoType);
      
      // Derive kind/subtype from category
      const kind = uiTypes.spaceType === 'consignment' ? 'consignment' : uiTypes.spaceType === 'event' ? 'event_hosting' : 'promotion';
      const subtype = uiTypes.promoType === 'poster' ? 'poster' : uiTypes.promoType === 'cupsleeve' ? 'cupsleeve' : null;
      
      setFormData((prev) => ({
        ...prev,
        category: category as any,
        kind: kind as 'consignment' | 'promotion' | 'event_hosting',
        subtype: subtype as 'poster' | 'cupsleeve' | null,
      }));
    }
  }, [initialData, initialCategory, spaceTypes, promoTypes]);

  const handleAddBullet = () => {
    if (newBullet.trim() && formData.bullets!.length < 3) {
      setFormData({
        ...formData,
        bullets: [...(formData.bullets || []), newBullet.trim()],
      });
      setNewBullet('');
    }
  };

  const handleRemoveBullet = (index: number) => {
    setFormData({
      ...formData,
      bullets: formData.bullets!.filter((_, i) => i !== index),
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrg?.id) return;

    if (formData.photos!.length >= 8) {
      toast.error('Maximum 8 photos allowed');
      return;
    }

    const photoIndex = formData.photos!.length;
    setUploadingPhotos([...uploadingPhotos, photoIndex]);

    try {
      const spaceIdForUpload = spaceId || 'temp';
      const photoUrl = await uploadPosterSpacePhoto(currentOrg.id, spaceIdForUpload, file);
      setFormData({
        ...formData,
        photos: [...(formData.photos || []), photoUrl],
      });
      toast.success('Photo uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      toast.error(error.message || 'Failed to upload photo');
    } finally {
      setUploadingPhotos(uploadingPhotos.filter((i) => i !== photoIndex));
      e.target.value = '';
    }
  };

  const handleRemovePhoto = async (index: number) => {
    const photoUrl = formData.photos![index];
    if (!photoUrl) return;

    try {
      await deletePosterSpacePhoto(photoUrl);
      setFormData({
        ...formData,
        photos: formData.photos!.filter((_, i) => i !== index),
      });
      toast.success('Photo removed');
    } catch (error: any) {
      console.error('Error removing photo:', error);
      toast.error('Failed to remove photo');
    }
  };

  const handleAddBlackout = () => {
    if (blackoutStart && blackoutEnd && blackoutStart <= blackoutEnd) {
      setFormData({
        ...formData,
        blackout_ranges: [
          ...(formData.blackout_ranges || []),
          { start: blackoutStart, end: blackoutEnd },
        ],
      });
      setBlackoutStart('');
      setBlackoutEnd('');
    } else {
      toast.error('Please enter valid start and end dates');
    }
  };

  const handleRemoveBlackout = (index: number) => {
    setFormData({
      ...formData,
      blackout_ranges: formData.blackout_ranges!.filter((_, i) => i !== index),
    });
  };

  const handleToggleDuration = (duration: number) => {
    const durations = formData.allowed_durations || [];
    if (durations.includes(duration)) {
      setFormData({
        ...formData,
        allowed_durations: durations.filter((d) => d !== duration),
      });
    } else {
      setFormData({
        ...formData,
        allowed_durations: [...durations, duration].sort((a, b) => a - b),
      });
    }
  };

  const handleSave = async (status: 'draft' | 'published') => {
    if (!currentOrg?.id || !formData.title.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      const saved = await upsertPosterSpace({
        ...formData,
        id: spaceId,
        org_id: currentOrg.id,
        status,
      });
      toast.success(status === 'published' ? 'Space published successfully' : 'Draft saved');
      if (onSave) {
        onSave(saved);
      }
    } catch (error: any) {
      console.error('Error saving poster space:', error);
      toast.error(error.message || 'Failed to save space');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground border-l-2 border-primary pl-3 py-1">
        Brand info & location are managed in Brand Settings.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Premium Poster Wall"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="space_type">Space Type</Label>
                <Select
                  value={selectedSpaceType || ''}
                  onValueChange={(value) => {
                    setSelectedSpaceType(value);
                    // Reset promotion type if not promotion
                    if (value !== 'promotion') {
                      setSelectedPromoType(null);
                    } else if (!selectedPromoType && promoTypes.length > 0) {
                      // Auto-select first promotion type if promotion selected
                      setSelectedPromoType(promoTypes[0].value);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select space type" />
                  </SelectTrigger>
                  <SelectContent>
                    {spaceTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSpaceType === 'promotion' && (
                <div className="space-y-2">
                  <Label htmlFor="promotion_type">Promotion Type</Label>
                  <Select
                    value={selectedPromoType || ''}
                    onValueChange={(value) => {
                      setSelectedPromoType(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select promotion type" />
                    </SelectTrigger>
                    <SelectContent>
                      {promoTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="short_description">Short description (1–2 lines)</Label>
                <Textarea
                  id="short_description"
                  value={formData.short_description}
                  onChange={(e) =>
                    setFormData({ ...formData, short_description: e.target.value })
                  }
                  placeholder="Brief description of your space..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>What you'll get (max 3 bullets)</Label>
                <div className="space-y-2">
                  {formData.bullets!.map((bullet, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input value={bullet} readOnly className="flex-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveBullet(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {formData.bullets!.length < 3 && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={newBullet}
                        onChange={(e) => setNewBullet(e.target.value)}
                        placeholder="Add a bullet point..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBullet();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={handleAddBullet}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Photos</CardTitle>
              <CardDescription>Upload 1–8 photos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {formData.photos!.map((photo, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={photo}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemovePhoto(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {formData.photos!.length < 8 && (
                <div>
                  <Label htmlFor="photo-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors">
                      {uploadingPhotos.length > 0 ? (
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                      ) : (
                        <Upload className="h-8 w-8 mx-auto mb-2" />
                      )}
                      <p className="text-sm text-muted-foreground">Upload photo</p>
                    </div>
                  </Label>
                  <Input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhotos.length > 0}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Booking Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="booking_unit">Booking unit</Label>
                <Select
                  value={formData.booking_unit}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, booking_unit: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Allowed durations</Label>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 6, 8, 12].map((duration) => (
                    <Button
                      key={duration}
                      type="button"
                      variant={
                        formData.allowed_durations!.includes(duration) ? 'default' : 'outline'
                      }
                      size="sm"
                      onClick={() => handleToggleDuration(duration)}
                    >
                      {duration} {formData.booking_unit}
                      {duration > 1 ? 's' : ''}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price per unit (optional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="price"
                    type="number"
                    value={formData.price_cents ? formData.price_cents / 100 : ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null,
                      })
                    }
                    placeholder="Leave empty for Inquiry"
                  />
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HKD">HKD</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formData.price_cents
                    ? `From ${formData.currency} ${formData.price_cents / 100} / ${formData.booking_unit}`
                    : 'Pricing: Inquiry'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="revenue_share">Revenue share (%)</Label>
                <Input
                  id="revenue_share"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={formData.default_host_split_percent ?? 10}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    const clampedValue = isNaN(value) ? 10 : Math.max(0, Math.min(100, value));
                    setFormData({
                      ...formData,
                      default_host_split_percent: clampedValue,
                    });
                  }}
                  placeholder="10"
                />
                <p className="text-sm text-muted-foreground">
                  Percentage of revenue shared with host (0-100%)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="listing_fee">Listing fee (HK$)</Label>
                <Input
                  id="listing_fee"
                  type="number"
                  min={0}
                  step={0.5}
                  value={formData.listing_fee_cents ? formData.listing_fee_cents / 100 : ''}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    const cents = isNaN(value) || value < 0 ? 0 : Math.round(value * 100);
                    setFormData({
                      ...formData,
                      listing_fee_cents: cents,
                    });
                  }}
                  placeholder="0"
                />
                <p className="text-sm text-muted-foreground">
                  One-time listing fee in Hong Kong dollars
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="approval_flow">Approval flow</Label>
                <Select
                  value={formData.approval_flow}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, approval_flow: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="request_approve">Request → Approve</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Availability Blackout Periods</CardTitle>
              <CardDescription>Add dates when the space is unavailable</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="blackout_start">Start date</Label>
                  <Input
                    id="blackout_start"
                    type="date"
                    value={blackoutStart}
                    onChange={(e) => setBlackoutStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="blackout_end">End date</Label>
                  <Input
                    id="blackout_end"
                    type="date"
                    value={blackoutEnd}
                    onChange={(e) => setBlackoutEnd(e.target.value)}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" onClick={handleAddBlackout}>
                <Plus className="h-4 w-4 mr-2" />
                Add blackout period
              </Button>
              {formData.blackout_ranges!.length > 0 && (
                <div className="space-y-2">
                  {formData.blackout_ranges!.map((range, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 border rounded-lg"
                    >
                      <span className="text-sm">
                        {range.start} to {range.end}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveBlackout(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="tracking_enabled">Enable tracking</Label>
                  <p className="text-sm text-muted-foreground">
                    Track bookings with a custom prefix
                  </p>
                </div>
                <Switch
                  id="tracking_enabled"
                  checked={formData.tracking_enabled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, tracking_enabled: checked })
                  }
                />
              </div>
              {formData.tracking_enabled && (
                <div className="space-y-2">
                  <Label htmlFor="tracking_prefix">Tracking prefix (optional)</Label>
                  <Input
                    id="tracking_prefix"
                    value={formData.tracking_prefix || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, tracking_prefix: e.target.value || null })
                    }
                    placeholder="e.g., POSTER-"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSave('draft')}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Draft'
              )}
            </Button>
            <Button
              onClick={() => handleSave('published')}
              disabled={saving || !formData.title.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                'Publish'
              )}
            </Button>
            {onCancel && (
              <Button variant="ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="lg:sticky lg:top-6 h-fit">
          <PosterSpacePreview formData={formData} />
        </div>
      </div>
    </div>
  );
}

