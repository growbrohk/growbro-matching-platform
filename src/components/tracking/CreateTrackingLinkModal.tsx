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
type PipelineType = 'tracking' | 'affiliate' | 'consignment';

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
  const [qrEnabled, setQrEnabled] = useState<boolean>(false);
  const [isGeneratingSlug, setIsGeneratingSlug] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch events for current org
  const { data: events = [] } = useQuery({
    queryKey: ['events', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      return getEvents(currentOrg.id);
    },
    enabled: !!currentOrg && open,
  });

  // Fetch products for current org
  const { data: products = [] } = useQuery({
    queryKey: ['products', currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      return getProducts(currentOrg.id);
    },
    enabled: !!currentOrg && open,
  });

  // Fetch connected orgs for affiliate selection
  const { data: connectedOrgs = [] } = useConnectedOrgs(currentOrg?.id);

  // Generate slug from label when label changes
  useEffect(() => {
    if (label && !slug) {
      generateSlugFromLabel(label);
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
    // Reset affiliate-specific fields when changing type
    if (type !== 'affiliate') {
      setAffiliateOrgId(undefined);
      setCommissionRate('');
      setStartDate('');
      setEndDate('');
    }
  };

  const handleDestinationTypeChange = (type: DestinationType) => {
    setDestinationType(type);
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
      // Assuming product pages follow similar pattern
      // Adjust based on your actual product URL structure
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

    if (!slug) {
      toast({
        title: 'Error',
        description: 'Please enter a slug',
        variant: 'destructive',
      });
      return;
    }

    // Validate affiliate-specific fields
    if (pipelineType === 'affiliate') {
      if (!affiliateOrgId) {
        toast({
          title: 'Error',
          description: 'Please select an affiliate partner',
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
          description: 'Please select both start and end dates for the affiliate period',
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

      // Create tracking link
      const insertData: any = {
        slug,
        label: label || null,
        destination_url: destinationUrl,
        host_org_id: currentOrg.id,
        type: pipelineType,
        status: initialStatus,
        qr_enabled: qrEnabled,
      };

      // Add affiliate-specific fields
      if (pipelineType === 'affiliate') {
        insertData.affiliate_org_id = affiliateOrgId;
        insertData.commission_rate = parseFloat(commissionRate) / 100; // Convert percent to decimal
        insertData.start_date = startDate;
        insertData.end_date = endDate;
      }

      const { data, error } = await (supabase.from('tracking_links' as any) as any)
        .insert(insertData)
        .select('id, slug, type, status')
        .single();

      if (error) throw error;

      // If affiliate link, create affiliate request
      if (pipelineType === 'affiliate') {
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
        title: pipelineType === 'affiliate' ? 'Request Sent' : 'Success',
        description: pipelineType === 'affiliate' 
          ? 'Affiliate request sent! The partner will be notified.' 
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
    setSlug('');
    setQrEnabled(false);
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
  const previewUrl = slug ? `${window.location.origin}/r/${slug}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Pipeline</DialogTitle>
          <DialogDescription>
            Create pipelines to increase exposure & income
          </DialogDescription>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-4 py-4">
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
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
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
                  <SelectItem value="consignment" disabled>Consignment (Coming soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Label */}
            <div className="space-y-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Instagram Post"
              />
            </div>

            {/* Destination Type */}
            <div className="space-y-2">
              <Label htmlFor="destination-type">Destination</Label>
              <Select value={destinationType} onValueChange={(v) => handleDestinationTypeChange(v as DestinationType)}>
                <SelectTrigger id="destination-type">
                  <SelectValue />
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
                  <SelectContent>
                    {events
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
                  <SelectContent>
                    {products.map((product) => (
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
                />
              </div>
            )}

            {/* Affiliate-specific fields */}
            {pipelineType === 'affiliate' && (
              <>
                {/* Affiliate Partner */}
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="start-date" className="text-xs text-muted-foreground">Start Date</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required={pipelineType === 'affiliate'}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="end-date" className="text-xs text-muted-foreground">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required={pipelineType === 'affiliate'}
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
                    required={pipelineType === 'affiliate'}
                  />
                </div>
              </>
            )}

            {/* Slug - Show for tracking and affiliate */}
            {(pipelineType === 'tracking' || pipelineType === 'affiliate') && (
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      /r/
                    </span>
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="pl-10"
                      placeholder="link-slug"
                      disabled={isGeneratingSlug}
                    />
                  </div>
                  {isGeneratingSlug && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {previewUrl && (
                  <p className="text-xs text-muted-foreground">
                    Preview: <code className="font-mono">{previewUrl}</code>
                  </p>
                )}
              </div>
            )}

            {/* QR Code - Show for tracking and affiliate */}
            {(pipelineType === 'tracking' || pipelineType === 'affiliate') && (
              <div className="space-y-2">
                <Label htmlFor="qr-code">QR Code</Label>
                <Select value={qrEnabled ? 'generate' : 'none'} onValueChange={(v) => setQrEnabled(v === 'generate')}>
                  <SelectTrigger id="qr-code">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="generate">Generate a QR Code</SelectItem>
                  </SelectContent>
                </Select>
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
                  !slug || 
                  !destinationUrl || 
                  (pipelineType === 'affiliate' && (!affiliateOrgId || !commissionRate || !startDate || !endDate)) ||
                  pipelineType === 'consignment'
                } 
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {pipelineType === 'affiliate' ? 'Sending...' : 'Creating...'}
                  </>
                ) : (
                  pipelineType === 'affiliate' ? 'Send affiliate request' : 'Create Link'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
