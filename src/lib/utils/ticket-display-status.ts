export type TicketDisplayStatus = 'pending' | 'checkedIn' | 'refunded';

export type TicketStatusFields = {
  status: string;
  refunded_at?: string | null;
};

export function getTicketDisplayStatus(ticket: TicketStatusFields): TicketDisplayStatus {
  if (ticket.refunded_at) return 'refunded';
  if (ticket.status === 'scanned') return 'checkedIn';
  return 'pending';
}

export function getTicketDisplayStatusLabel(status: TicketDisplayStatus): string {
  switch (status) {
    case 'checkedIn':
      return 'Checked In';
    case 'refunded':
      return 'Refunded';
    default:
      return 'Pending';
  }
}

export function getTicketDisplayStatusSearchLabel(status: TicketDisplayStatus): string {
  switch (status) {
    case 'checkedIn':
      return 'checked in';
    case 'refunded':
      return 'refunded';
    default:
      return 'pending';
  }
}

/** Sort rank: Pending (0) → Refunded (1) → Checked In (2) */
export function getTicketDisplayStatusSortRank(status: TicketDisplayStatus): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'refunded':
      return 1;
    case 'checkedIn':
      return 2;
  }
}

export type TicketStatusFilter = 'valid' | 'scanned' | 'refunded';

export function getTicketEditSelectValue(ticket: TicketStatusFields): TicketStatusFilter {
  if (ticket.refunded_at) return 'refunded';
  return ticket.status === 'scanned' ? 'scanned' : 'valid';
}
