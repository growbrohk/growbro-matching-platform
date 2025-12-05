import { VenueOptionType, VENUE_OPTION_TYPE_LABELS, VENUE_OPTION_TYPE_COLORS } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Calendar, Layers, Image, Square, MoreHorizontal } from 'lucide-react';

interface VenueOptionChipProps {
  type: VenueOptionType;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

const TYPE_ICONS: Record<VenueOptionType, React.ComponentType<{ className?: string }>> = {
  event_slot: Calendar,
  shelf_space: Layers,
  exhibition_period: Image,
  wall_space: Square,
  other: MoreHorizontal,
};

export function VenueOptionChip({ type, size = 'md', showIcon = true }: VenueOptionChipProps) {
  const Icon = TYPE_ICONS[type];
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        VENUE_OPTION_TYPE_COLORS[type],
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      {showIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
      {VENUE_OPTION_TYPE_LABELS[type]}
    </span>
  );
}
