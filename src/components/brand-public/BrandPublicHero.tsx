import { Link } from 'react-router-dom';

interface BrandPublicHeroProps {
  org: { id: string; name: string; slug?: string | null };
  isOwner?: boolean;
  profile: {
    logo_url?: string | null;
    hero_banner_url?: string | null;
    hero_headline?: string | null;
    hero_subheadline?: string | null;
  } | null;
  isEditMode?: boolean;
  onEditClick?: () => void;
}

const BRAND_ACCENT = '#E85D04'; // Orange accent for brand pages

export default function BrandPublicHero({
  org,
  profile,
  isOwner,
  isEditMode,
  onEditClick,
}: BrandPublicHeroProps) {
  const logoUrl = profile?.logo_url || null;
  const bannerUrl = profile?.hero_banner_url || null;
  const headline = profile?.hero_headline || org.name;
  const subheadline = profile?.hero_subheadline || '';

  return (
    <section className="relative w-full min-h-[60vh] md:min-h-[70vh] flex flex-col">
      {/* Header bar - fixed at top of hero */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 md:px-6"
        style={{ backgroundColor: BRAND_ACCENT }}
      >
        <Link to={`/${org.slug || org.id}`} className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={org.name} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-white">{org.name.charAt(0)}</span>
          )}
          <span className="font-semibold text-white text-sm md:text-base">{org.name}</span>
        </Link>
        {isOwner ? (
          <Link
            to="/app/settings/brand-page"
            className="text-sm font-medium text-white hover:underline"
          >
            Edit page
          </Link>
        ) : (
          <Link
            to="/auth"
            className="text-sm font-medium text-white hover:underline"
          >
            Join us now
          </Link>
        )}
      </div>

      {/* Hero banner */}
      <div
        className="relative flex-1 flex items-end min-h-[50vh]"
        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: '#1a1a1a' }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 w-full px-4 pb-8 md:px-8 md:pb-12 max-w-4xl">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-2" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
            {headline}
          </h1>
          {subheadline && (
            <p className="text-lg md:text-xl text-white/90">{subheadline}</p>
          )}
        </div>
        {isEditMode && onEditClick && (
          <button
            type="button"
            onClick={onEditClick}
            className="absolute top-20 right-4 z-20 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/90 text-gray-800 hover:bg-white"
          >
            Edit
          </button>
        )}
      </div>
    </section>
  );
}
