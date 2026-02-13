import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Check } from 'lucide-react';

// MultiSelectDropdown component for filter dropdowns
export interface MultiSelectDropdownProps {
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
  selected: string[];
  setSelected: (next: string[]) => void;
  placeholder: string;
  isCategory?: boolean; // Special handling for category "All" option
}

export function MultiSelectDropdown({
  label,
  options,
  selected,
  setSelected,
  placeholder,
  isCategory = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleToggle = (value: string) => {
    if (isCategory && value === 'all') {
      // For category: selecting "All" clears all selections (empty = all)
      setSelected([]);
    } else {
      // For regular multi-select: toggle the value
      if (selected.includes(value)) {
        setSelected(selected.filter(v => v !== value));
      } else {
        setSelected([...selected, value]);
      }
    }
  };

  const handleClear = () => {
    setSelected([]);
  };

  const displayText = () => {
    if (selected.length === 0) {
      // For categories, empty means "All"
      if (isCategory) {
        const allOption = options.find(opt => opt.value === 'all');
        return allOption ? allOption.label : placeholder;
      }
      return placeholder;
    }
    if (selected.length === 1) {
      const option = options.find(opt => opt.value === selected[0]);
      return option ? option.label : placeholder;
    }
    return `${selected.length} selected`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">{label}</div>
        {selected.length > 0 && (
          <button
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between text-left font-normal"
          >
            <span className="truncate">{displayText()}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="max-h-[300px] overflow-y-auto">
            {options.map((option) => {
              // For categories, empty array means "All" is selected
              const isSelected = isCategory && option.value === 'all'
                ? selected.length === 0
                : selected.includes(option.value);
              return (
                <div
                  key={option.value}
                  className="flex items-center space-x-2 px-3 py-2 hover:bg-muted cursor-pointer"
                  onClick={() => handleToggle(option.value)}
                >
                  <div className="flex items-center justify-center w-4 h-4 border rounded border-gray-300">
                    {isSelected && <Check className="h-3 w-3 text-[#0E7A3A]" />}
                  </div>
                  <label className="text-sm cursor-pointer flex-1">
                    {option.label}
                    {option.count !== undefined && (
                      <span className="text-muted-foreground ml-1">({option.count})</span>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
