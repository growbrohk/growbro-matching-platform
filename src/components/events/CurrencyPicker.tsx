import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { STRIPE_CURRENCIES, currencyOptionLabel, normalizeCurrency } from '@/lib/currency';

interface CurrencyPickerProps {
  value: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
  id?: string;
}

export function CurrencyPicker({ value, onChange, disabled, id }: CurrencyPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = normalizeCurrency(value);

  const options = useMemo(() => {
    if (STRIPE_CURRENCIES.some((c) => c.code === selected)) return STRIPE_CURRENCIES;
    return [{ code: selected, name: 'Saved currency' }, ...STRIPE_CURRENCIES];
  }, [selected]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{currencyOptionLabel(selected)}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currencies..." />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {options.map((currency) => (
                <CommandItem
                  key={currency.code}
                  value={`${currency.code} ${currency.name}`}
                  onSelect={() => {
                    onChange(currency.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected === currency.code ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {currency.code} — {currency.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
