import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface VariantValueOrderListProps {
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** When true, show edit/remove affordances per row (ProductForm). */
  editable?: boolean;
  onEditValue?: (index: number, currentValue: string) => void;
  onRemoveValue?: (index: number) => void;
}

export function VariantValueOrderList({
  values,
  onChange,
  disabled = false,
  editable = false,
  onEditValue,
  onRemoveValue,
}: VariantValueOrderListProps) {
  const moveUp = (index: number) => {
    if (index <= 0 || disabled) return;
    const next = [...values];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index >= values.length - 1 || disabled) return;
    const next = [...values];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  if (values.length === 0) {
    return <p className="text-sm text-muted-foreground">No values found.</p>;
  }

  return (
    <div className="space-y-2">
      {values.map((val, idx) => (
        <div
          key={`${val}-${idx}`}
          className="flex items-center justify-between gap-2 p-2 rounded-lg border"
          style={{ borderColor: 'rgba(14,122,58,0.14)' }}
        >
          <span
            className={`text-sm font-medium truncate ${editable ? 'cursor-pointer hover:underline' : ''}`}
            style={{ color: '#0F1F17' }}
            onClick={editable && onEditValue ? () => onEditValue(idx, val) : undefined}
            onKeyDown={
              editable && onEditValue
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onEditValue(idx, val);
                    }
                  }
                : undefined
            }
            role={editable && onEditValue ? 'button' : undefined}
            tabIndex={editable && onEditValue ? 0 : undefined}
          >
            {val}
          </span>
          <div className="flex gap-1 shrink-0 items-center">
            {editable && onRemoveValue && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-destructive hover:text-destructive"
                onClick={() => onRemoveValue(idx)}
                disabled={disabled}
                title="Remove"
              >
                Remove
              </Button>
            )}
            {values.length > 1 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveUp(idx)}
                  disabled={disabled || idx === 0}
                  title="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveDown(idx)}
                  disabled={disabled || idx === values.length - 1}
                  title="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
