interface EventMediaBlockProps {
  previewImageUrl?: string | null;
  /** Cache-bust key (e.g. event.updated_at) so browser fetches fresh image after upload */
  cacheKey?: string | null;
  mode?: 'public' | 'preview';
}

/**
 * EventMediaBlock - Preview image media block
 * 
 * Always reserves a right-column block.
 * - If previewImageUrl exists: render 4:5 thumbnail container
 * - Else render placeholder "No media"
 */
export default function EventMediaBlock({
  previewImageUrl,
  cacheKey,
  mode = 'public',
}: EventMediaBlockProps) {
  // Build cache-busted URL so browser fetches fresh image after upload (same path = same URL = cached)
  const imgSrc = previewImageUrl && cacheKey
    ? `${previewImageUrl}${previewImageUrl.includes('?') ? '&' : '?'}v=${cacheKey}`
    : previewImageUrl;

  // If preview image exists, show thumbnail
  if (previewImageUrl) {
    return (
      <div
        className="rounded-xl border bg-white p-2"
        style={{ borderColor: 'rgba(14,122,58,0.14)' }}
      >
        <div className="aspect-[4/5] w-full overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
          <img
            src={imgSrc}
            alt="Event preview"
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

