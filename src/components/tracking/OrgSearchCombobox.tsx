import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface Org {
  id: string;
  name: string;
  slug?: string;
}

interface OrgSearchComboboxProps {
  value?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder?: string;
  excludeOrgId?: string; // Exclude current org from results
}

export function OrgSearchCombobox({
  value,
  onValueChange,
  placeholder = 'Search organizations...',
  excludeOrgId,
}: OrgSearchComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Fetch orgs with search
  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['search-orgs', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('orgs')
        .select('id, name, slug')
        .order('name', { ascending: true })
        .limit(50);

      // If search query provided, filter by name
      if (searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }

      // Exclude current org if provided
      if (excludeOrgId) {
        query = query.neq('id', excludeOrgId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching orgs:', error);
        return [];
      }

      return (data || []) as Org[];
    },
    enabled: open, // Only fetch when popover is open
  });

  const selectedOrg = React.useMemo(() => {
    if (!value) return null;
    return orgs.find((org) => org.id === value);
  }, [value, orgs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedOrg ? selectedOrg.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search organizations..."
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
                <CommandEmpty>No organizations found.</CommandEmpty>
                <CommandGroup>
                  {orgs.map((org) => (
                    <CommandItem
                      key={org.id}
                      value={org.id}
                      onSelect={() => {
                        onValueChange(org.id === value ? undefined : org.id);
                        setOpen(false);
                        setSearchQuery('');
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === org.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {org.name}
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
