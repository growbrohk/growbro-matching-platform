import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConnectedOrgs } from '@/hooks/use-connected-orgs';
import { getEvents } from '@/lib/api/events';
import { getProducts } from '@/lib/api/products';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PartnerPipelineFields,
  buildCollabColumnsForTrackingLink,
  type PartnerPipelineValues,
  type CommissionBasis,
} from './PartnerPipelineFields';

interface CreateTrackingLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Load this link and save with UPDATE instead of INSERT (host pipeline edit). */
  editingTrackingLinkId?: string | null;
  onSuccess?: () => void;
}

type DestinationType = 'event' | 'product' | 'custom';
type PipelineType = 'tracking' | 'affiliate' | 'collab' | 'consignment';

function nullCollabColumnsForNonCollab(): Record<string, null> {
  return {
    collab_sales_scope: null,
    collab_partner_role: null,
    collab_can_view_order_details: null,
    collab_can_mark_shipped: null,
    collab_show_event_in_partner_events_tab: null,
    collab_partner_allow_edit_tab: null,
    collab_partner_allow_tickets_tab: null,
    collab_partner_allow_scan_tab: null,
    collab_show_on_partner_public_profile: null,
  };
}

export function CreateTrackingLinkModal({
  open,
  onOpenChange,
  editingTrackingLinkId = null,
  onSuccess,
}: CreateTrackingLinkModalProps) {
  const isEditMode = Boolean(editingTrackingLinkId);
  const { currentOrg } = useAuth();
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [pipelineType, setPipelineType] = useState<PipelineType>('tracking');
  const [destinationType, setDestinationType] = useState<DestinationType>('custom');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [customUrl, setCustomUrl] = useState('');
  const [affiliateOrgId, setAffiliateOrgId] = useState<string | undefined>(undefined);
  const [commissionRate, setCommissionRate] = useState<string>('');
  const [commissionBasis, setCommissionBasis] = useState<CommissionBasis>('revenue');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [slug, setSlug] = useState('');
  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [collabSalesScope, setCollabSalesScope] = useState<'attributed' | 'all_for_resource'>('attributed');
  const [collabPartnerRole, setCollabPartnerRole] = useState<'viewer' | 'editor'>('viewer');
  const [collabCanViewDetails, setCollabCanViewDetails] = useState(false);
  const [collabCanMarkShipped, setCollabCanMarkShipped] = useState(false);
  const [collabShowInPartnerEventsTab, setCollabShowInPartnerEventsTab] = useState(true);
  const [collabAllowEditTab, setCollabAllowEditTab] = useState(false);
  const [collabAllowTicketsTab, setCollabAllowTicketsTab] = useState(true);
  const [collabAllowScanTab, setCollabAllowScanTab] = useState(true);
  const [collabShowOnPartnerPublicProfile, setCollabShowOnPartnerPublicProfile] = useState(true);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [linkStatus, setLinkStatus] = useState<string>('active');

  // Fetch events for current org
  const { data: events = [], isLoading: isEventsLoading } = useQuery({
    queryKey: ['events', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      return getEvents(currentOrg.id);
    },
    enabled: !!currentOrg && open && (destinationType === 'event' || isEditMode),
  });

  // Fetch products for current org (host org, not affiliate org)
  const { data: products = [], isLoading: isProductsLoading } = useQuery({
    queryKey: ['products', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      return getProducts(currentOrg.id);
    },
    enabled: !!currentOrg && open && (destinationType === 'product' || isEditMode),
  });

  // Fetch connected orgs for affiliate selection
  const { data: connectedOrgs = [] } = useConnectedOrgs(currentOrg?.id);

  // Generate slug from label when label changes (create only; edit keeps fixed slug)
  useEffect(() => {
    if (isEditMode) return;
    if (label && label.trim()) {
      generateSlugFromLabel(label);
    } else {
      setSlug('');
    }
  }, [label, isEditMode]);

  // Load existing link for edit
  useEffect(() => {
    if (!open || !editingTrackingLinkId || !currentOrg?.id) {
      if (!open) setLoadingEdit(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingEdit(true);
      try {
        const { data: row, error } = await (supabase.from('tracking_links' as any) as any)
          .select('*')
          .eq('id', editingTrackingLinkId)
          .eq('host_org_id', currentOrg.id)
          .maybeSingle();

        if (cancelled) return;
        if (error) throw error;
        if (!row) {
          toast({
            title: 'Error',
            description: 'Pipeline not found or access denied',
            variant: 'destructive',
          });
          onOpenChange(false);
          return;
        }

        const r = row as Record<string, unknown>;
        setLabel((r.label as string) || '');
        setSlug((r.slug as string) || '');
        setPipelineType((r.type as PipelineType) || 'tracking');
        const dt = r.destination_type as string;
        setDestinationType(
          dt === 'event' || dt === 'product' || dt === 'custom' ? (dt as DestinationType) : 'custom',
        );
        setSelectedEventId((r.event_id as string) || '');
        setSelectedProductId((r.product_id as string) || '');
        if (r.destination_type === 'custom') {
          setCustomUrl((r.destination_url as string) || '');
        } else {
          setCustomUrl('');
        }
        setAffiliateOrgId((r.affiliate_org_id as string) || undefined);
        const cr = r.commission_rate as number | null;
        setCommissionRate(cr != null ? String(Number(cr) * 100) : '');
        setCommissionBasis((r.commission_basis as CommissionBasis) === 'profit' ? 'profit' : 'revenue');
        const sd = r.start_date as string | null;
        const ed = r.end_date as string | null;
        setStartDate(sd ? sd.slice(0, 10) : '');
        setEndDate(ed ? ed.slice(0, 10) : '');
        setCollabSalesScope((r.collab_sales_scope as 'attributed' | 'all_for_resource') || 'attributed');
        setCollabPartnerRole((r.collab_partner_role as 'viewer' | 'editor') || 'viewer');
        setCollabCanViewDetails(r.collab_can_view_order_details === true);
        setCollabCanMarkShipped(r.collab_can_mark_shipped === true);
        setCollabShowInPartnerEventsTab(r.collab_show_event_in_partner_events_tab !== false);
        setCollabAllowEditTab(r.collab_partner_allow_edit_tab === true);
        setCollabAllowTicketsTab(r.collab_partner_allow_tickets_tab !== false);
        setCollabAllowScanTab(r.collab_partner_allow_scan_tab !== false);
        setCollabShowOnPartnerPublicProfile(r.collab_show_on_partner_public_profile !== false);
        setLinkStatus((r.status as string) || 'active');
      } catch (e: unknown) {
        console.error('Load pipeline for edit', e);
        toast({
          title: 'Error',
          description: e instanceof Error ? e.message : 'Failed to load pipeline',
          variant: 'destructive',
        });
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, editingTrackingLinkId, currentOrg?.id, onOpenChange]);

  const generateSlugFromLabel = async (baseText: string) => {
    if (!baseText) return;
    
    setIsGeneratingSlug(true);
    try {
      // Call RPC function to generate unique slug
      const { data, error } = await supabase.rpc('generate_tracking_slug', {
        base_text: baseText,
      });

      if (error) throw error;
      if (data) {
        setSlug(data);
      }
    } catch (err) {
      console.error('Error generating slug:', err);
      // Fallback: simple slug generation
      const simpleSlug = baseText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(simpleSlug || 'link');
    } finally {
      setIsGeneratingSlug(false);
    }
  };

  const handlePipelineTypeChange = (type: PipelineType) => {
    setPipelineType(type);
    if (type !== 'affiliate' && type !== 'collab') {
      setAffiliateOrgId(undefined);
      setCommissionRate('');
      setStartDate('');
      setEndDate('');
    }
    if (type !== 'collab') {
      setCollabSalesScope('attributed');
      setCollabPartnerRole('viewer');
      setCollabCanViewDetails(false);
      setCollabCanMarkShipped(false);
      setCollabShowInPartnerEventsTab(true);
      setCollabAllowEditTab(false);
      setCollabAllowTicketsTab(true);
      setCollabAllowScanTab(true);
    }
  };

  const handleDestinationTypeChange = (type: string) => {
    // Ensure type is valid
    const validType: DestinationType = (type === 'event' || type === 'product' || type === 'custom') 
      ? type as DestinationType 
      : 'custom';
    setDestinationType(validType);
    setSelectedEventId('');
    setSelectedProductId('');
    setCustomUrl('');
  };

  const getDestinationUrl = (): string | null => {
    if (destinationType === 'event' && selectedEventId) {
      const event = events.find((e) => e.id === selectedEventId);
      if (event && currentOrg?.slug && event.slug) {
        return `/${currentOrg.slug}/${event.slug}`;
      }
      return null;
    }
    if (destinationType === 'product' && selectedProductId) {
      if (currentOrg?.slug) {
        return `/${currentOrg.slug}/products/${selectedProductId}`;
      }
      return `/products/${selectedProductId}`;
    }
    if (destinationType === 'custom' && customUrl) {
      return customUrl;
    }
    return null;
  };

  const partnerFieldValues = useMemo(
    (): PartnerPipelineValues => ({
      pipelineType: pipelineType === 'affiliate' ? 'affiliate' : 'collab',
      affiliateOrgId,
      startDate,
      endDate,
      commissionRate,
      commissionBasis,
      collabSalesScope,
      collabPartnerRole,
      collabCanViewDetails,
      collabCanMarkShipped,
      collabShowOnPartnerPublicProfile,
      collabShowInPartnerEventsTab,
      collabAllowEditTab,
      collabAllowTicketsTab,
      collabAllowScanTab,
    }),
    [
      pipelineType,
      affiliateOrgId,
      startDate,
      endDate,
      commissionRate,
      commissionBasis,
      collabSalesScope,
      collabPartnerRole,
      collabCanViewDetails,
      collabCanMarkShipped,
      collabShowOnPartnerPublicProfile,
      collabShowInPartnerEventsTab,
      collabAllowEditTab,
      collabAllowTicketsTab,
      collabAllowScanTab,
    ]
  );

  const patchPartnerFields = useCallback((patch: Partial<PartnerPipelineValues>) => {
    if (patch.pipelineType !== undefined) setPipelineType(patch.pipelineType);
    if (patch.affiliateOrgId !== undefined) setAffiliateOrgId(patch.affiliateOrgId);
    if (patch.startDate !== undefined) setStartDate(patch.startDate);
    if (patch.endDate !== undefined) setEndDate(patch.endDate);
    if (patch.commissionRate !== undefined) setCommissionRate(patch.commissionRate);
    if (patch.commissionBasis !== undefined) setCommissionBasis(patch.commissionBasis);
    if (patch.collabSalesScope !== undefined) setCollabSalesScope(patch.collabSalesScope);
    if (patch.collabPartnerRole !== undefined) setCollabPartnerRole(patch.collabPartnerRole);
    if (patch.collabCanViewDetails !== undefined) setCollabCanViewDetails(patch.collabCanViewDetails);
    if (patch.collabCanMarkShipped !== undefined) setCollabCanMarkShipped(patch.collabCanMarkShipped);
    if (patch.collabShowOnPartnerPublicProfile !== undefined) {
      setCollabShowOnPartnerPublicProfile(patch.collabShowOnPartnerPublicProfile);
    }
    if (patch.collabShowInPartnerEventsTab !== undefined) {
      setCollabShowInPartnerEventsTab(patch.collabShowInPartnerEventsTab);
    }
    if (patch.collabAllowEditTab !== undefined) setCollabAllowEditTab(patch.collabAllowEditTab);
    if (patch.collabAllowTicketsTab !== undefined) setCollabAllowTicketsTab(patch.collabAllowTicketsTab);
    if (patch.collabAllowScanTab !== undefined) setCollabAllowScanTab(patch.collabAllowScanTab);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentOrg) {
      toast({
        title: 'Error',
        description: 'No organization selected',
        variant: 'destructive',
      });
      return;
    }

    const destinationUrl = getDestinationUrl();
    if (!destinationUrl) {
      toast({
        title: 'Error',
        description: 'Please select a destination',
        variant: 'destructive',
      });
      return;
    }

    if (!label || !label.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a label',
        variant: 'destructive',
      });
      return;
    }

    if (!isEditMode && !slug) {
      toast({
        title: 'Error',
        description: 'Slug generation failed. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    // Validate affiliate-specific fields
    if (pipelineType === 'affiliate' || pipelineType === 'collab') {
      if (!affiliateOrgId) {
        toast({
          title: 'Error',
          description: 'Please select a partner organization',
          variant: 'destructive',
        });
        return;
      }
      if (!commissionRate || parseFloat(commissionRate) <= 0 || parseFloat(commissionRate) > 100) {
        toast({
          title: 'Error',
          description: 'Please enter a valid commission rate (0-100)',
          variant: 'destructive',
        });
        return;
      }
      if (!startDate || !endDate) {
        toast({
          title: 'Error',
          description: 'Please select both start and end dates for the partner period',
          variant: 'destructive',
        });
        return;
      }
      if (new Date(endDate) < new Date(startDate)) {
        toast({
          title: 'Error',
          description: 'End date must be after start date',
          variant: 'destructive',
        });
        return;
      }
    }

    if (pipelineType === 'collab') {
      if (collabSalesScope === 'all_for_resource' && destinationType === 'custom') {
        toast({
          title: 'Error',
          description: 'All sales for this product/event requires an Event or Product destination.',
          variant: 'destructive',
        });
        return;
      }
    }

    // Prevent consignment submission
    if (pipelineType === 'consignment') {
      toast({
        title: 'Coming Soon',
        description: 'Consignment pipelines are not yet available',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const finalDestinationType: DestinationType = destinationType || 'custom';

      // ----- Update existing pipeline (host edit) -----
      if (editingTrackingLinkId) {
        const updateData: Record<string, unknown> = {
          label: label || null,
          destination_url: destinationUrl,
          destination_type: finalDestinationType,
          type: pipelineType,
          status: linkStatus,
          event_id: null,
          product_id: null,
          ...nullCollabColumnsForNonCollab(),
        };

        if (finalDestinationType === 'event' && selectedEventId) {
          updateData.event_id = selectedEventId;
        } else if (finalDestinationType === 'product' && selectedProductId) {
          updateData.product_id = selectedProductId;
        }

        if (pipelineType === 'affiliate' || pipelineType === 'collab') {
          updateData.affiliate_org_id = affiliateOrgId;
          updateData.commission_rate = parseFloat(commissionRate) / 100;
          updateData.commission_basis = commissionBasis;
          updateData.start_date = startDate;
          updateData.end_date = endDate;
          Object.assign(
            updateData,
            buildCollabColumnsForTrackingLink(partnerFieldValues, {
              destinationType: finalDestinationType,
              hasEvent: finalDestinationType === 'event' && !!selectedEventId,
              hasProduct: finalDestinationType === 'product' && !!selectedProductId,
            })
          );
        } else {
          updateData.affiliate_org_id = null;
          updateData.commission_rate = null;
          updateData.commission_basis = 'revenue';
          updateData.start_date = null;
          updateData.end_date = null;
        }

        const { error: upErr } = await (supabase.from('tracking_links' as any) as any)
          .update(updateData)
          .eq('id', editingTrackingLinkId)
          .eq('host_org_id', currentOrg.id);

        if (upErr) throw upErr;

        toast({
          title: 'Saved',
          description: 'Pipeline updated successfully.',
        });
        onSuccess?.();
        handleClose();
        return;
      }

      // ----- Create (slug must be unique) -----
      const { data: existing, error: slugLookupError } = await (supabase.from('tracking_links' as any) as any)
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (slugLookupError) {
        throw slugLookupError;
      }

      if (existing) {
        toast({
          title: 'Error',
          description: 'This slug is already taken. Please choose another.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      // Determine initial status based on type
      const initialStatus = pipelineType === 'tracking' ? 'active' : 'pending';

      // Create tracking link
      const insertData: any = {
        slug,
        label: label || null,
        destination_url: destinationUrl,
        destination_type: finalDestinationType,
        host_org_id: currentOrg.id,
        type: pipelineType,
        status: initialStatus,
      };

      // Set event_id or product_id based on destination_type
      if (finalDestinationType === 'event' && selectedEventId) {
        insertData.event_id = selectedEventId;
      } else if (finalDestinationType === 'product' && selectedProductId) {
        insertData.product_id = selectedProductId;
      }
      // For 'custom', both event_id and product_id remain null

      // Add affiliate-specific fields
      if (pipelineType === 'affiliate' || pipelineType === 'collab') {
        insertData.affiliate_org_id = affiliateOrgId;
        insertData.commission_rate = parseFloat(commissionRate) / 100;
        insertData.commission_basis = commissionBasis;
        insertData.start_date = startDate;
        insertData.end_date = endDate;
        Object.assign(
          insertData,
          buildCollabColumnsForTrackingLink(partnerFieldValues, {
            destinationType: finalDestinationType,
            hasEvent: finalDestinationType === 'event' && !!selectedEventId,
            hasProduct: finalDestinationType === 'product' && !!selectedProductId,
          })
        );
      }

      const { data, error } = await (supabase.from('tracking_links' as any) as any)
        .insert(insertData)
        .select('id, slug, type, status')
        .single();

      if (error) throw error;

      // If affiliate link, create affiliate request
      if (pipelineType === 'affiliate' || pipelineType === 'collab') {
        const { error: requestError } = await (supabase.from('affiliate_requests' as any) as any)
          .insert({
            tracking_link_id: data.id,
            host_org_id: currentOrg.id,
            affiliate_org_id: affiliateOrgId,
            status: 'pending',
          });

        if (requestError) {
          console.error('Error creating affiliate request:', requestError);
          // Still show success since tracking link was created
        }
      }

      // Build full tracking link URL
      const trackingLinkUrl = `${window.location.origin}/r/${data.slug}`;
      setCreatedLink(trackingLinkUrl);

      toast({
        title: pipelineType === 'affiliate' || pipelineType === 'collab' ? 'Request Sent' : 'Success',
        description:
          pipelineType === 'affiliate' || pipelineType === 'collab'
            ? 'Partner request sent! The partner will be notified.'
            : 'Tracking link created successfully!',
      });

      // Reset form after a delay
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error creating tracking link:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to create tracking link',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setLabel('');
    setPipelineType('tracking');
    setDestinationType('custom');
    setSelectedEventId('');
    setSelectedProductId('');
    setCustomUrl('');
    setAffiliateOrgId(undefined);
    setCommissionRate('');
    setStartDate('');
    setEndDate('');
    setCollabSalesScope('attributed');
    setCollabPartnerRole('viewer');
    setCollabCanViewDetails(false);
    setCollabCanMarkShipped(false);
    setCollabShowInPartnerEventsTab(true);
    setCollabAllowEditTab(false);
    setCollabAllowTicketsTab(true);
    setCollabAllowScanTab(true);
    setCollabShowOnPartnerPublicProfile(true);
    setSlug('');
    setCreatedLink(null);
    setCopied(false);
    setLoadingEdit(false);
    setLinkStatus('active');
    onOpenChange(false);
  };

  const handleCopyLink = async () => {
    if (!createdLink) return;
    
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Tracking link copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const destinationUrl = getDestinationUrl();
  const previewUrl = slug ? `https://www.growbrohk.com/r/${slug}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden max-h-[85vh]">
        <div className="flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Pipeline' : 'Create Pipeline'}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? 'Update type, destination, partner terms, and collab visibility. Slug is fixed.'
                : 'Create pipelines to increase exposure & income'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-4">
            {loadingEdit && isEditMode ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : createdLink ? (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/50">
                  <Label className="text-xs text-muted-foreground mb-2 block">Your tracking link</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono break-all">{createdLink}</code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLink}
                      className="flex-shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <Button onClick={handleClose} className="w-full">
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
            {/* Pipeline Type */}
            <div className="space-y-2">
              <Label htmlFor="pipeline-type">Type</Label>
              <Select value={pipelineType} onValueChange={(v) => handlePipelineTypeChange(v as PipelineType)}>
                <SelectTrigger id="pipeline-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tracking">Tracking link</SelectItem>
                  <SelectItem value="affiliate">Affiliate link</SelectItem>
                  <SelectItem value="collab">Collab Product/Event</SelectItem>
                  <SelectItem value="consignment" disabled>Consignment (Coming soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Label */}
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Instagram Post"
                required
              />
              {isEditMode && (
                <div className="space-y-2 pt-1">
                  <Label htmlFor="link-status">Status</Label>
                  <Select value={linkStatus} onValueChange={setLinkStatus}>
                    <SelectTrigger id="link-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className="!z-[9999]" style={{ zIndex: 9999 }}>
                      <SelectItem value="pending">pending</SelectItem>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="inactive">inactive</SelectItem>
                      <SelectItem value="payment_pending">payment_pending</SelectItem>
                      <SelectItem value="paid">paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {slug && (pipelineType === 'tracking' || pipelineType === 'affiliate' || pipelineType === 'collab') && (
                <div className="space-y-1 pt-1">
                  <p className="text-xs text-muted-foreground">
                    Slug: <code className="font-mono">{slug}</code>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Affiliate link: <code className="font-mono">{previewUrl}</code>
                  </p>
                  {isGeneratingSlug && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Generating slug...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Destination Type */}
            <div className="space-y-2">
              <Label htmlFor="destination-type">Destination</Label>
              <Select 
                key={`destination-select-${open}`}
                value={destinationType} 
                onValueChange={handleDestinationTypeChange}
              >
                <SelectTrigger id="destination-type">
                  <SelectValue placeholder="Select destination type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="custom">Custom URL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Event Selection */}
            {destinationType === 'event' && (
              <div className="space-y-2">
                <Label htmlFor="event">Select Event</Label>
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                  <SelectTrigger id="event">
                    <SelectValue placeholder="Choose an event" />
                  </SelectTrigger>
                  <SelectContent 
                    position="popper" 
                    className="!z-[9999]" 
                    style={{ zIndex: 9999 }}
                  >
                    {isEventsLoading && (
                      <SelectItem disabled value="__loading">
                        Loading…
                      </SelectItem>
                    )}
                    {!isEventsLoading && events.filter((e) => e.status === 'published').length === 0 && (
                      <SelectItem disabled value="__empty">
                        No events found
                      </SelectItem>
                    )}
                    {!isEventsLoading && events
                      .filter((e) => e.status === 'published')
                      .map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Product Selection */}
            {destinationType === 'product' && (
              <div className="space-y-2">
                <Label htmlFor="product">Select Product</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger id="product">
                    <SelectValue placeholder="Choose a product" />
                  </SelectTrigger>
                  <SelectContent 
                    position="popper" 
                    className="!z-[9999]" 
                    style={{ zIndex: 9999 }}
                  >
                    {isProductsLoading && (
                      <SelectItem disabled value="__loading">
                        Loading…
                      </SelectItem>
                    )}
                    {!isProductsLoading && products.length === 0 && (
                      <SelectItem disabled value="__empty">
                        No products found
                      </SelectItem>
                    )}
                    {!isProductsLoading && products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Custom URL */}
            {destinationType === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="custom-url">Custom URL</Label>
                <Input
                  id="custom-url"
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full min-w-0"
                />
              </div>
            )}

            {(pipelineType === 'affiliate' || pipelineType === 'collab') && (
              <PartnerPipelineFields
                values={partnerFieldValues}
                onChange={patchPartnerFields}
                excludeOrgId={currentOrg?.id}
                showPipelineTypeSelect={false}
                destinationType={destinationType}
                selectedEventId={selectedEventId}
                selectedProductId={selectedProductId}
              />
            )}

            {/* Submit */}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={
                  isSubmitting ||
                  (isEditMode && loadingEdit) ||
                  !label.trim() ||
                  (!isEditMode && !slug) ||
                  !destinationUrl || 
                  ( (pipelineType === 'affiliate' || pipelineType === 'collab') && (!affiliateOrgId || !commissionRate || !startDate || !endDate)) ||
                  pipelineType === 'consignment'
                } 
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditMode
                      ? 'Saving...'
                      : pipelineType === 'affiliate' || pipelineType === 'collab'
                        ? 'Sending...'
                        : 'Creating...'}
                  </>
                ) : isEditMode ? (
                  'Save changes'
                ) : (
                  pipelineType === 'affiliate' || pipelineType === 'collab' ? 'Send collab / partner request' : 'Create Link'
                )}
              </Button>
            </div>
              </form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
