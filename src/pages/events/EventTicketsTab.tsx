import { useState, useMemo } from 'react';
import { useEventTickets } from '@/hooks/use-event-tickets';
import { Loader2, Search, Filter, Settings, Pencil, Camera } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const isCheckedIn = (status: string) => status === 'scanned';

export function EventTicketsTab({ eventId }: { eventId: string }) {
  const { data: tickets, isLoading, refetch } = useEventTickets(eventId);
  const [query, setQuery] = useState('');

  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    if (!query.trim()) return tickets;

    const searchLower = query.toLowerCase();
    return tickets.filter((ticket) => {
      // Search across name, phone, email, ticketType, remark
      const matchesName = ticket.name?.toLowerCase().includes(searchLower) || false;
      const matchesPhone = ticket.phone?.toLowerCase().includes(searchLower) || false;
      const matchesEmail = ticket.email?.toLowerCase().includes(searchLower) || false;
      const matchesTicketType = ticket.ticketType?.toLowerCase().includes(searchLower) || false;
      const matchesRemark = ticket.remark?.toLowerCase().includes(searchLower) || false;
      
      // Search status label
      const statusLabel = isCheckedIn(ticket.status) ? 'checked in' : 'pending';
      const matchesStatus = statusLabel.includes(searchLower);

      return matchesName || matchesPhone || matchesEmail || matchesTicketType || matchesRemark || matchesStatus;
    });
  }, [tickets, query]);

  const getStatusText = (status: string) => {
    if (isCheckedIn(status)) {
      return <span className="text-green-700">Checked In</span>;
    }
    return <span className="text-muted-foreground">Pending</span>;
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
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Filter tickets"
            title="Filter tickets"
          >
            <Filter className="h-4 w-4" />
          </Button>
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
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0">
                  Status
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0">
                  Name
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0">
                  Phone
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0">
                  Email
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground last:border-r-0">
                  Ticket Type
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
