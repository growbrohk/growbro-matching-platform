import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import BrandEventCard from '@/components/brand-public/BrandEventCard';
import type { BrandEvent } from '@/hooks/use-brand-page-data';

const DEFAULT_ACCENT = '#E85D04';

interface BrandPublicEventsProps {
  orgSlug: string | null;
  events: BrandEvent[];
  loading?: boolean;
  isEditMode?: boolean;
  accentColor?: string | null;
}

function EventsSectionHeader({
  accent,
  orgSlug,
  onSeeAll,
}: {
  accent: string;
  orgSlug: string | null;
  onSeeAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6 lg:mb-8">
      <h2 className="text-xl lg:text-2xl font-bold" style={{ color: accent }}>
        Event
      </h2>
      {orgSlug && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-sm font-medium hover:underline"
          style={{ color: accent }}
        >
          See all
        </button>
      )}
    </div>
  );
}

export default function BrandPublicEvents({
  orgSlug,
  events,
  loading,
  isEditMode,
  accentColor = DEFAULT_ACCENT,
}: BrandPublicEventsProps) {
  const navigate = useNavigate();
  const accent = accentColor || DEFAULT_ACCENT;

  const handleSeeAll = () => {
    if (orgSlug) navigate(`/${orgSlug}/events`);
  };

  const handleEventClick = (e: BrandEvent) => {
    const s = e.orgSlug || orgSlug;
    if (e.slug && s) {
      navigate(`/${s}/${e.slug}`);
    }
  };

  if (loading) {
    return (
      <section className="w-full px-4 py-4 md:py-6 lg:py-8">
        <div className="max-w-6xl lg:max-w-7xl mx-auto">
          <EventsSectionHeader accent={accent} orgSlug={orgSlug} onSeeAll={handleSeeAll} />
          <div className="flex gap-4 lg:gap-6 overflow-x-auto pb-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-[4/5] w-48 md:w-56 lg:w-64 flex-shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (events.length === 0 && !isEditMode) return null;

  return (
    <section className="w-full px-4 py-4 md:py-6 lg:py-8 bg-muted/20">
      <div className="max-w-6xl lg:max-w-7xl mx-auto">
        <EventsSectionHeader accent={accent} orgSlug={orgSlug} onSeeAll={handleSeeAll} />
        <div className="flex gap-4 lg:gap-6 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {events.map((event) => (
            <BrandEventCard
              key={event.id}
              event={event}
              accentColor={accent}
              onClick={() => handleEventClick(event)}
              className="flex-shrink-0 w-48 md:w-56 lg:w-64"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
