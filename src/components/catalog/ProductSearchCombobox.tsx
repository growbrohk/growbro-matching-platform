import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getProducts } from '@/lib/api/products';

interface ProductSearchComboboxProps {
  value?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function ProductSearchCombobox({
  value,
  onValueChange,
  placeholder = 'All products',
  className,
}: ProductSearchComboboxProps) {
  const { currentOrg } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['product-search-combobox', currentOrg?.id],
    queryFn: () => getProducts(currentOrg!.id),
    enabled: !!currentOrg && open,
  });

  const filteredProducts = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.title.toLowerCase().includes(q));
  }, [products, searchQuery]);

  const selectedProduct = React.useMemo(() => {
    if (!value) return null;
    return products.find((p) => p.id === value) ?? null;
  }, [value, products]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-8 justify-between min-w-[140px] max-w-[220px]', className)}
        >
          <span className="truncate text-xs">
            {selectedProduct ? selectedProduct.title : placeholder}
          </span>
          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            {value && (
              <span
                role="button"
                tabIndex={0}
                className="rounded-sm p-0.5 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  onValueChange(undefined);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    onValueChange(undefined);
                  }
                }}
                aria-label="Clear product filter"
              >
                <X className="h-3 w-3 opacity-50" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search products..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <>
                <CommandEmpty>No products found.</CommandEmpty>
                <CommandGroup>
                  {filteredProducts.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={product.id}
                      onSelect={() => {
                        onValueChange(product.id === value ? undefined : product.id);
                        setOpen(false);
                        setSearchQuery('');
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === product.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="truncate">{product.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
