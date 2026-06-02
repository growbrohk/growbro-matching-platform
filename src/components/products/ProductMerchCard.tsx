import { cn } from '@/lib/utils';

const DEFAULT_ACCENT = '#0E7A3A';

export function formatMerchCardPrice(amount: number): string {
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface ProductMerchCardProps {
  title: string;
  imageUrl?: string | null;
  price?: number | null;
  accentColor?: string | null;
  onClick?: () => void;
  className?: string;
}

export function ProductMerchCard({
  title,
  imageUrl,
  price,
  accentColor = DEFAULT_ACCENT,
  onClick,
  className,
}: ProductMerchCardProps) {
  const accent = accentColor || DEFAULT_ACCENT;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity text-left w-full',
        className,
      )}
    >
      <div className="aspect-square w-full">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="text-xs text-muted-foreground px-2 text-center">{title}</span>
          </div>
        )}
      </div>
      <div className="p-3 lg:p-4 bg-background">
        <p className="font-medium text-sm lg:text-base truncate" style={{ color: '#0F1F17' }}>
          {title}
        </p>
        {price != null && price > 0 && (
          <p className="text-sm lg:text-base font-semibold mt-0.5" style={{ color: accent }}>
            {formatMerchCardPrice(price)}
          </p>
        )}
      </div>
    </button>
  );
}
