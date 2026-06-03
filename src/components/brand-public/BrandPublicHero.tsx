import { useState, useEffect } from 'react';
import BrandPublicHeader, { type BrandPublicHeaderVariant } from '@/components/brand-public/BrandPublicHeader';

interface BrandPublicHeroProps {
  org: { id: string; name: string; slug?: string | null };
  isOwner?: boolean;
  headerVariant?: BrandPublicHeaderVariant;
  profile: {
    logo_url?: string | null;
    hero_banner_url?: string | null;
    hero_banner_images?: string[] | null;
    hero_headline?: string | null;
    hero_subheadline?: string | null;
    accent_color?: string | null;
  } | null;
}

const CAROUSEL_INTERVAL_MS = 5000;

export default function BrandPublicHero({
  org,
  profile,
  isOwner,
  headerVariant = 'standalone',
}: BrandPublicHeroProps) {
  const rawImages = profile?.hero_banner_images;
  const images: string[] = Array.isArray(rawImages)
    ? rawImages.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const fallbackUrl = profile?.hero_banner_url || null;
  const bannerImages = images.length > 0 ? images : fallbackUrl ? [fallbackUrl] : [];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (bannerImages.length <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % bannerImages.length);
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [bannerImages.length]);

  const headline = profile?.hero_headline || org.name;
  const subheadline = profile?.hero_subheadline || '';

  return (
    <section className="relative w-full min-h-[40vh] md:min-h-[45vh] lg:min-h-[55vh] flex flex-col">
      <BrandPublicHeader
        org={org}
        profile={profile}
        showBackLink={false}
        isOwner={isOwner}
        variant={headerVariant}
      />

      {/* Hero banner carousel */}
      <div
        className="relative flex-1 flex items-end min-h-[35vh] md:min-h-[38vh] lg:min-h-[45vh] overflow-hidden"
        style={bannerImages.length === 0 ? { backgroundColor: '#1a1a1a' } : undefined}
      >
        {bannerImages.length > 0 && (
          <>
            {bannerImages.map((url, i) => (
              <div
                key={url + i}
                className="absolute inset-0 transition-opacity duration-700 ease-in-out"
                style={{
                  backgroundImage: `url(${url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  opacity: i === currentIndex ? 1 : 0,
                  zIndex: i === currentIndex ? 1 : 0,
                }}
              />
            ))}
          </>
        )}
        <div className="relative z-10 w-full px-4 pb-8 md:px-8 md:pb-12 lg:px-12 lg:pb-16 max-w-4xl lg:max-w-5xl">
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-2" style={{ fontFamily: "'Inter Tight', sans-serif" }}>
            {headline}
          </h1>
          {subheadline && (
            <p className="text-lg md:text-xl lg:text-2xl text-white/90">{subheadline}</p>
          )}
        </div>
      </div>
    </section>
  );
}
