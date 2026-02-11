import { useState, useMemo } from 'react';
import { useEventTickets } from '@/hooks/use-event-tickets';
import { Loader2, Search, Filter, Settings, Pencil, Camera, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const isCheckedIn = (status: string) => status === 'scanned';

type SortKey = 'status' | 'name' | 'ticketType';

export function EventTicketsTab({ eventId }: { eventId: string }) {
  const { data: tickets, isLoading, refetch } = useEventTickets(eventId);
  const [query, setQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Array<'valid' | 'scanned'>>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  // Get unique ticket types for filter options
  const uniqueTicketTypes = useMemo(() => {
    if (!tickets) return [];
    const types = new Set(tickets.map(t => t.ticketType).filter(Boolean));
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (!tickets) return [];

    // Step 1: Apply search
    let result = tickets;
    if (query.trim()) {
      const searchLower = query.toLowerCase();
      result = tickets.filter((ticket) => {
        const matchesName = ticket.name?.toLowerCase().includes(searchLower) || false;
        const matchesPhone = ticket.phone?.toLowerCase().includes(searchLower) || false;
        const matchesEmail = ticket.email?.toLowerCase().includes(searchLower) || false;
        const matchesTicketType = ticket.ticketType?.toLowerCase().includes(searchLower) || false;
        const matchesRemark = ticket.remark?.toLowerCase().includes(searchLower) || false;
        const statusLabel = isCheckedIn(ticket.status) ? 'checked in' : 'pending';
        const matchesStatus = statusLabel.includes(searchLower);
        return matchesName || matchesPhone || matchesEmail || matchesTicketType || matchesRemark || matchesStatus;
      });
    }

    // Step 2: Apply status filter
    if (selectedStatuses.length > 0) {
      result = result.filter(ticket => selectedStatuses.includes(ticket.status as 'valid' | 'scanned'));
    }

    // Step 3: Apply ticket type filter
    if (selectedTypes.length > 0) {
      result = result.filter(ticket => selectedTypes.includes(ticket.ticketType));
    }

    // Step 4: Apply sorting
    if (sort) {
      result = [...result].sort((a, b) => {
        let comparison = 0;

        if (sort.key === 'status') {
          // Asc: Pending (valid) first, then Checked In (scanned)
          // Desc: reverse
          const aStatus = a.status === 'scanned' ? 1 : 0;
          const bStatus = b.status === 'scanned' ? 1 : 0;
          comparison = aStatus - bStatus;
          // Tie-breaker: Name asc
          if (comparison === 0) {
            const aName = (a.name || '').toLowerCase();
            const bName = (b.name || '').toLowerCase();
            comparison = aName.localeCompare(bName);
          }
        } else if (sort.key === 'name') {
          const aName = (a.name || '').toLowerCase();
          const bName = (b.name || '').toLowerCase();
          comparison = aName.localeCompare(bName);
        } else if (sort.key === 'ticketType') {
          const aType = (a.ticketType || '').toLowerCase();
          const bType = (b.ticketType || '').toLowerCase();
          comparison = aType.localeCompare(bType);
          // Tie-breaker: Name asc
          if (comparison === 0) {
            const aName = (a.name || '').toLowerCase();
            const bName = (b.name || '').toLowerCase();
            comparison = aName.localeCompare(bName);
          }
        }

        return sort.dir === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [tickets, query, selectedStatuses, selectedTypes, sort]);

  const getStatusText = (status: string) => {
    if (isCheckedIn(status)) {
      return <span className="text-green-700">Checked In</span>;
    }
    return <span className="text-muted-foreground">Pending</span>;
  };

  const handleSort = (key: SortKey) => {
    setSort(prev => {
      if (prev?.key === key) {
        // Toggle direction
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      // New column, start with asc
      return { key, dir: 'asc' };
    });
  };

  const hasActiveFilters = selectedStatuses.length > 0 || selectedTypes.length > 0;

  const handleClearFilters = () => {
    setSelectedStatuses([]);
    setSelectedTypes([]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Filter + Settings + Edit + Scan */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 relative"
                aria-label="Filter tickets"
                title="Filter tickets"
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilters && (
                  <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-0" align="end">
              <div className="p-4 space-y-4">
                {/* Row 1: Status */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Status</div>
                  <div className="space-y-2">
                    <div
                      className="flex items-center space-x-2 cursor-pointer"
                      onClick={() => {
                        setSelectedStatuses(prev =>
                          prev.includes('valid')
                            ? prev.filter(s => s !== 'valid')
                            : [...prev, 'valid']
                        );
                      }}
                    >
                      <Checkbox checked={selectedStatuses.includes('valid')} />
                      <label className="text-sm cursor-pointer">Pending</label>
                    </div>
                    <div
                      className="flex items-center space-x-2 cursor-pointer"
                      onClick={() => {
                        setSelectedStatuses(prev =>
                          prev.includes('scanned')
                            ? prev.filter(s => s !== 'scanned')
                            : [...prev, 'scanned']
                        );
                      }}
                    >
                      <Checkbox checked={selectedStatuses.includes('scanned')} />
                      <label className="text-sm cursor-pointer">Checked In</label>
                    </div>
                  </div>
                </div>

                {/* Row 2: Ticket Type */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Ticket Type</div>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {uniqueTicketTypes.map(type => (
                      <div
                        key={type}
                        className="flex items-center space-x-2 cursor-pointer"
                        onClick={() => {
                          setSelectedTypes(prev =>
                            prev.includes(type)
                              ? prev.filter(t => t !== type)
                              : [...prev, type]
                          );
                        }}
                      >
                        <Checkbox checked={selectedTypes.includes(type)} />
                        <label className="text-sm cursor-pointer">{type}</label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer: Clear button */}
                {hasActiveFilters && (
                  <div className="pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearFilters}
                      className="w-full h-8 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Edit"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Scan"
            title="Scan"
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tickets count */}
      {tickets && tickets.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {filteredTickets.length === tickets.length
            ? `${filteredTickets.length} ${filteredTickets.length === 1 ? 'ticket' : 'tickets'}`
            : `${filteredTickets.length} / ${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'}`}
        </div>
      )}

      {/* Sheet-like table or empty state */}
      {filteredTickets.length === 0 ? (
        <div className="w-full border border-border bg-background py-8 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            {!tickets || tickets.length === 0
              ? 'No tickets have been sold for this event yet.'
              : `No results for '${query}'`}
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead
                  className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0 cursor-pointer select-none"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sort?.key === 'status' && (
                      sort.dir === 'asc' ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    )}
                  </div>
                </TableHead>
                <TableHead
                  className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0 cursor-pointer select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name
                    {sort?.key === 'name' && (
                      sort.dir === 'asc' ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    )}
                  </div>
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0">
                  Phone
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0">
                  Email
                </TableHead>
                <TableHead
                  className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0 cursor-pointer select-none"
                  onClick={() => handleSort('ticketType')}
                >
                  <div className="flex items-center gap-1">
                    Ticket Type
                    {sort?.key === 'ticketType' && (
                      sort.dir === 'asc' ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    )}
                  </div>
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0">
                  Remark
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map((ticket) => (
                <TableRow key={ticket.id} className="border-b border-border">
                  <TableCell className="border-r border-border px-2 py-1.5 text-sm last:border-r-0">
                    {getStatusText(ticket.status)}
                  </TableCell>
                  <TableCell
                    className="max-w-[140px] truncate border-r border-border px-2 py-1.5 text-sm font-medium last:border-r-0"
                    title={ticket.name ?? undefined}
                  >
                    {ticket.name || '-'}
                  </TableCell>
                  <TableCell className="border-r border-border px-2 py-1.5 text-sm last:border-r-0">
                    {ticket.phone || '-'}
                  </TableCell>
                  <TableCell
                    className="max-w-[180px] truncate border-r border-border px-2 py-1.5 text-sm last:border-r-0"
                    title={ticket.email ?? undefined}
                  >
                    {ticket.email || '-'}
                  </TableCell>
                  <TableCell className="border-r border-border px-2 py-1.5 text-sm last:border-r-0">
                    {ticket.ticketType}
                  </TableCell>
                  <TableCell
                    className="max-w-[200px] truncate border-r border-border px-2 py-1.5 text-sm last:border-r-0"
                    title={ticket.remark ?? undefined}
                  >
                    {ticket.remark || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
