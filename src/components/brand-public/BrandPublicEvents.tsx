import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { formatShortEventDate } from '@/lib/utils/datetime';

const DEFAULT_ACCENT = '#E85D04';

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface EventItem {
  id: string;
  title: string;
  slug?: string | null;
  imageUrl: string | null;
  orgSlug?: string | null;
  dateStrings?: string[];
  priceFrom?: number | null;
}

interface BrandPublicEventsProps {
  orgSlug: string | null;
  events: EventItem[];
  loading?: boolean;
  isEditMode?: boolean;
  accentColor?: string | null;
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

  const handleEventClick = (e: EventItem) => {
    if (e.slug && orgSlug) {
      navigate(`/${orgSlug}/${e.slug}`);
    }
  };

  if (loading) {
    return (
      <section className="w-full px-4 py-4 md:py-6">
        <div className="max-w-6xl mx-auto">
          <div className="inline-block px-4 py-2 mb-6" style={{ backgroundColor: accent }}>
            <h2 className="text-xl font-bold text-white">events</h2>
            <p className="text-sm text-white/80">#RunHNT</p>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-[4/5] w-48 md:w-56 flex-shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (events.length === 0 && !isEditMode) return null;

  return (
    <section className="w-full px-4 py-4 md:py-6 bg-muted/20">
      <div className="max-w-6xl mx-auto">
        <div className="inline-block px-4 py-2 mb-6" style={{ backgroundColor: accent }}>
          <h2 className="text-xl font-bold text-white">events</h2>
          <p className="text-sm text-white/80">#RunHNT</p>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => handleEventClick(event)}
              className="relative flex-shrink-0 w-48 md:w-56 aspect-[4/5] rounded-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity group"
            >
              {event.imageUrl ? (
                <img
                  src={event.imageUrl}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <span className="text-sm text-muted-foreground px-2 text-center">{event.title}</span>
                </div>
              )}
              {event.priceFrom != null && (
                <div className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-medium" style={{ backgroundColor: accent, color: 'white' }}>
                  {event.priceFrom === 0 ? 'Free' : `From ${formatPrice(event.priceFrom)}`}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/70 to-transparent space-y-1">
                <p className="text-white font-medium text-sm truncate">{event.title}</p>
                {event.dateStrings && event.dateStrings.length > 0 && (
                  <p className="text-white/90 text-xs truncate">
                    {event.dateStrings.map(formatShortEventDate).join(', ')}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
