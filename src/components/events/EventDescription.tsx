import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface EventDescriptionProps {
  text: string | null | undefined;
  collapsedMaxHeight?: number;
}

/**
 * EventDescription - Expandable description component
 *
 * - If no text -> render null
 * - Collapsed (default): Full text in scrollable box with max-height, "Show more" button
 * - Expanded: Full text without height constraint, "Show less" button
 * - Uses whitespace-pre-wrap to preserve line breaks
 * - Custom scrollbar styling for visibility
 */
export default function EventDescription({
  text,
  collapsedMaxHeight = 240,
}: EventDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!text || !text.trim()) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
        Description
      </p>
      <div
        className={`event-description-scroll text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground ${
          expanded ? 'overflow-visible' : 'overflow-auto'
        }`}
        style={expanded ? {} : { maxHeight: `${collapsedMaxHeight}px` }}
      >
        {text.trim()}
      </div>
      <Button
        variant="link"
        onClick={() => setExpanded(!expanded)}
        className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
        style={{ color: 'rgba(15,31,23,0.72)' }}
      >
        {expanded ? 'Show less' : 'Show more'}
      </Button>
    </div>
  );
}
