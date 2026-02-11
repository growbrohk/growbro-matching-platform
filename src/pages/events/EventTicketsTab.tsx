import { useState } from 'react';
import { useEventTickets } from '@/hooks/use-event-tickets';
import { Loader2, CheckCircle2, XCircle, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type FilterType = 'all' | 'scanned' | 'valid';

const isCheckedIn = (status: string) => status === 'scanned';

export function EventTicketsTab({ eventId }: { eventId: string }) {
  const { data: tickets, isLoading, refetch } = useEventTickets(eventId);
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredTickets = tickets?.filter((ticket) => {
    if (filter === 'all') return true;
    if (filter === 'scanned') return isCheckedIn(ticket.status);
    if (filter === 'valid') return ticket.status === 'valid';
    return true;
  }) || [];

  const getStatusBadge = (status: string) => {
    if (isCheckedIn(status)) {
      return (
        <Badge className="bg-green-100 text-green-700">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Checked In
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <XCircle className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
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
      {/* Filter */}
      <div className="flex items-center gap-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filter} onValueChange={(value) => setFilter(value as FilterType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickets</SelectItem>
            <SelectItem value="scanned">Checked In</SelectItem>
            <SelectItem value="valid">Pending</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          {filteredTickets.length} {filteredTickets.length === 1 ? 'ticket' : 'tickets'}
        </div>
      </div>

      {/* Sheet-like table or empty state */}
      {filteredTickets.length === 0 ? (
        <div className="w-full rounded-md border border-border bg-background py-8 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            {filter === 'all'
              ? 'No tickets have been sold for this event yet.'
              : filter === 'scanned'
              ? 'No tickets have been checked in yet.'
              : 'No pending tickets.'}
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background py-2 px-3 text-xs font-medium text-muted-foreground last:border-r-0">
                  Status
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background py-2 px-3 text-xs font-medium text-muted-foreground last:border-r-0">
                  Name
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background py-2 px-3 text-xs font-medium text-muted-foreground last:border-r-0">
                  Phone
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background py-2 px-3 text-xs font-medium text-muted-foreground last:border-r-0">
                  Email
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background py-2 px-3 text-xs font-medium text-muted-foreground last:border-r-0">
                  Ticket Type
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-auto border-r border-border bg-background py-2 px-3 text-xs font-medium text-muted-foreground last:border-r-0">
                  Remark
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map((ticket) => (
                <TableRow key={ticket.id} className="border-b border-border">
                  <TableCell className="border-r border-border py-2 px-3 last:border-r-0">
                    {getStatusBadge(ticket.status)}
                  </TableCell>
                  <TableCell
                    className="max-w-[140px] truncate border-r border-border py-2 px-3 font-medium last:border-r-0"
                    title={ticket.name ?? undefined}
                  >
                    {ticket.name || '-'}
                  </TableCell>
                  <TableCell className="border-r border-border py-2 px-3 last:border-r-0">
                    {ticket.phone || '-'}
                  </TableCell>
                  <TableCell
                    className="max-w-[180px] truncate border-r border-border py-2 px-3 last:border-r-0"
                    title={ticket.email ?? undefined}
                  >
                    {ticket.email || '-'}
                  </TableCell>
                  <TableCell className="border-r border-border py-2 px-3 last:border-r-0">
                    {ticket.ticketType}
                  </TableCell>
                  <TableCell
                    className="max-w-[200px] truncate border-r border-border py-2 px-3 last:border-r-0"
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
