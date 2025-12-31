import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import InstagramEmbed from '@/components/social/InstagramEmbed';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

interface EventMediaBlockProps {
  instagramPostUrl?: string | null;
  previewImageUrl?: string | null;
  mode?: 'public' | 'preview';
}

/**
 * EventMediaBlock - Instagram preview/embed media block
 * 
 * Always reserves a right-column block.
 * - If previewImageUrl exists: render 4:5 thumbnail container
 * - Else if instagramPostUrl exists:
 *   - on md+ render <InstagramEmbed />
 *   - on mobile render placeholder card with "Open on Instagram" button
 * - Else render placeholder "No media"
 */
export default function EventMediaBlock({
  instagramPostUrl,
  previewImageUrl,
  mode = 'public',
}: EventMediaBlockProps) {
  const [showIgFullscreen, setShowIgFullscreen] = useState(false);

  // If preview image exists, show thumbnail
  if (previewImageUrl) {
    return (
      <>
        <div
          className="rounded-xl border bg-white p-2"
          style={{ borderColor: 'rgba(14,122,58,0.14)' }}
        >
          {/* Mobile: 4:5 portrait thumbnail (clickable to open fullscreen) */}
          <button
            type="button"
            className="md:hidden w-full"
            onClick={() => instagramPostUrl && setShowIgFullscreen(true)}
          >
            <div className="aspect-[4/5] w-full overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <img
                src={previewImageUrl}
                alt="Instagram preview"
                className="w-full h-full object-cover object-center"
                onError={(e) => {
                  // Fallback to placeholder if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = '<div class="h-full flex items-center justify-center text-[11px] text-muted-foreground bg-muted/30">No media</div>';
                  }
                }}
              />
            </div>
          </button>

          {/* Desktop: full embed if URL exists, otherwise just show image */}
          {instagramPostUrl ? (
            <div className="hidden md:block max-h-[520px] overflow-auto">
              <div className="w-full overflow-hidden">
                <InstagramEmbed url={instagramPostUrl} />
              </div>
            </div>
          ) : (
            <div className="hidden md:block aspect-[4/5] w-full overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
              <img
                src={previewImageUrl}
                alt="Event preview"
                className="w-full h-full object-cover object-center"
              />
            </div>
          )}
        </div>

        {/* Fullscreen Instagram embed dialog for mobile */}
        {instagramPostUrl && (
          <Dialog open={showIgFullscreen} onOpenChange={setShowIgFullscreen}>
            <DialogContent className="max-w-md p-0">
              <div className="p-4">
                <InstagramEmbed url={instagramPostUrl} />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  // If Instagram URL exists but no preview image
  if (instagramPostUrl) {
    return (
      <div
        className="rounded-xl border bg-white p-2"
        style={{ borderColor: 'rgba(14,122,58,0.14)' }}
      >
        {/* Desktop: full embed */}
        <div className="hidden md:block max-h-[520px] overflow-auto">
          <div className="w-full overflow-hidden">
            <InstagramEmbed url={instagramPostUrl} />
          </div>
        </div>

        {/* Mobile: placeholder card with "Open on Instagram" button */}
        <div className="md:hidden flex flex-col items-center justify-center p-6 border rounded-lg bg-muted/50" style={{ borderColor: 'rgba(14,122,58,0.14)', minHeight: '200px' }}>
          <p className="text-sm text-muted-foreground mb-4 text-center">
            Open on Instagram
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(instagramPostUrl, '_blank', 'noopener,noreferrer')}
            className="flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open on Instagram
          </Button>
        </div>
      </div>
    );
  }

  // No media placeholder
  return (
    <div
      className="rounded-xl border bg-white p-2"
      style={{ borderColor: 'rgba(14,122,58,0.14)' }}
    >
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-xs text-muted-foreground text-center">No media</p>
      </div>
    </div>
  );
}

