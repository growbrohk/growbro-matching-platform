import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import { usePublicCart } from '@/contexts/PublicCartContext';

const DEFAULT_ACCENT = '#E85D04';

interface BrandPublicHeaderProps {
  org: { id: string; name: string; slug?: string | null };
  profile: { logo_url?: string | null; accent_color?: string | null } | null;
  showBackLink?: boolean;
  isOwner?: boolean;
}

export default function BrandPublicHeader({
  org,
  profile,
  showBackLink = false,
  isOwner = false,
}: BrandPublicHeaderProps) {
  const { orgId, setOrgId, totalQty } = usePublicCart();
  const logoUrl = profile?.logo_url || null;
  const accentColor = profile?.accent_color || DEFAULT_ACCENT;
  const brandUrl = `/${org.slug || org.id}`;

  useEffect(() => {
    setOrgId(org.id);
  }, [org.id, setOrgId]);

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 md:px-6 lg:px-8 lg:py-4"
        style={{ backgroundColor: accentColor }}
      >
      <Link to={brandUrl} className="flex items-center gap-2">
        {showBackLink && <ArrowLeft className="h-5 w-5 text-white" />}
        {logoUrl ? (
          <img src={logoUrl} alt={org.name} className="h-8 w-8 lg:h-10 lg:w-10 rounded-full object-cover" />
        ) : (
          <span className="text-lg lg:text-xl font-bold text-white">{org.name.charAt(0)}</span>
        )}
        <span className="font-semibold text-white text-sm md:text-base lg:text-lg">{org.name}</span>
      </Link>
      <div className="flex items-center gap-3">
        <Link
          to={`${brandUrl}/checkout`}
          className="relative p-2 rounded-lg hover:bg-white/20 transition-colors"
          aria-label={totalQty > 0 ? `Cart with ${totalQty} items` : 'Cart'}
        >
          <ShoppingCart className="h-5 w-5 text-white" />
          {orgId === org.id && totalQty > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-white text-xs font-bold text-black px-1">
              {totalQty > 99 ? '99+' : totalQty}
            </span>
          )}
        </Link>
        {isOwner && (
          <Link
            to="/app/settings/brand-page"
            className="text-sm lg:text-base font-medium text-white hover:underline"
          >
            Edit page
          </Link>
        )}
      </div>
    </div>
      {/* Spacer so content below is not hidden under fixed header */}
      <div className="h-14 md:h-16" aria-hidden="true" />
    </>
  );
}
