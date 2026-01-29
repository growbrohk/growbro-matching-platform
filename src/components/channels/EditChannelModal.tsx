import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Check } from 'lucide-react';
import { ChannelRow } from '@/hooks/useChannelRows';

interface EditChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChannelRow | null;
  onSuccess?: () => void;
}

export function EditChannelModal({ open, onOpenChange, channel, onSuccess }: EditChannelModalProps) {
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [qrEnabled, setQrEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [destinationError, setDestinationError] = useState<string>('');

  // Initialize form when channel changes
  useEffect(() => {
    if (channel) {
      setLabel(channel.label || '');
      setDestinationUrl(channel.destination_url || '');
      setIsActive(channel.status === 'active');
      setQrEnabled(channel.qr_enabled || false);
    }
  }, [channel]);

  const handleClose = () => {
    setLabel('');
    setDestinationUrl('');
    setIsActive(true);
    setQrEnabled(false);
    setCopied(false);
    setIsSubmitting(false);
    setDestinationError('');
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!channel) {
      toast({
        title: 'Error',
        description: 'No channel selected',
        variant: 'destructive',
      });
      return;
    }

    const trimmedDestination = destinationUrl.trim();
    if (!trimmedDestination) {
      setDestinationError('Destination URL is required');
      toast({
        title: 'Error',
        description: 'Destination URL is required',
        variant: 'destructive',
      });
      return;
    }

    // Validate destination format: must start with /, http://, or https://
    if (
      !trimmedDestination.startsWith('/') &&
      !trimmedDestination.startsWith('http://') &&
      !trimmedDestination.startsWith('https://')
    ) {
      setDestinationError('Destination must start with / or http(s)://');
      toast({
        title: 'Error',
        description: 'Destination must start with / or http(s)://',
        variant: 'destructive',
      });
      return;
    }

    setDestinationError('');

    setIsSubmitting(true);

    try {
      // Use safe backend function that whitelists only editable fields
      // Explicitly prevents updating slug, host_org_id, affiliate_org_id
      const { data, error } = await supabase.rpc('update_tracking_link_safe', {
        p_tracking_link_id: channel.tracking_link_id,
        p_label: label.trim() || null,
        p_destination_url: trimmedDestination,
        p_status: isActive ? 'active' : 'inactive',
        p_qr_enabled: qrEnabled,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Channel updated successfully!',
      });

      // Call success callback to refresh data
      if (onSuccess) {
        onSuccess();
      }

      // Close modal after a short delay
      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error updating channel:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to update channel',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!channel?.slug) return;
    
    const publicLink = `${window.location.origin}/r/${channel.slug}`;
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Public link copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  if (!channel) {
    return null;
  }

  const publicLink = `${window.location.origin}/r/${channel.slug}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Channel</DialogTitle>
          <DialogDescription>
            Update channel settings. Slug and organization IDs cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="edit-label">Label</Label>
            <Input
              id="edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Instagram Post"
            />
          </div>

          {/* Destination URL */}
          <div className="space-y-2">
            <Label htmlFor="edit-destination-url">Destination URL</Label>
            <Input
              id="edit-destination-url"
              type="text"
              value={destinationUrl}
              onChange={(e) => {
                setDestinationUrl(e.target.value);
                setDestinationError('');
              }}
              placeholder="/path or https://example.com"
              required
            />
            {destinationError && (
              <p className="text-sm text-destructive">{destinationError}</p>
            )}
          </div>

          {/* Slug (Read-only) */}
          <div className="space-y-2">
            <Label htmlFor="edit-slug">Slug (read-only)</Label>
            <Input
              id="edit-slug"
              value={channel.slug}
              disabled
              className="bg-muted"
            />
          </div>

          {/* Public Link (Read-only with Copy) */}
          <div className="space-y-2">
            <Label htmlFor="edit-public-link">Public Link (read-only)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="edit-public-link"
                value={publicLink}
                disabled
                className="bg-muted flex-1"
              />
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

          {/* Is Active */}
          <div className="flex items-center justify-between space-x-2 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="edit-is-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                When active, the tracking link will redirect visitors
              </p>
            </div>
            <Switch
              id="edit-is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          {/* QR Enabled */}
          <div className="flex items-center justify-between space-x-2 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="edit-qr-enabled">QR Code Enabled</Label>
              <p className="text-xs text-muted-foreground">
                Enable QR code generation for this tracking link
              </p>
            </div>
            <Switch
              id="edit-qr-enabled"
              checked={qrEnabled}
              onCheckedChange={setQrEnabled}
            />
          </div>

          {/* Submit */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !destinationUrl.trim()} className="flex-1">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
