const DEFAULT_ACCENT = '#E85D04';

const DEFAULT_BODY = 'A push to refine, a push to explore and a push to make a better life.';

interface BrandPublicFooterProps {
  org: { id: string; name: string; slug?: string | null };
  profile: {
    logo_url?: string | null;
    hero_subheadline?: string | null;
    footer_tagline?: string | null;
    footer_body?: string | null;
    footer_contact_email?: string | null;
    footer_illustration_url?: string | null;
    accent_color?: string | null;
  } | null;
}

export default function BrandPublicFooter({ org, profile }: BrandPublicFooterProps) {
  const accentColor = profile?.accent_color || DEFAULT_ACCENT;
  const tagline = profile?.footer_tagline || profile?.hero_subheadline || 'One baby step at a time.';
  const body = profile?.footer_body || DEFAULT_BODY;
  const contactEmail = profile?.footer_contact_email || '';
  const footerIllustrationUrl = profile?.footer_illustration_url || null;
  const logoUrl = profile?.logo_url || null;
  const logoAreaImage = footerIllustrationUrl || logoUrl;

  return (
    <footer
      className="w-full px-4 py-10 md:py-12 lg:py-16"
      style={{ backgroundColor: accentColor }}
    >
      <div className="max-w-6xl lg:max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6 lg:gap-8">
        <div className="space-y-2 lg:space-y-3">
          <p className="text-white font-medium lg:text-lg">{tagline}</p>
          <p className="text-sm lg:text-base text-white/90">
            {body}
          </p>
          {contactEmail && (
            <p className="text-sm lg:text-base text-white/90">
              Contact us: <a href={`mailto:${contactEmail}`} className="underline hover:no-underline">{contactEmail}</a>
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 lg:gap-6">
          {logoAreaImage ? (
            <img
              src={logoAreaImage}
              alt={org.name}
              className={`h-12 w-12 lg:h-16 lg:w-16 object-contain ${footerIllustrationUrl ? '' : 'invert'}`}
            />
          ) : (
            <span className="text-2xl lg:text-3xl font-bold text-white">{org.name.charAt(0)}</span>
          )}
          <div className="text-xs lg:text-sm text-white/80">
            <p>© {new Date().getFullYear()} {org.name}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
