import { useState, useEffect } from 'react';
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
import { OrgSearchCombobox } from './OrgSearchCombobox';

interface CreateTrackingLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DestinationType = 'event' | 'product' | 'custom';
type PipelineType = 'tracking' | 'affiliate' | 'collab' | 'consignment';

export function CreateTrackingLinkModal({ open, onOpenChange }: CreateTrackingLinkModalProps) {
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

  // Fetch events for current org
  const { data: events = [], isLoading: isEventsLoading } = useQuery({
    queryKey: ['events', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      return getEvents(currentOrg.id);
    },
    enabled: !!currentOrg && open,
  });

  // Fetch products for current org (host org, not affiliate org)
  const { data: products = [], isLoading: isProductsLoading } = useQuery({
    queryKey: ['products', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      return getProducts(currentOrg.id);
    },
    enabled: !!currentOrg && open && destinationType === 'product',
  });

  // Fetch connected orgs for affiliate selection
  const { data: connectedOrgs = [] } = useConnectedOrgs(currentOrg?.id);

  // Generate slug from label when label changes
  useEffect(() => {
    if (label && label.trim()) {
      generateSlugFromLabel(label);
    } else {
      setSlug('');
    }
  }, [label]);

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

    if (!slug) {
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
      // Validate slug uniqueness
      const { data: existing } = await (supabase.from('tracking_links' as any) as any)
        .select('id')
        .eq('slug', slug)
        .single();

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

      // Ensure destination_type is explicitly set (should never be undefined/null)
      const finalDestinationType: DestinationType = destinationType || 'custom';

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
        insertData.commission_rate = parseFloat(commissionRate) / 100; // Convert percent to decimal
        insertData.start_date = startDate;
        insertData.end_date = endDate;
      }

      if (pipelineType === 'collab') {
        insertData.collab_sales_scope = collabSalesScope;
        insertData.collab_partner_role = collabPartnerRole;
        insertData.collab_can_view_order_details = collabCanViewDetails;
        insertData.collab_can_mark_shipped = collabCanMarkShipped;
        const isEventCollab = finalDestinationType === 'event' && !!selectedEventId;
        insertData.collab_show_event_in_partner_events_tab = isEventCollab
          ? collabShowInPartnerEventsTab
          : true;
        insertData.collab_partner_allow_edit_tab = isEventCollab ? collabAllowEditTab : false;
        insertData.collab_partner_allow_tickets_tab = isEventCollab ? collabAllowTicketsTab : true;
        insertData.collab_partner_allow_scan_tab = isEventCollab ? collabAllowScanTab : true;
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
    setSlug('');
    setCreatedLink(null);
    setCopied(false);
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
            <DialogTitle>Create Pipeline</DialogTitle>
            <DialogDescription>
              Create pipelines to increase exposure & income
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-4">
            {createdLink ? (
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

            {/* Affiliate-specific fields */}
            {(pipelineType === 'affiliate' || pipelineType === 'collab') && (
              <>
                {/* Partner org */}
                <div className="space-y-2">
                  <Label htmlFor="affiliate">Affiliate Partner</Label>
                  <OrgSearchCombobox
                    value={affiliateOrgId}
                    onValueChange={setAffiliateOrgId}
                    placeholder="Search organizations..."
                    excludeOrgId={currentOrg?.id}
                  />
                </div>

                {/* Affiliate Period */}
                <div className="space-y-2">
                  <Label>Affiliate Period</Label>
                  <div className="grid grid-cols-2 gap-2 min-w-0">
                    <div className="space-y-1 min-w-0">
                      <Label htmlFor="start-date" className="text-xs text-muted-foreground">Start Date</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required={pipelineType === 'affiliate' || pipelineType === 'collab'}
                        className="w-full min-w-0 text-sm"
                      />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <Label htmlFor="end-date" className="text-xs text-muted-foreground">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required={pipelineType === 'affiliate' || pipelineType === 'collab'}
                        className="w-full min-w-0 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Commission Rate */}
                <div className="space-y-2">
                  <Label htmlFor="commission-rate">Commission Rate (%)</Label>
                  <Input
                    id="commission-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder="e.g., 15"
                    required={pipelineType === 'affiliate' || pipelineType === 'collab'}
                  />
                </div>
              </>
            )}

            {pipelineType === 'collab' && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Partner visibility</p>
                <div className="space-y-2">
                  <Label htmlFor="collab-scope">Sales visibility</Label>
                  <Select value={collabSalesScope} onValueChange={(v) => setCollabSalesScope(v as 'attributed' | 'all_for_resource')}>
                    <SelectTrigger id="collab-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="attributed">Orders through this link only</SelectItem>
                      <SelectItem value="all_for_resource">All sales for this product or event</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collab-role">Partner role</Label>
                  <Select value={collabPartnerRole} onValueChange={(v) => setCollabPartnerRole(v as 'viewer' | 'editor')}>
                    <SelectTrigger id="collab-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                      <SelectItem value="editor">Editor (can confirm orders)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="collab-details" className="text-sm font-normal">Allow order detail page</Label>
                  <input
                    id="collab-details"
                    type="checkbox"
                    className="h-4 w-4 accent-gray-800"
                    checked={collabCanViewDetails}
                    onChange={(e) => setCollabCanViewDetails(e.target.checked)}
                  />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <Label htmlFor="collab-shipped" className="text-sm font-normal leading-snug">
                    Allow partner to mark sent and tracking (after payment is confirmed)
                  </Label>
                  <input
                    id="collab-shipped"
                    type="checkbox"
                    className="h-4 w-4 accent-gray-800 mt-0.5 shrink-0"
                    checked={collabCanMarkShipped}
                    onChange={(e) => setCollabCanMarkShipped(e.target.checked)}
                    disabled={collabPartnerRole !== 'editor'}
                  />
                </div>
                {collabPartnerRole !== 'editor' ? (
                  <p className="text-xs text-muted-foreground">Editors only — set role to Editor to enable.</p>
                ) : null}

                {destinationType === 'event' && selectedEventId ? (
                  <div className="space-y-3 pt-2 border-t border-border/60">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Partner dashboard (this event)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Control what the partner org sees in Events and on the event detail page after the collab is active.
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="collab-show-events-tab" className="text-sm font-normal leading-snug">
                        Show event in partner&apos;s Events tab
                      </Label>
                      <input
                        id="collab-show-events-tab"
                        type="checkbox"
                        className="h-4 w-4 accent-gray-800 shrink-0"
                        checked={collabShowInPartnerEventsTab}
                        onChange={(e) => setCollabShowInPartnerEventsTab(e.target.checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="collab-allow-tickets" className="text-sm font-normal leading-snug">
                        Allow Tickets tab (guest list)
                      </Label>
                      <input
                        id="collab-allow-tickets"
                        type="checkbox"
                        className="h-4 w-4 accent-gray-800 shrink-0"
                        checked={collabAllowTicketsTab}
                        onChange={(e) => setCollabAllowTicketsTab(e.target.checked)}
                      />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <Label htmlFor="collab-allow-scan" className="text-sm font-normal leading-snug">
                        Allow Scan tab (check-in). Requires partner role Editor.
                      </Label>
                      <input
                        id="collab-allow-scan"
                        type="checkbox"
                        className="h-4 w-4 accent-gray-800 mt-0.5 shrink-0"
                        checked={collabAllowScanTab}
                        onChange={(e) => setCollabAllowScanTab(e.target.checked)}
                        disabled={collabPartnerRole !== 'editor'}
                      />
                    </div>
                    {collabPartnerRole !== 'editor' ? (
                      <p className="text-xs text-muted-foreground">Set role to Editor to allow door check-in.</p>
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <Label htmlFor="collab-allow-edit" className="text-sm font-normal leading-snug">
                        Allow Edit tab (event &amp; ticket setup). Requires partner role Editor.
                      </Label>
                      <input
                        id="collab-allow-edit"
                        type="checkbox"
                        className="h-4 w-4 accent-gray-800 mt-0.5 shrink-0"
                        checked={collabAllowEditTab}
                        onChange={(e) => setCollabAllowEditTab(e.target.checked)}
                        disabled={collabPartnerRole !== 'editor'}
                      />
                    </div>
                    {collabPartnerRole !== 'editor' ? (
                      <p className="text-xs text-muted-foreground">Set role to Editor to allow editing event details.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
                  !label.trim() ||
                  !slug || 
                  !destinationUrl || 
                  ( (pipelineType === 'affiliate' || pipelineType === 'collab') && (!affiliateOrgId || !commissionRate || !startDate || !endDate)) ||
                  pipelineType === 'consignment'
                } 
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {pipelineType === 'affiliate' || pipelineType === 'collab' ? 'Sending...' : 'Creating...'}
                  </>
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
