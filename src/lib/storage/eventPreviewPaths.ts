/** Public URL shape: .../storage/v1/object/public/event-previews/<path> */
const EVENT_PREVIEWS_PUBLIC_MARKER = '/storage/v1/object/public/event-previews/';

export function getEventPreviewStoragePathFromPublicUrl(url: string): string | null {
  const qIdx = url.indexOf('?');
  const base = qIdx === -1 ? url : url.slice(0, qIdx);
  const idx = base.indexOf(EVENT_PREVIEWS_PUBLIC_MARKER);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(base.slice(idx + EVENT_PREVIEWS_PUBLIC_MARKER.length));
  } catch {
    return base.slice(idx + EVENT_PREVIEWS_PUBLIC_MARKER.length);
  }
}
