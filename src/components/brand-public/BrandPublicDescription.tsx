import { Link } from 'react-router-dom';

interface BrandPublicDescriptionProps {
  org: { id: string; name: string };
  profile: {
    description_intro?: string | null;
    description_body?: string | null;
    description_images?: string[] | null;
    description_tagline?: string | null;
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
  const rawImages = profile?.description_images;
  const images: string[] = Array.isArray(rawImages)
    ? rawImages.map((x) => (typeof x === 'string' ? x : (x as { url?: string })?.url || '')).filter(Boolean)
    : [];
  const tagline = profile?.description_tagline || null;
  const links = profile?.footer_links || [];

  const hasContent = intro || body || images.length > 0 || tagline || links.length > 0;

  if (!hasContent && !isEditMode) return null;

  return (
    <section className="w-full px-4 py-12 md:py-16">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Side title */}
          <div className="lg:col-span-2">
            <h2
              className="text-2xl md:text-3xl font-bold rotate-0 lg:-rotate-90 lg:origin-bottom-left lg:whitespace-nowrap"
              style={{ color: '#0F1F17', fontFamily: "'Inter Tight', sans-serif" }}
            >
              {org.name}
            </h2>
          </div>

          {/* Content */}
          <div className="lg:col-span-10 space-y-6">
            {(intro || body) && (
              <div className="space-y-4">
                {intro && (
                  <p className="text-lg" style={{ color: BRAND_ACCENT }}>
                    {intro}
                  </p>
                )}
                {body && (
                  <p className="text-lg" style={{ color: BRAND_ACCENT }}>
                    {body}
                  </p>
                )}
              </div>
            )}

            {/* Image gallery */}
            {images.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {images.slice(0, 3).map((url, i) => (
                  <div
                    key={i}
                    className="aspect-[4/3] rounded-xl overflow-hidden bg-muted"
                  >
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Tagline and links */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pt-4">
              <div>
                {tagline && (
                  <p className="text-base font-medium mb-2" style={{ color: '#0F1F17' }}>
                    {tagline}
                  </p>
                )}
                <p className="text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
                  Come and join our club now.
                </p>
              </div>
              {links.length > 0 && (
                <div className="flex flex-wrap gap-4">
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
