import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import ProfileActions from '@/components/profile/ProfileActions';
import BrandPublicHero from '@/components/brand-public/BrandPublicHero';
import BrandPublicEvents from '@/components/brand-public/BrandPublicEvents';
import BrandPublicDescription from '@/components/brand-public/BrandPublicDescription';
import BrandPublicProducts from '@/components/brand-public/BrandPublicProducts';
import BrandPublicFooter from '@/components/brand-public/BrandPublicFooter';
import type { OrgWithProfile } from '@/lib/api/orgs';

export type BrandPageViewVariant = 'standalone' | 'embedded';

interface BrandPageViewProps {
  org: OrgWithProfile;
  events: Parameters<typeof BrandPublicEvents>[0]['events'];
  products: Parameters<typeof BrandPublicProducts>[0]['products'];
  dataLoading: boolean;
  isOwner: boolean;
  variant?: BrandPageViewVariant;
}

export default function BrandPageView({
  org,
  events,
  products,
  dataLoading,
  isOwner,
  variant = 'standalone',
}: BrandPageViewProps) {
  const navigate = useNavigate();
  const embedded = variant === 'embedded';
  const topSection = org.profile?.top_section || 'events';
  const bottomSection = org.profile?.bottom_section || 'products';
  const accentColor = org.profile?.accent_color;

  const renderEvents = () => (
    <BrandPublicEvents
      orgSlug={org.slug}
      events={events}
      loading={dataLoading}
      isEditMode={false}
      accentColor={accentColor}
    />
  );

  const renderProducts = () => (
    <BrandPublicProducts
      orgSlug={org.slug}
      products={products}
      loading={dataLoading}
      isEditMode={false}
      accentColor={accentColor}
    />
  );

  return (
    <div
      className={cn(
        'bg-background',
        embedded ? 'min-h-0' : 'min-h-screen',
        embedded && '-mx-4 md:-mx-6 -mt-6 md:-mt-8 mb-20 md:mb-0'
      )}
    >
      {isOwner && !embedded && (
        <div className="fixed top-14 md:top-16 right-4 z-50 flex items-center gap-2">
          <ProfileActions mode="public" otherOrgId={org.id} orgSlug={org.slug} />
        </div>
      )}

      <BrandPublicHero
        org={org}
        profile={org.profile}
        isOwner={isOwner}
        headerVariant={variant}
      />

      {topSection !== 'hidden' && (
        <>
          {(topSection === 'events' || topSection === 'both') && renderEvents()}
          {(topSection === 'products' || topSection === 'both') && renderProducts()}
        </>
      )}

      <BrandPublicDescription
        org={org}
        profile={org.profile}
        isEditMode={false}
        onEditClick={() => navigate('/app/settings/brand-page')}
      />

      {bottomSection !== 'hidden' && (
        <>
          {(bottomSection === 'events' || bottomSection === 'both') && renderEvents()}
          {(bottomSection === 'products' || bottomSection === 'both') && renderProducts()}
        </>
      )}

      <BrandPublicFooter org={org} profile={org.profile} />
    </div>
  );
}
