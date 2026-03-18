interface BrandPublicDescriptionProps {
  org: { id: string; name: string };
  profile: {
    description_intro?: string | null;
    description_body?: string | null;
    description_images?: string[] | null;
    description_illustration_url?: string | null;
    description_tagline?: string | null;
    description_tagline_body?: string | null;
    footer_links?: { label: string; url: string }[] | null;
  } | null;
  isEditMode?: boolean;
  onEditClick?: () => void;
}

const BRAND_ACCENT = '#E85D04';

export default function BrandPublicDescription({
  org,
  profile,
  isEditMode,
  onEditClick,
}: BrandPublicDescriptionProps) {
  const intro = profile?.description_intro || null;
  const body = profile?.description_body || null;
  const illustrationUrl = profile?.description_illustration_url || null;
  const rawImages = profile?.description_images;
  const images: string[] = Array.isArray(rawImages)
    ? rawImages.map((x) => (typeof x === 'string' ? x : (x as { url?: string })?.url || '')).filter(Boolean)
    : [];
  const tagline = profile?.description_tagline || null;
  const taglineBody = profile?.description_tagline_body || null;
  const links = profile?.footer_links || [];

  const hasContent =
    intro ||
    body ||
    illustrationUrl ||
    images.length > 0 ||
    tagline ||
    taglineBody ||
    links.length > 0;

  if (!hasContent && !isEditMode) return null;

  return (
    <section className="w-full px-4 py-12 md:py-16">
      <div className="max-w-6xl mx-auto">
        <div className="flex">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Top: Brand | Illustration | Text - all bottom-aligned (reference layout) */}
            <div className="flex gap-6 md:gap-8 mb-8 items-end overflow-x-auto pb-4 -mx-4 px-4 lg:overflow-visible lg:mx-0 lg:px-0 scrollbar-hide">
              {/* 1. Vertical brand name - bottom aligns with illustration & text */}
              <div className="flex-shrink-0 w-16 md:w-20 lg:w-24 flex items-end justify-center">
                <h2
                  className="text-xl md:text-2xl lg:text-3xl font-bold whitespace-nowrap rotate-90 origin-bottom"
                  style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
                >
                  {org.name}
                </h2>
              </div>
              {/* 2. Illustration - bottom aligns with body text */}
              <div className="flex-shrink-0">
                {illustrationUrl ? (
                  <img
                    src={illustrationUrl}
                    alt=""
                    className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 object-contain"
                  />
                ) : (
                  <div
                    className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-lg bg-muted/50 flex items-center justify-center"
                    style={{ border: '1px dashed rgba(0,0,0,0.2)' }}
                  >
                    <span className="text-xs text-muted-foreground">Illustration</span>
                  </div>
                )}
              </div>
              {/* 3. Intro + body paragraphs */}
              <div className="flex-shrink-0 min-w-[200px] max-w-[280px] lg:flex-1 lg:min-w-0 lg:max-w-none space-y-3 md:space-y-4">
                {intro && (
                  <p className="text-sm md:text-lg" style={{ color: BRAND_ACCENT }}>
                    {intro}
                  </p>
                )}
                {body && (
                  <p className="text-sm md:text-lg" style={{ color: '#0F1F17' }}>
                    {body}
                  </p>
                )}
              </div>
            </div>

            {/* Middle: Square photo carousel */}
            {images.length > 0 && (
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide mb-8">
                {images.slice(0, 3).map((url, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-64 aspect-square rounded-xl overflow-hidden bg-muted"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Bottom: Tagline heading + paragraph, with links on right */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="space-y-2">
                {tagline && (
                  <h3
                    className="text-xl font-bold"
                    style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
                  >
                    {tagline}
                  </h3>
                )}
                {taglineBody && (
                  <p className="text-base leading-relaxed" style={{ color: 'rgba(15,31,23,0.85)' }}>
                    {taglineBody}
                  </p>
                )}
              </div>
              {links.length > 0 && (
                <div className="flex flex-wrap gap-4 md:flex-col md:gap-2">
                  {links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline"
                      style={{ color: BRAND_ACCENT }}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {isEditMode && onEditClick && (
          <button
            type="button"
            onClick={onEditClick}
            className="mt-6 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 hover:bg-muted"
          >
            Edit
          </button>
        )}
      </div>
    </section>
  );
}
