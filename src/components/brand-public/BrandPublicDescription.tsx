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
    accent_color?: string | null;
  } | null;
  isEditMode?: boolean;
  onEditClick?: () => void;
}

const DEFAULT_ACCENT = '#E85D04';

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

  const accentColor = profile?.accent_color || DEFAULT_ACCENT;

  return (
    <section className="w-full px-4 py-4 md:py-6 lg:py-10 bg-amber-50">
      <div className="max-w-6xl lg:max-w-7xl mx-auto">
        <div className="flex">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Top: 3 columns - Brand (vertical) | Illustration | Text - same layout on all breakpoints */}
            <div className="flex flex-row gap-4 md:gap-6 lg:gap-10 mb-8 lg:mb-12 items-end">
              {/* 1. Vertical brand name - writing-mode flows text vertically without transform overflow */}
              <div className="flex-shrink-0 w-8 md:w-10 lg:w-12 flex items-end justify-end">
                <h2
                  className="text-lg md:text-2xl lg:text-4xl font-bold py-1"
                  style={{
                    color: '#0F1F17',
                    fontFamily: "'Inter Tight', sans-serif",
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    transform: 'rotate(180deg)',
                  }}
                >
                  {org.name}
                </h2>
              </div>
              {/* 2. Illustration - align to bottom with brand and text */}
              <div className="flex-shrink-0 flex items-end self-end">
                {illustrationUrl ? (
                  <img
                    src={illustrationUrl}
                    alt=""
                    className="w-20 h-20 md:w-32 md:h-32 lg:w-48 lg:h-48 object-contain"
                  />
                ) : (
                  <div
                    className="w-20 h-20 md:w-32 md:h-32 lg:w-48 lg:h-48 rounded-lg bg-muted/50 flex items-center justify-center"
                    style={{ border: '1px dashed rgba(0,0,0,0.2)' }}
                  >
                    <span className="text-xs text-muted-foreground">Illustration</span>
                  </div>
                )}
              </div>
              {/* 3. Description text - align to bottom with brand and illustration */}
              <div className="flex-1 min-w-0 flex flex-col justify-end space-y-3 md:space-y-4 lg:space-y-5">
                {intro && (
                  <p className="text-sm md:text-lg lg:text-xl" style={{ color: accentColor }}>
                    {intro}
                  </p>
                )}
                {body && (
                  <p className="text-sm md:text-lg lg:text-xl" style={{ color: '#0F1F17' }}>
                    {body}
                  </p>
                )}
              </div>
            </div>

            {/* Middle: Square photo carousel */}
            {images.length > 0 && (
              <div className="flex gap-3 lg:gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide mb-4 lg:mb-6">
                {images.slice(0, 7).map((url, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-28 md:w-32 lg:w-40 aspect-square rounded-xl overflow-hidden bg-muted"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Bottom: Tagline heading + paragraph, with links on right */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 lg:gap-8">
              <div className="space-y-2 lg:space-y-3">
                {tagline && (
                  <h3
                    className="text-xl lg:text-2xl font-bold"
                    style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
                  >
                    {tagline}
                  </h3>
                )}
                {taglineBody && (
                  <p className="text-base lg:text-lg leading-relaxed" style={{ color: 'rgba(15,31,23,0.85)' }}>
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
                      className="text-sm lg:text-base font-medium hover:underline"
                      style={{ color: accentColor }}
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
