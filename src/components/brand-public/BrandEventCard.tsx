import { cn } from '@/lib/utils';
import { formatShortEventDate } from '@/lib/utils/datetime';

export interface BrandEventCardItem {
  id: string;
  title: string;
  slug?: string | null;
  imageUrl: string | null;
  dateStrings?: string[];
  priceFrom?: number | null;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface BrandEventCardProps {
  event: BrandEventCardItem;
  accentColor: string;
  onClick: () => void;
  className?: string;
}

export default function BrandEventCard({
  event,
  accentColor,
  onClick,
  className,
}: BrandEventCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative aspect-[4/5] rounded-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity group',
        className,
      )}
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
        <div
          className="absolute top-2 right-2 lg:top-3 lg:right-3 px-2 py-1 lg:px-3 lg:py-1.5 rounded-md text-xs lg:text-sm font-medium"
          style={{ backgroundColor: accentColor, color: 'white' }}
        >
          {event.priceFrom === 0 ? 'Free' : `From ${formatPrice(event.priceFrom)}`}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5 bg-gradient-to-t from-black/70 to-transparent space-y-1">
        <p className="text-white font-medium text-sm lg:text-base truncate">{event.title}</p>
        {event.dateStrings && event.dateStrings.length > 0 && (
          <p className="text-white/90 text-xs lg:text-sm truncate">
            {event.dateStrings.map(formatShortEventDate).join(', ')}
          </p>
        )}
      </div>
    </button>
  );
}
