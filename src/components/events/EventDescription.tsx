import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface EventDescriptionProps {
  text: string | null | undefined;
  initialWordLimit?: number;
  expandedMaxHeightMobile?: number;
}

/**
 * EventDescription - Expandable description component
 * 
 * - If no text -> render null
 * - Count words by splitting whitespace
 * - If <= limit -> render full text (no toggle)
 * - If > limit:
 *   - collapsed shows first N words + "…"
 *   - shows a small link button "Read more"
 *   - expanded shows full text + "Show less"
 * - Uses whitespace-pre-wrap to preserve line breaks
 * - When expanded on mobile, applies max-height with scroll
 */
export default function EventDescription({
  text,
  initialWordLimit = 50,
  expandedMaxHeightMobile = 240,
}: EventDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  // Helper function to process description for expand/collapse
  const processDescription = (description: string) => {
    const trimmed = description.trim();
    if (!trimmed) return { words: [], isLong: false, preview: '', full: '' };
    
    const words = trimmed.split(/\s+/);
    const isLong = words.length > initialWordLimit;
    const preview = words.slice(0, initialWordLimit).join(' ');
    
    return { words, isLong, preview, full: trimmed };
  };

  if (!text || !text.trim()) {
    return null;
  }

  const { isLong, preview, full } = processDescription(text);
  const displayText = expanded ? full : (isLong ? preview : full);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" style={{ color: '#0F1F17' }}>
        Description
      </p>
      <div 
        className={`text-sm whitespace-pre-wrap text-muted-foreground ${expanded ? 'overflow-auto md:max-h-none md:overflow-visible' : ''}`}
        style={expanded ? { 
          maxHeight: `${expandedMaxHeightMobile}px`,
        } : {}}
      >
        {displayText}
        {isLong && !expanded && '…'}
      </div>
      {isLong && (
        <Button
          variant="link"
          onClick={() => setExpanded(!expanded)}
          className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
          style={{ color: 'rgba(15,31,23,0.72)' }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </Button>
      )}
    </div>
  );
}

