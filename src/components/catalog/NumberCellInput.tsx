import { useState } from 'react';
import { Input } from '@/components/ui/input';

export interface NumberCellInputProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  className?: string;
}

/**
 * Number cell that keeps the typed text while focused.
 * A cleared field stays empty on screen and commits 0. On blur the box
 * shows the stored number, so a typed "07" becomes "7".
 */
export function NumberCellInput({
  value,
  onValueChange,
  min,
  max,
  step,
  onFocus,
  onClick,
  className,
}: NumberCellInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    if (raw.trim() === '') {
      onValueChange(0);
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onValueChange(next);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        commit(raw);
      }}
      onBlur={() => setDraft(null)}
      onFocus={onFocus}
      onClick={onClick}
      className={className}
    />
  );
}
