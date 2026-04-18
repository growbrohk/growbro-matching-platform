import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useEventTickets } from '@/hooks/use-event-tickets';
import { Loader2, Search, Filter, Settings, Pencil, ChevronUp, ChevronDown, Save, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { EventTicketRow } from '@/hooks/use-event-tickets';
import { formatMoney } from '@/hooks/useOrdersDashboard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const isCheckedIn = (status: string) => status === 'scanned';

type SortKey = 'status' | 'name' | 'ticketType' | 'ticketPrice';
type ColumnKey = 'status' | 'name' | 'phone' | 'email' | 'ticketType' | 'ticketPrice' | 'access' | 'remark' | 'addons';

const DEFAULT_COLUMNS: ColumnKey[] = ['status', 'name', 'phone', 'email', 'ticketType', 'ticketPrice', 'access', 'remark', 'addons'];
const EDIT_MODE_COLUMN_ORDER: ColumnKey[] = ['status', 'name', 'remark', 'phone', 'email', 'ticketType', 'ticketPrice', 'access', 'addons'];

const DEFAULT_COLUMN_SIZES: Record<ColumnKey, number> = {
  status: 90,
  name: 130,
  phone: 120,
  email: 180,
  ticketType: 120,
  ticketPrice: 110,
  access: 150,
  remark: 160,
  addons: 240,
};

const KNOWN_COLUMN_KEYS: ColumnKey[] = [...DEFAULT_COLUMNS];

function migrateLegacyColumnId(key: string): ColumnKey | null {
  if (key === 'orderAmount') return 'ticketPrice';
  return KNOWN_COLUMN_KEYS.includes(key as ColumnKey) ? (key as ColumnKey) : null;
}

function normalizeStoredVisibleColumns(raw: string[]): ColumnKey[] {
  const out: ColumnKey[] = [];
  for (const k of raw) {
    const col = migrateLegacyColumnId(k);
    if (col && !out.includes(col)) out.push(col);
  }
  return out;
}

function isSortKey(key: string): key is SortKey {
  return key === 'status' || key === 'name' || key === 'ticketType' || key === 'ticketPrice';
}

type Draft = { status?: 'valid' | 'scanned'; name?: string; remark?: string };

type DefaultSortOption = {
  label: string;
  value: string;
  sort: { id: string; desc: boolean };
};

const DEFAULT_SORT_OPTIONS: DefaultSortOption[] = [
  { label: 'Name (A–Z)', value: 'name-asc', sort: { id: 'name', desc: false } },
  { label: 'Status (Pending first)', value: 'status-asc', sort: { id: 'status', desc: false } },
  { label: 'Ticket Type (A–Z)', value: 'ticketType-asc', sort: { id: 'ticketType', desc: false } },
];

const columnHelper = createColumnHelper<EventTicketRow>();

export function EventTicketsTab({ eventId }: { eventId: string }) {
  const { data: tickets, isLoading, refetch } = useEventTickets(eventId);
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Array<'valid' | 'scanned'>>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [defaultSort, setDefaultSort] = useState<string>('name-asc');
  const [rememberPrefs, setRememberPrefs] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftById, setDraftById] = useState<Record<string, Draft>>({});

  // localStorage keys (memoized to avoid re-creation)
  const storageKeys = useMemo(() => ({
    remember: `tickets:${eventId}:remember`,
    visibleColumns: `tickets:${eventId}:visibleColumns`,
    selectedStatuses: `tickets:${eventId}:selectedStatuses`,
    selectedTypes: `tickets:${eventId}:selectedTypes`,
    sort: `tickets:${eventId}:sort`,
    defaultSort: `tickets:${eventId}:defaultSort`,
    columnSizing: `tickets:${eventId}:columnSizing`,
  }), [eventId]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const storedRemember = localStorage.getItem(storageKeys.remember);
    const shouldRemember = storedRemember === 'true';
    let restoredSort = false;

    if (shouldRemember) {
      // Restore visible columns
      const storedColumns = localStorage.getItem(storageKeys.visibleColumns);
      if (storedColumns) {
        try {
          const parsed = JSON.parse(storedColumns) as string[];
          const normalized = normalizeStoredVisibleColumns(parsed);
          if (normalized.length > 0) {
            setVisibleColumns(normalized);
          }
        } catch (e) {
          // Invalid JSON, use defaults
        }
      }

      // Restore column sizing
      const storedSizing = localStorage.getItem(storageKeys.columnSizing);
      if (storedSizing) {
        try {
          const parsed = JSON.parse(storedSizing) as ColumnSizingState & { orderAmount?: number };
          if (Object.keys(parsed).length > 0) {
            const migrated: ColumnSizingState = { ...parsed };
            if (migrated.orderAmount !== undefined && migrated.ticketPrice === undefined) {
              migrated.ticketPrice = migrated.orderAmount;
            }
            delete (migrated as Record<string, unknown>).orderAmount;
            setColumnSizing(migrated);
          }
        } catch (e) {
          // Invalid JSON, use defaults
        }
      }

      // Restore filters
      const storedStatuses = localStorage.getItem(storageKeys.selectedStatuses);
      if (storedStatuses) {
        try {
          const parsed = JSON.parse(storedStatuses) as Array<'valid' | 'scanned'>;
          setSelectedStatuses(parsed);
        } catch (e) {
          // Invalid JSON
        }
      }

      const storedTypes = localStorage.getItem(storageKeys.selectedTypes);
      if (storedTypes) {
        try {
          const parsed = JSON.parse(storedTypes) as string[];
          setSelectedTypes(parsed);
        } catch (e) {
          // Invalid JSON
        }
      }

      // Restore sort
      const storedSort = localStorage.getItem(storageKeys.sort);
      if (storedSort) {
        try {
          const parsed = JSON.parse(storedSort) as { key: string; dir: 'asc' | 'desc' };
          const sortKey = parsed.key === 'orderAmount' ? 'ticketPrice' : parsed.key;
          if (isSortKey(sortKey)) {
            setSorting([{ id: sortKey, desc: parsed.dir === 'desc' }]);
            restoredSort = true;
          }
        } catch (e) {
          // Invalid JSON
        }
      }

      // Restore default sort
      const storedDefaultSort = localStorage.getItem(storageKeys.defaultSort);
      if (storedDefaultSort) {
        setDefaultSort(storedDefaultSort);
      }
    }

    setRememberPrefs(shouldRemember);

    // Apply default sort only if we didn't restore a sort from localStorage
    if (!restoredSort) {
      const currentDefaultSort = shouldRemember
        ? localStorage.getItem(storageKeys.defaultSort) || defaultSort
        : defaultSort;
      const option = DEFAULT_SORT_OPTIONS.find(opt => opt.value === currentDefaultSort);
      if (option) {
        setSorting([option.sort]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Persist preferences to localStorage when rememberPrefs is true
  useEffect(() => {
    if (rememberPrefs) {
      localStorage.setItem(storageKeys.remember, 'true');
      localStorage.setItem(storageKeys.visibleColumns, JSON.stringify(visibleColumns));
      localStorage.setItem(storageKeys.selectedStatuses, JSON.stringify(selectedStatuses));
      localStorage.setItem(storageKeys.selectedTypes, JSON.stringify(selectedTypes));
      localStorage.setItem(storageKeys.sort, JSON.stringify(
        sorting[0] ? { key: sorting[0].id as SortKey, dir: sorting[0].desc ? 'desc' : 'asc' } : null
      ));
      localStorage.setItem(storageKeys.defaultSort, defaultSort);
      localStorage.setItem(storageKeys.columnSizing, JSON.stringify(columnSizing));
    } else {
      // Clear all stored preferences
      localStorage.removeItem(storageKeys.remember);
      localStorage.removeItem(storageKeys.visibleColumns);
      localStorage.removeItem(storageKeys.selectedStatuses);
      localStorage.removeItem(storageKeys.selectedTypes);
      localStorage.removeItem(storageKeys.sort);
      localStorage.removeItem(storageKeys.defaultSort);
      localStorage.removeItem(storageKeys.columnSizing);
    }
  }, [rememberPrefs, visibleColumns, selectedStatuses, selectedTypes, sorting, defaultSort, columnSizing, storageKeys]);

  // Helper functions for edit mode
  const getFullName = useCallback((ticket: EventTicketRow): string => {
    return ticket.name?.trim() || '-';
  }, []);

  const hasChanges = useCallback((ticket: EventTicketRow): boolean => {
    const draft = draftById[ticket.id];
    if (!draft) return false;

    const originalStatus = ticket.status as 'valid' | 'scanned';
    const originalName = (ticket.name?.trim() || '-');
    const originalRemark = ticket.remark || '';

    const normalizeName = (name: string) => (name.trim() || '-');
    const normalizeRemark = (remark: string) => (remark || '');

    return (
      (draft.status !== undefined && draft.status !== originalStatus) ||
      (draft.name !== undefined && normalizeName(draft.name) !== normalizeName(originalName)) ||
      (draft.remark !== undefined && normalizeRemark(draft.remark) !== normalizeRemark(originalRemark))
    );
  }, [draftById]);

  const editedCount = useMemo(() => {
    if (!tickets) return 0;
    return tickets.filter(hasChanges).length;
  }, [tickets, hasChanges]);

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
        const matchesAddons = ticket.addons?.toLowerCase().includes(searchLower) || false;
        const matchesAccess = ticket.accessLabel?.toLowerCase().includes(searchLower) || false;
        const matchesAccessTooltip = ticket.accessTooltip?.toLowerCase().includes(searchLower) || false;
        const statusLabel = isCheckedIn(ticket.status) ? 'checked in' : 'pending';
        const matchesStatus = statusLabel.includes(searchLower);
        const matchesTicketPrice =
          String(ticket.ticketUnitPrice).toLowerCase().includes(searchLower) ||
          formatMoney(ticket.ticketUnitPrice).toLowerCase().includes(searchLower);
        return matchesName || matchesPhone || matchesEmail || matchesTicketType || matchesRemark || matchesAddons || matchesAccess || matchesAccessTooltip || matchesStatus || matchesTicketPrice;
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

    return result;
  }, [tickets, query, selectedStatuses, selectedTypes]);

  const getStatusText = (status: string) => {
    if (isCheckedIn(status)) {
      return <span className="text-green-700">Checked In</span>;
    }
    return <span className="text-muted-foreground">Pending</span>;
  };

  const hasActiveFilters = selectedStatuses.length > 0 || selectedTypes.length > 0;

  const handleClearFilters = () => {
    setSelectedStatuses([]);
    setSelectedTypes([]);
  };

  const handleToggleColumn = (column: ColumnKey) => {
    setVisibleColumns(prev => {
      if (prev.includes(column)) {
        if (prev.length === 1) return prev;
        return prev.filter(c => c !== column);
      }
      return [...prev, column];
    });
  };

  const handleDefaultSortChange = (value: string) => {
    setDefaultSort(value);
    const option = DEFAULT_SORT_OPTIONS.find(opt => opt.value === value);
    if (option) {
      setSorting([option.sort]);
    }
  };

  const handleEnterEditMode = () => {
    setEditMode(true);
    setDraftById({});
  };

  const handleCancelEdit = () => {
    setDraftById({});
    setEditMode(false);
  };

  const handleSave = async () => {
    if (editedCount === 0 || saving) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      if (!tickets) {
        throw new Error('No tickets available');
      }

      const updates = tickets
        .filter(hasChanges)
        .map(ticket => {
          const draft = draftById[ticket.id];
          if (!draft) return null;

          const payload: any = {};
          const originalStatus = ticket.status as 'valid' | 'scanned';
          const originalName = getFullName(ticket);
          const normalizedOriginalName = originalName === '-' ? '' : originalName;
          const originalRemark = ticket.remark || '';

          if (draft.name !== undefined) {
            const normalizedDraftName = draft.name.trim();
            if (normalizedDraftName !== normalizedOriginalName) {
              if (normalizedDraftName) {
                const nameParts = normalizedDraftName.split(/\s+/);
                if (nameParts.length === 1) {
                  payload.first_name = nameParts[0];
                  payload.last_name = null;
                } else {
                  payload.first_name = nameParts[0];
                  payload.last_name = nameParts.slice(1).join(' ');
                }
              } else {
                payload.first_name = null;
                payload.last_name = null;
              }
            }
          }

          if (draft.remark !== undefined && draft.remark !== originalRemark) {
            payload.remark = draft.remark || null;
          }

          if (draft.status !== undefined && draft.status !== originalStatus) {
            if (draft.status === 'scanned') {
              payload.status = 'scanned';
              payload.scanned_at = new Date().toISOString();
              payload.scanned_by = userId;
            } else if (draft.status === 'valid') {
              payload.status = 'valid';
              payload.scanned_at = null;
              payload.scanned_by = null;
            }
          }

          return { id: ticket.id, payload };
        })
        .filter((u): u is { id: string; payload: any } => u !== null);

      const results = await Promise.all(
        updates.map(u => supabase.from('tickets').update(u.payload).eq('id', u.id))
      );

      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Failed to save ${errors.length} ticket(s)`);
      }

      toast({
        title: 'Success',
        description: `Saved ${editedCount} ticket(s)`,
      });

      setDraftById({});
      setEditMode(false);
      await refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save tickets',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredTickets.length === 0) return;

    const columnOrder: ColumnKey[] = ['status', 'name', 'phone', 'email', 'ticketType', 'ticketPrice', 'access', 'remark', 'addons'];
    const columnLabels: Record<ColumnKey, string> = {
      status: 'Status',
      name: 'Name',
      phone: 'Phone',
      email: 'Email',
      ticketType: 'Ticket Type',
      ticketPrice: 'Ticket price',
      access: 'Access',
      remark: 'Remark',
      addons: 'Add-ons',
    };

    const visibleOrderedColumns = columnOrder.filter(col => visibleColumns.includes(col));

    const escapeCSV = (value: string | null | undefined): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = visibleOrderedColumns.map(col => columnLabels[col]);
    const rows = filteredTickets.map(ticket => {
      return visibleOrderedColumns.map(col => {
        if (col === 'status') {
          return escapeCSV(isCheckedIn(ticket.status) ? 'Checked In' : 'Pending');
        }
        if (col === 'addons') {
          return escapeCSV(ticket.addons || '');
        }
        if (col === 'access') {
          return escapeCSV(ticket.accessLabel || '');
        }
        if (col === 'ticketPrice') {
          return escapeCSV(formatMoney(ticket.ticketUnitPrice));
        }
        return escapeCSV(ticket[col as keyof EventTicketRow] as string || '');
      });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `event-tickets-${eventId}-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Column definitions - use meta for reactive data to avoid recreating columns on every keystroke
  const columns = useMemo(() => [
    columnHelper.accessor('status', {
      id: 'status',
      header: 'Status',
      cell: ({ row, table }) => {
        const ticket = row.original;
        const meta = table.options.meta as { draftById: Record<string, Draft>; editMode: boolean } | undefined;
        if (meta?.editMode) {
          const draftStatus = meta.draftById[ticket.id]?.status ?? (ticket.status as 'valid' | 'scanned');
          return (
            <Select
              value={draftStatus}
              onValueChange={(value: 'valid' | 'scanned') => {
                setDraftById(prev => ({
                  ...prev,
                  [ticket.id]: { ...prev[ticket.id], status: value },
                }));
              }}
            >
              <SelectTrigger className="h-8 px-2 text-sm rounded-none border-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="valid">Pending</SelectItem>
                <SelectItem value="scanned">Checked In</SelectItem>
              </SelectContent>
            </Select>
          );
        }
        return getStatusText(ticket.status);
      },
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const aStatus = rowA.original.status === 'scanned' ? 1 : 0;
        const bStatus = rowB.original.status === 'scanned' ? 1 : 0;
        if (aStatus !== bStatus) return aStatus - bStatus;
        const aName = (rowA.original.name || '').toLowerCase();
        const bName = (rowB.original.name || '').toLowerCase();
        return aName.localeCompare(bName);
      },
      size: DEFAULT_COLUMN_SIZES.status,
      minSize: 60,
      maxSize: 200,
      enableResizing: true,
    }),
    columnHelper.accessor('name', {
      id: 'name',
      header: 'Name',
      cell: ({ row, table }) => {
        const ticket = row.original;
        const meta = table.options.meta as { draftById: Record<string, Draft>; editMode: boolean } | undefined;
        if (meta?.editMode) {
          const draftName = meta.draftById[ticket.id]?.name ?? (ticket.name?.trim() || '-');
          return (
            <Input
              value={draftName === '-' ? '' : draftName}
              onChange={(e) => {
                setDraftById(prev => ({
                  ...prev,
                  [ticket.id]: { ...prev[ticket.id], name: e.target.value },
                }));
              }}
              className="h-8 px-2 text-sm rounded-none border-0 shadow-none font-medium whitespace-nowrap w-auto min-w-0"
              placeholder="-"
              style={{ textOverflow: 'clip', overflow: 'visible' }}
            />
          );
        }
        return (
          <span className="font-medium whitespace-nowrap" title={ticket.name ?? undefined}>
            {ticket.name?.trim() || '-'}
          </span>
        );
      },
      enableSorting: true,
      size: DEFAULT_COLUMN_SIZES.name,
      minSize: 80,
      maxSize: 300,
      enableResizing: true,
    }),
    columnHelper.accessor('phone', {
      id: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.original.phone || '-',
      size: DEFAULT_COLUMN_SIZES.phone,
      minSize: 80,
      maxSize: 200,
      enableResizing: true,
    }),
    columnHelper.accessor('email', {
      id: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="max-w-full truncate block" title={row.original.email ?? undefined}>
          {row.original.email || '-'}
        </span>
      ),
      size: DEFAULT_COLUMN_SIZES.email,
      minSize: 100,
      maxSize: 350,
      enableResizing: true,
    }),
    columnHelper.accessor('ticketType', {
      id: 'ticketType',
      header: 'Ticket Type',
      cell: ({ row }) => row.original.ticketType || '-',
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const aType = (rowA.original.ticketType || '').toLowerCase();
        const bType = (rowB.original.ticketType || '').toLowerCase();
        const cmp = aType.localeCompare(bType);
        if (cmp !== 0) return cmp;
        const aName = (rowA.original.name || '').toLowerCase();
        const bName = (rowB.original.name || '').toLowerCase();
        return aName.localeCompare(bName);
      },
      size: DEFAULT_COLUMN_SIZES.ticketType,
      minSize: 80,
      maxSize: 300,
      enableResizing: true,
    }),
    columnHelper.accessor('ticketUnitPrice', {
      id: 'ticketPrice',
      header: 'Ticket price',
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums" title={row.original.currency ? `${row.original.currency} ${row.original.ticketUnitPrice}` : undefined}>
          {formatMoney(row.original.ticketUnitPrice)}
        </span>
      ),
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.ticketUnitPrice;
        const b = rowB.original.ticketUnitPrice;
        if (a !== b) return a - b;
        const aName = (rowA.original.name || '').toLowerCase();
        const bName = (rowB.original.name || '').toLowerCase();
        return aName.localeCompare(bName);
      },
      size: DEFAULT_COLUMN_SIZES.ticketPrice,
      minSize: 70,
      maxSize: 200,
      enableResizing: true,
    }),
    columnHelper.accessor('accessLabel', {
      id: 'access',
      header: 'Access',
      cell: ({ row }) => {
        const t = row.original;
        const title = t.accessTooltip ?? (t.accessLabel && t.accessLabel.length > 40 ? t.accessLabel : undefined);
        return (
          <span className="max-w-full truncate block" title={title}>
            {t.accessLabel || '-'}
          </span>
        );
      },
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = (rowA.original.accessLabel || '').toLowerCase();
        const b = (rowB.original.accessLabel || '').toLowerCase();
        const cmp = a.localeCompare(b);
        if (cmp !== 0) return cmp;
        const aName = (rowA.original.name || '').toLowerCase();
        const bName = (rowB.original.name || '').toLowerCase();
        return aName.localeCompare(bName);
      },
      size: DEFAULT_COLUMN_SIZES.access,
      minSize: 80,
      maxSize: 320,
      enableResizing: true,
    }),
    columnHelper.accessor('remark', {
      id: 'remark',
      header: 'Remark',
      cell: ({ row, table }) => {
        const ticket = row.original;
        const meta = table.options.meta as { draftById: Record<string, Draft>; editMode: boolean } | undefined;
        if (meta?.editMode) {
          const draftRemark = meta.draftById[ticket.id]?.remark ?? (ticket.remark || '');
          return (
            <Input
              value={draftRemark}
              onChange={(e) => {
                setDraftById(prev => ({
                  ...prev,
                  [ticket.id]: { ...prev[ticket.id], remark: e.target.value },
                }));
              }}
              className="h-8 px-2 text-sm rounded-none border-0 shadow-none w-auto min-w-0"
              placeholder="-"
              style={{ textOverflow: 'clip', overflow: 'visible' }}
            />
          );
        }
        return (
          <span className="max-w-full truncate block" title={ticket.remark ?? undefined}>
            {ticket.remark || '-'}
          </span>
        );
      },
      size: DEFAULT_COLUMN_SIZES.remark,
      minSize: 80,
      maxSize: 400,
      enableResizing: true,
    }),
    columnHelper.accessor(row => row.addons ?? '', {
      id: 'addons',
      header: 'Add-ons',
      cell: ({ row }) => (
        <span className="block max-w-full whitespace-normal break-words" title={row.original.addons ?? undefined}>
          {row.original.addons || '-'}
        </span>
      ),
      size: DEFAULT_COLUMN_SIZES.addons,
      minSize: 80,
      maxSize: 300,
      enableResizing: true,
    }),
  ], []);

  const safeVisibleColumns = useMemo(() => {
    if (!visibleColumns || visibleColumns.length === 0) return DEFAULT_COLUMNS;
    return visibleColumns;
  }, [visibleColumns]);

  const columnVisibility = useMemo((): VisibilityState => {
    return Object.fromEntries(
      (DEFAULT_COLUMNS as ColumnKey[]).map(c => [c, safeVisibleColumns.includes(c)])
    );
  }, [safeVisibleColumns]);

  const columnOrder = useMemo(() => {
    const baseOrder = editMode ? EDIT_MODE_COLUMN_ORDER : DEFAULT_COLUMNS;
    return baseOrder;
  }, [editMode]);

  const table = useReactTable({
    data: filteredTickets,
    columns,
    meta: {
      draftById,
      editMode,
      setDraftById,
    },
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: () => {},
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: () => {},
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    getRowId: (row) => row.id,
  });

  const isResizing = table.getState().columnSizingInfo?.isResizingColumn;

  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      return () => {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isResizing]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {editMode && (
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            Editing mode
          </div>
        )}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-8"
          />
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 relative"
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-4" align="end">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="text-sm font-medium">Columns</div>
                  <div className="space-y-2">
                    {(['status', 'name', 'phone', 'email', 'ticketType', 'ticketPrice', 'access', 'remark', 'addons'] as ColumnKey[]).map((column) => {
                      const columnLabels: Record<ColumnKey, string> = {
                        status: 'Status',
                        name: 'Name',
                        phone: 'Phone',
                        email: 'Email',
                        ticketType: 'Ticket Type',
                        ticketPrice: 'Ticket price',
                        access: 'Access',
                        remark: 'Remark',
                        addons: 'Add-ons',
                      };
                      const isVisible = visibleColumns.includes(column);
                      const isLastVisible = visibleColumns.length === 1 && isVisible;
                      return (
                        <div
                          key={column}
                          className="flex items-center space-x-2 cursor-pointer"
                          onClick={() => !isLastVisible && handleToggleColumn(column)}
                        >
                          <Checkbox checked={isVisible} disabled={isLastVisible} />
                          <label className={`text-sm cursor-pointer ${isLastVisible ? 'text-muted-foreground' : ''}`}>
                            {columnLabels[column]}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-medium">Default Behavior</div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Default Sort</label>
                      <Select value={defaultSort} onValueChange={handleDefaultSortChange}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEFAULT_SORT_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div
                      className="flex items-center space-x-2 cursor-pointer"
                      onClick={() => setRememberPrefs(!rememberPrefs)}
                    >
                      <Checkbox checked={rememberPrefs} />
                      <label className="text-sm cursor-pointer">Remember filters & sort</label>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-medium">Export</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCSV}
                    className="w-full h-9"
                    disabled={filteredTickets.length === 0}
                  >
                    Export CSV
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {editMode ? (
            <>
              <Button
                variant="default"
                size="icon"
                className="h-8 w-8 md:hidden"
                onClick={handleSave}
                disabled={editedCount === 0 || saving}
                aria-label="Save"
                title="Save"
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-8 hidden md:inline-flex"
                onClick={handleSave}
                disabled={editedCount === 0 || saving}
                aria-label="Save"
                title="Save"
              >
                <Save className="h-4 w-4 mr-2" />
                Save {editedCount > 0 ? `(${editedCount})` : ''}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 md:hidden"
                onClick={handleCancelEdit}
                disabled={saving}
                aria-label="Cancel"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 hidden md:inline-flex"
                onClick={handleCancelEdit}
                disabled={saving}
                aria-label="Cancel"
                title="Cancel"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Edit"
              title="Edit"
              onClick={handleEnterEditMode}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {tickets && tickets.length > 0 && (
        <div className="text-xs text-muted-foreground mt-1">
          {filteredTickets.length === tickets.length
            ? `${filteredTickets.length} ${filteredTickets.length === 1 ? 'ticket' : 'tickets'}`
            : `${filteredTickets.length} / ${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'}`}
        </div>
      )}

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
          <Table className="table-fixed" style={{ minWidth: '100%' }}>
            <TableHeader>
              {(table.getHeaderGroups() ?? []).map(headerGroup => (
                <TableRow key={headerGroup.id} className="border-b border-border hover:bg-transparent">
                  {headerGroup.headers.map(header => {
                    const colId = header.column.id as ColumnKey;
                    const isLast = headerGroup.headers.indexOf(header) === headerGroup.headers.length - 1;
                    const isSortable = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    const baseClasses = `sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground ${isLast ? 'last:border-r-0' : ''}`;
                    return (
                      <TableHead
                        key={header.id}
                        className={`${baseClasses} ${isSortable ? 'cursor-pointer select-none' : ''} relative`}
                        style={{
                          width: header.getSize(),
                          minWidth: header.getSize(),
                          maxWidth: header.getSize(),
                        }}
                        onClick={isSortable ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <div className="flex items-center gap-1">
                          {typeof header.column.columnDef.header === 'string'
                            ? header.column.columnDef.header
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {isSortable && sortDir && (
                            sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                          )}
                        </div>
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              header.getResizeHandler()(e);
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              header.getResizeHandler()(e);
                            }}
                            className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none ${
                              header.column.getIsResizing() ? 'bg-primary opacity-100' : 'hover:bg-border opacity-0 hover:opacity-100'
                            }`}
                            style={{ touchAction: 'none' }}
                          />
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map(row => (
                <TableRow key={row.id} className="border-b border-border">
                  {row.getVisibleCells().map(cell => {
                    const isLast = row.getVisibleCells().indexOf(cell) === row.getVisibleCells().length - 1;
                    const baseClasses = `align-top border-r border-border px-2 py-1.5 text-sm ${isLast ? 'last:border-r-0' : ''}`;
                    const isEditCell = editMode && ['status', 'name', 'remark'].includes(cell.column.id);
                    return (
                      <TableCell
                        key={cell.id}
                        className={`${baseClasses} ${isEditCell ? 'bg-muted/20' : ''}`}
                        style={{
                          width: cell.column.getSize(),
                          minWidth: cell.column.getSize(),
                          maxWidth: cell.column.getSize(),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
