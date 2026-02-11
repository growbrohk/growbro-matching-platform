import { useState, useMemo, useEffect } from 'react';
import { useEventTickets } from '@/hooks/use-event-tickets';
import { Loader2, Search, Filter, Settings, Pencil, Camera, ChevronUp, ChevronDown, Save, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { EventTicketRow } from '@/hooks/use-event-tickets';
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
type ColumnKey = 'status' | 'name' | 'phone' | 'email' | 'ticketType' | 'remark';

const DEFAULT_COLUMNS: ColumnKey[] = ['status', 'name', 'phone', 'email', 'ticketType', 'remark'];
const EDIT_MODE_COLUMN_ORDER: ColumnKey[] = ['status', 'name', 'remark', 'phone', 'email', 'ticketType'];

type Draft = { status?: 'valid' | 'scanned'; name?: string; remark?: string };

type DefaultSortOption = {
  label: string;
  value: string;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
};

const DEFAULT_SORT_OPTIONS: DefaultSortOption[] = [
  { label: 'Name (A–Z)', value: 'name-asc', sort: { key: 'name', dir: 'asc' } },
  { label: 'Status (Pending first)', value: 'status-asc', sort: { key: 'status', dir: 'asc' } },
  { label: 'Ticket Type (A–Z)', value: 'ticketType-asc', sort: { key: 'ticketType', dir: 'asc' } },
];

export function EventTicketsTab({ eventId }: { eventId: string }) {
  const { data: tickets, isLoading, refetch } = useEventTickets(eventId);
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Array<'valid' | 'scanned'>>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
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
          const parsed = JSON.parse(storedColumns) as ColumnKey[];
          if (parsed.length > 0) {
            setVisibleColumns(parsed);
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
          const parsed = JSON.parse(storedSort) as { key: SortKey; dir: 'asc' | 'desc' };
          setSort(parsed);
          restoredSort = true;
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
        setSort(option.sort);
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
      localStorage.setItem(storageKeys.sort, JSON.stringify(sort));
      localStorage.setItem(storageKeys.defaultSort, defaultSort);
    } else {
      // Clear all stored preferences
      localStorage.removeItem(storageKeys.remember);
      localStorage.removeItem(storageKeys.visibleColumns);
      localStorage.removeItem(storageKeys.selectedStatuses);
      localStorage.removeItem(storageKeys.selectedTypes);
      localStorage.removeItem(storageKeys.sort);
      localStorage.removeItem(storageKeys.defaultSort);
    }
  }, [rememberPrefs, visibleColumns, selectedStatuses, selectedTypes, sort, defaultSort, storageKeys]);

  // Helper functions for edit mode
  const getFullName = (ticket: EventTicketRow): string => {
    return ticket.name?.trim() || '-';
  };

  const getDraftValue = <K extends keyof Draft>(ticket: EventTicketRow, field: K): Draft[K] | undefined => {
    return draftById[ticket.id]?.[field];
  };

  const hasChanges = (ticket: EventTicketRow): boolean => {
    const draft = draftById[ticket.id];
    if (!draft) return false;
    
    const originalStatus = ticket.status as 'valid' | 'scanned';
    const originalName = getFullName(ticket);
    const originalRemark = ticket.remark || '';
    
    // Normalize empty strings for comparison
    const normalizeName = (name: string) => (name.trim() || '-');
    const normalizeRemark = (remark: string) => (remark || '');
    
    return (
      (draft.status !== undefined && draft.status !== originalStatus) ||
      (draft.name !== undefined && normalizeName(draft.name) !== normalizeName(originalName)) ||
      (draft.remark !== undefined && normalizeRemark(draft.remark) !== normalizeRemark(originalRemark))
    );
  };

  const editedCount = useMemo(() => {
    if (!tickets) return 0;
    return tickets.filter(hasChanges).length;
  }, [tickets, draftById]);

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

  const handleToggleColumn = (column: ColumnKey) => {
    setVisibleColumns(prev => {
      if (prev.includes(column)) {
        // Prevent hiding the last column
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
      setSort(option.sort);
    }
  };

  // Compute ordered columns based on edit mode
  const orderedColumns = useMemo(() => {
    const baseOrder = editMode ? EDIT_MODE_COLUMN_ORDER : DEFAULT_COLUMNS;
    // Filter to only visible columns, preserving order
    return baseOrder.filter(col => visibleColumns.includes(col));
  }, [editMode, visibleColumns]);

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
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      if (!tickets) {
        throw new Error('No tickets available');
      }

      // Build update payloads for each edited ticket
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

          // Handle name change: split into first_name/last_name
          if (draft.name !== undefined) {
            const normalizedDraftName = draft.name.trim();
            if (normalizedDraftName !== normalizedOriginalName) {
              if (normalizedDraftName) {
                const nameParts = normalizedDraftName.split(/\s+/);
                if (nameParts.length === 1) {
                  // Single word -> first_name only
                  payload.first_name = nameParts[0];
                  payload.last_name = null;
                } else {
                  // Multiple words -> first word is first_name, rest is last_name
                  payload.first_name = nameParts[0];
                  payload.last_name = nameParts.slice(1).join(' ');
                }
              } else {
                // Empty string -> clear both
                payload.first_name = null;
                payload.last_name = null;
              }
            }
          }

          // Handle remark change
          if (draft.remark !== undefined && draft.remark !== originalRemark) {
            payload.remark = draft.remark || null;
          }

          // Handle status change
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

      // Execute all updates
      const results = await Promise.all(
        updates.map(u => supabase.from('tickets').update(u.payload).eq('id', u.id))
      );

      // Check for errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Failed to save ${errors.length} ticket(s)`);
      }

      // Success
      toast({
        title: 'Success',
        description: `Saved ${editedCount} ticket(s)`,
      });

      // Reset state and refetch
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

    // Define column order and labels
    const columnOrder: ColumnKey[] = ['status', 'name', 'phone', 'email', 'ticketType', 'remark'];
    const columnLabels: Record<ColumnKey, string> = {
      status: 'Status',
      name: 'Name',
      phone: 'Phone',
      email: 'Email',
      ticketType: 'Ticket Type',
      remark: 'Remark',
    };

    // Filter to only visible columns in order
    const visibleOrderedColumns = columnOrder.filter(col => visibleColumns.includes(col));

    // CSV escaping helper
    const escapeCSV = (value: string | null | undefined): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV rows
    const headers = visibleOrderedColumns.map(col => columnLabels[col]);
    const rows = filteredTickets.map(ticket => {
      return visibleOrderedColumns.map(col => {
        if (col === 'status') {
          return escapeCSV(isCheckedIn(ticket.status) ? 'Checked In' : 'Pending');
        }
        return escapeCSV(ticket[col] || '');
      });
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Create blob and download
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
        {editMode && (
          <div className="text-sm text-muted-foreground mr-2">
            Editing mode
          </div>
        )}
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-4" align="end">
              <div className="space-y-4">
                {/* Section 1: Columns */}
                <div className="space-y-3">
                  <div className="text-sm font-medium">Columns</div>
                  <div className="space-y-2">
                    {(['status', 'name', 'phone', 'email', 'ticketType', 'remark'] as ColumnKey[]).map((column) => {
                      const columnLabels: Record<ColumnKey, string> = {
                        status: 'Status',
                        name: 'Name',
                        phone: 'Phone',
                        email: 'Email',
                        ticketType: 'Ticket Type',
                        remark: 'Remark',
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

                {/* Section 2: Default Behavior */}
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

                {/* Section 3: Export */}
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
              {/* Mobile: Icon-only Save button */}
              <Button
                variant="default"
                size="icon"
                className="h-9 w-9 md:hidden"
                onClick={handleSave}
                disabled={editedCount === 0 || saving}
                aria-label="Save"
                title="Save"
              >
                <Save className="h-4 w-4" />
              </Button>
              {/* Desktop: Save button with text */}
              <Button
                variant="default"
                size="sm"
                className="h-9 hidden md:inline-flex"
                onClick={handleSave}
                disabled={editedCount === 0 || saving}
                aria-label="Save"
                title="Save"
              >
                <Save className="h-4 w-4 mr-2" />
                Save {editedCount > 0 ? `(${editedCount})` : ''}
              </Button>
              {/* Mobile: Icon-only Cancel button */}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 md:hidden"
                onClick={handleCancelEdit}
                disabled={saving}
                aria-label="Cancel"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
              {/* Desktop: Cancel button with text */}
              <Button
                variant="outline"
                size="sm"
                className="h-9 hidden md:inline-flex"
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
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label="Edit"
                title="Edit"
                onClick={handleEnterEditMode}
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
            </>
          )}
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
                {orderedColumns.map((column, index) => {
                  const isLast = index === orderedColumns.length - 1;
                  const baseClasses = `sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground ${isLast ? 'last:border-r-0' : ''}`;
                  
                  if (column === 'status') {
                    return (
                      <TableHead
                        key={column}
                        className={`${baseClasses} cursor-pointer select-none`}
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
                    );
                  }
                  if (column === 'name') {
                    return (
                      <TableHead
                        key={column}
                        className={`${baseClasses} cursor-pointer select-none min-w-[180px]`}
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
                    );
                  }
                  if (column === 'phone') {
                    return (
                      <TableHead key={column} className={baseClasses}>
                        Phone
                      </TableHead>
                    );
                  }
                  if (column === 'email') {
                    return (
                      <TableHead key={column} className={baseClasses}>
                        Email
                      </TableHead>
                    );
                  }
                  if (column === 'ticketType') {
                    return (
                      <TableHead
                        key={column}
                        className={`${baseClasses} cursor-pointer select-none`}
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
                    );
                  }
                  if (column === 'remark') {
                    return (
                      <TableHead key={column} className={baseClasses}>
                        Remark
                      </TableHead>
                    );
                  }
                  return null;
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map((ticket) => (
                <TableRow key={ticket.id} className="border-b border-border">
                  {orderedColumns.map((column, index) => {
                    const isLast = index === orderedColumns.length - 1;
                    const baseClasses = `border-r border-border px-2 py-1.5 text-sm ${isLast ? 'last:border-r-0' : ''}`;
                    
                    if (column === 'status') {
                      if (editMode) {
                        const draftStatus = getDraftValue(ticket, 'status') ?? (ticket.status as 'valid' | 'scanned');
                        return (
                          <TableCell key={column} className={`${baseClasses} bg-muted/20`}>
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
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={column} className={baseClasses}>
                          {getStatusText(ticket.status)}
                        </TableCell>
                      );
                    }
                    if (column === 'name') {
                      if (editMode) {
                        const draftName = getDraftValue(ticket, 'name') ?? getFullName(ticket);
                        return (
                          <TableCell key={column} className={`${baseClasses} bg-muted/20 min-w-[180px]`}>
                            <Input
                              value={draftName === '-' ? '' : draftName}
                              onChange={(e) => {
                                setDraftById(prev => ({
                                  ...prev,
                                  [ticket.id]: { ...prev[ticket.id], name: e.target.value },
                                }));
                              }}
                              className="h-8 px-2 text-sm rounded-none border-0 shadow-none font-medium w-full min-w-[180px] whitespace-nowrap"
                              placeholder="-"
                            />
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell
                          key={column}
                          className={`min-w-[180px] whitespace-nowrap ${baseClasses} font-medium`}
                          title={ticket.name ?? undefined}
                        >
                          {ticket.name || '-'}
                        </TableCell>
                      );
                    }
                    if (column === 'phone') {
                      return (
                        <TableCell key={column} className={baseClasses}>
                          {ticket.phone || '-'}
                        </TableCell>
                      );
                    }
                    if (column === 'email') {
                      return (
                        <TableCell
                          key={column}
                          className={`max-w-[180px] truncate ${baseClasses}`}
                          title={ticket.email ?? undefined}
                        >
                          {ticket.email || '-'}
                        </TableCell>
                      );
                    }
                    if (column === 'ticketType') {
                      return (
                        <TableCell key={column} className={baseClasses}>
                          {ticket.ticketType}
                        </TableCell>
                      );
                    }
                    if (column === 'remark') {
                      if (editMode) {
                        const draftRemark = getDraftValue(ticket, 'remark') ?? (ticket.remark || '');
                        return (
                          <TableCell key={column} className={`${baseClasses} bg-muted/20`}>
                            <Input
                              value={draftRemark}
                              onChange={(e) => {
                                setDraftById(prev => ({
                                  ...prev,
                                  [ticket.id]: { ...prev[ticket.id], remark: e.target.value },
                                }));
                              }}
                              className="h-8 px-2 text-sm rounded-none border-0 shadow-none"
                              placeholder="-"
                            />
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell
                          key={column}
                          className={`max-w-[200px] truncate ${baseClasses}`}
                          title={ticket.remark ?? undefined}
                        >
                          {ticket.remark || '-'}
                        </TableCell>
                      );
                    }
                    return null;
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
