import { useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface QrCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
}

export function QrCodeModal({ open, onOpenChange, slug }: QrCodeModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  const qrUrl = `${window.location.origin}/r/${slug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Tracking link copied to clipboard',
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

  const handleDownloadPNG = () => {
    if (!qrContainerRef.current) return;

    // Find the canvas element within the QR code container
    const canvas = qrContainerRef.current.querySelector('canvas');
    if (!canvas) {
      toast({
        title: 'Error',
        description: 'QR code canvas not found',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Get the canvas data URL
      const dataUrl = canvas.toDataURL('image/png');
      
      // Create a temporary anchor element and trigger download
      const link = document.createElement('a');
      link.download = `qr-code-${slug}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Downloaded!',
        description: 'QR code downloaded successfully',
      });
    } catch (err) {
      console.error('Failed to download QR code:', err);
      toast({
        title: 'Error',
        description: 'Failed to download QR code',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>QR Code</DialogTitle>
          <DialogDescription>
            Scan this QR code to access the tracking link
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* QR Code Display */}
          <div ref={qrContainerRef} className="flex justify-center p-4 bg-white rounded-lg border">
            <QRCodeCanvas
              value={qrUrl}
              size={256}
              level="M"
              includeMargin={true}
            />
          </div>

          {/* Link Display */}
          <div className="rounded-lg border p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Tracking Link</p>
            <code className="text-sm font-mono break-all">{qrUrl}</code>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyLink}
              className="flex-1"
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </>
              )}
            </Button>
            <Button
              type="button"
              onClick={handleDownloadPNG}
              className="flex-1"
              style={{ backgroundColor: '#0E7A3A', color: 'white' }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PNG
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
