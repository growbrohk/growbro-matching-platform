import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

const BRAND_ACCENT = '#E85D04';

interface EventItem {
  id: string;
  title: string;
  slug?: string | null;
  imageUrl: string | null;
  orgSlug?: string | null;
}

interface BrandPublicEventsProps {
  orgSlug: string | null;
  events: EventItem[];
  loading?: boolean;
  isEditMode?: boolean;
}

export default function BrandPublicEvents({
  orgSlug,
  events,
  loading,
  isEditMode,
}: BrandPublicEventsProps) {
  const navigate = useNavigate();

  const handleEventClick = (e: EventItem) => {
    if (e.slug && orgSlug) {
      navigate(`/${orgSlug}/${e.slug}`);
    }
  };

  if (loading) {
    return (
      <section className="w-full px-4 py-4 md:py-6">
        <div className="max-w-6xl mx-auto">
          <div className="inline-block px-4 py-2 mb-6" style={{ backgroundColor: BRAND_ACCENT }}>
            <h2 className="text-xl font-bold text-white">events</h2>
            <p className="text-sm text-white/80">#RunHNT</p>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-[4/5] w-44 md:w-48 flex-shrink-0 rounded-lg" />
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
        <div className="inline-block px-4 py-2 mb-6" style={{ backgroundColor: BRAND_ACCENT }}>
          <h2 className="text-xl font-bold text-white">events</h2>
          <p className="text-sm text-white/80">#RunHNT</p>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => handleEventClick(event)}
              className="relative flex-shrink-0 w-44 md:w-48 aspect-[4/5] rounded-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity group"
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
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                <p className="text-white font-medium text-sm truncate">{event.title}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
