import { cn } from '@/lib/utils';
import { CollabType, COLLAB_TYPE_LABELS, COLLAB_TYPE_COLORS } from '@/lib/types';
import { Package, CalendarDays, Sparkles, Coffee } from 'lucide-react';

interface CollabChipProps {
  type: CollabType;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

const COLLAB_ICONS: Record<CollabType, React.ElementType> = {
  consignment: Package,
  event: CalendarDays,
  collab_product: Sparkles,
  cup_sleeve_marketing: Coffee,
};

export function CollabChip({ type, size = 'md', showIcon = true }: CollabChipProps) {
  const Icon = COLLAB_ICONS[type];
  
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        COLLAB_TYPE_COLORS[type],
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      {showIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
      {COLLAB_TYPE_LABELS[type]}
    </span>
  );
}
