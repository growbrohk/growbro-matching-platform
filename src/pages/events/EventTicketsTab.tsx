import { useState } from 'react';
import { useEventTickets } from '@/hooks/use-event-tickets';
import { Loader2, CheckCircle2, XCircle, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

      {/* Table */}
      {filteredTickets.length === 0 ? (
        <Card className="rounded-3xl border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
          <CardContent className="flex flex-col items-center justify-center py-16 p-4 md:p-6">
            <h3 className="text-xl font-semibold mb-2" style={{ color: '#0F1F17' }}>
              No tickets found
            </h3>
            <p className="text-center text-muted-foreground">
              {filter === 'all' 
                ? 'No tickets have been sold for this event yet.'
                : filter === 'scanned'
                ? 'No tickets have been checked in yet.'
                : 'No pending tickets.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)' }}>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ticket Type</TableHead>
                    <TableHead>Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                      <TableCell className="font-medium">{ticket.name || '-'}</TableCell>
                      <TableCell>{ticket.phone || '-'}</TableCell>
                      <TableCell>{ticket.email || '-'}</TableCell>
                      <TableCell>{ticket.ticketType}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={ticket.remark}>
                        {ticket.remark || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
