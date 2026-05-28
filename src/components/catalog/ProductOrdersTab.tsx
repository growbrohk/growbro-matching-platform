import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { format } from 'date-fns';
import { Loader2, Search, Filter, Settings, ChevronUp, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useProductOrdersTable,
  type ProductOrderTableRow,
  type ProductOrderSource,
  type ProductOrdersRangeKey,
} from '@/hooks/useProductOrdersTable';
import { formatMoney } from '@/hooks/useOrdersDashboard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ColumnKey =
  | 'status'
  | 'date'
  | 'orderNo'
  | 'name'
  | 'phone'
  | 'email'
  | 'product'
  | 'source'
  | 'event'
  | 'qty'
  | 'amount'
  | 'payment';

const DEFAULT_COLUMNS: ColumnKey[] = [
  'status',
  'date',
  'orderNo',
  'name',
  'phone',
  'email',
  'product',
  'source',
  'event',
  'qty',
  'amount',
  'payment',
];

const DEFAULT_COLUMN_SIZES: Record<ColumnKey, number> = {
  status: 90,
  date: 140,
  orderNo: 110,
  name: 130,
  phone: 120,
  email: 180,
  product: 200,
  source: 110,
  event: 160,
  qty: 60,
  amount: 100,
  payment: 100,
};

const RANGE_OPTIONS: { key: ProductOrdersRangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
];

const PRODUCT_ORDERS_RANGE_KEYS: ProductOrdersRangeKey[] = [
  'today',
  '7d',
  '30d',
  '90d',
  'all',
];

function normalizeColumnOrder(stored: ColumnKey[]): ColumnKey[] {
  const out = stored.filter((c) => DEFAULT_COLUMNS.includes(c));
  for (const col of DEFAULT_COLUMNS) {
    if (!out.includes(col)) out.push(col);
  }
  return out;
}

function normalizeVisibleColumns(stored: ColumnKey[]): ColumnKey[] {
  const valid = stored.filter((c) => DEFAULT_COLUMNS.includes(c));
  return valid.length > 0 ? valid : [...DEFAULT_COLUMNS];
}

type SortKey = 'status' | 'date' | 'name' | 'product' | 'amount';

type DefaultSortOption = {
  label: string;
  value: string;
  sort: { id: string; desc: boolean };
};

const DEFAULT_SORT_OPTIONS: DefaultSortOption[] = [
  { label: 'Date (newest)', value: 'date-desc', sort: { id: 'date', desc: true } },
  { label: 'Date (oldest)', value: 'date-asc', sort: { id: 'date', desc: false } },
  { label: 'Name (A–Z)', value: 'name-asc', sort: { id: 'name', desc: false } },
  { label: 'Amount (high–low)', value: 'amount-desc', sort: { id: 'amount', desc: true } },
];

function isSortKey(key: string): key is SortKey {
  return key === 'status' || key === 'date' || key === 'name' || key === 'product' || key === 'amount';
}

function sourceLabel(source: ProductOrderSource): string {
  return source === 'product' ? 'Product' : 'Event add-on';
}

function getStatusText(displayStatus: string) {
  if (displayStatus === 'Sent') {
    return <span className="text-green-700">Sent</span>;
  }
  if (displayStatus === 'Paid') {
    return <span className="text-green-700">Paid</span>;
  }
  if (displayStatus === 'Pending') {
    return <span className="text-muted-foreground">Pending</span>;
  }
  return <span className="text-muted-foreground">{displayStatus}</span>;
}

const columnHelper = createColumnHelper<ProductOrderTableRow>();

interface ProductOrdersTabProps {
  enabled?: boolean;
}

export function ProductOrdersTab({ enabled = true }: ProductOrdersTabProps) {
  const navigate = useNavigate();
  const [range, setRange] = useState<ProductOrdersRangeKey>('30d');
  const { data: rows = [], isLoading } = useProductOrdersTable(range, { enabled });

  const [query, setQuery] = useState('');
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<ProductOrderSource[]>([]);
  const [shippedFilter, setShippedFilter] = useState<'all' | 'shipped' | 'not_shipped'>('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([...DEFAULT_COLUMNS]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>([...DEFAULT_COLUMNS]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [defaultSort, setDefaultSort] = useState('date-desc');
  const [rememberPrefs, setRememberPrefs] = useState(false);

  const storageKeys = useMemo(
    () => ({
      remember: 'productOrders:remember',
      visibleColumns: 'productOrders:visibleColumns',
      columnOrder: 'productOrders:columnOrder',
      selectedPaymentStatuses: 'productOrders:selectedPaymentStatuses',
      selectedSources: 'productOrders:selectedSources',
      shippedFilter: 'productOrders:shippedFilter',
      sort: 'productOrders:sort',
      defaultSort: 'productOrders:defaultSort',
      columnSizing: 'productOrders:columnSizing',
      range: 'productOrders:range',
    }),
    []
  );

  useEffect(() => {
    const storedRemember = localStorage.getItem(storageKeys.remember);
    const shouldRemember = storedRemember === 'true';
    let restoredSort = false;

    if (shouldRemember) {
      const storedColumns = localStorage.getItem(storageKeys.visibleColumns);
      if (storedColumns) {
        try {
          const parsed = JSON.parse(storedColumns) as ColumnKey[];
          setVisibleColumns(normalizeVisibleColumns(parsed));
        } catch {
          /* use defaults */
        }
      }

      const storedColumnOrder = localStorage.getItem(storageKeys.columnOrder);
      if (storedColumnOrder) {
        try {
          const parsed = JSON.parse(storedColumnOrder) as ColumnKey[];
          if (parsed.length > 0) setColumnOrder(normalizeColumnOrder(parsed));
        } catch {
          /* use defaults */
        }
      }

      const storedSizing = localStorage.getItem(storageKeys.columnSizing);
      if (storedSizing) {
        try {
          const parsed = JSON.parse(storedSizing) as ColumnSizingState;
          if (Object.keys(parsed).length > 0) setColumnSizing(parsed);
        } catch {
          /* use defaults */
        }
      }

      const storedPayment = localStorage.getItem(storageKeys.selectedPaymentStatuses);
      if (storedPayment) {
        try {
          setSelectedPaymentStatuses(JSON.parse(storedPayment) as string[]);
        } catch {
          /* ignore */
        }
      }

      const storedSources = localStorage.getItem(storageKeys.selectedSources);
      if (storedSources) {
        try {
          setSelectedSources(JSON.parse(storedSources) as ProductOrderSource[]);
        } catch {
          /* ignore */
        }
      }

      const storedShipped = localStorage.getItem(storageKeys.shippedFilter);
      if (storedShipped === 'shipped' || storedShipped === 'not_shipped' || storedShipped === 'all') {
        setShippedFilter(storedShipped);
      }

      const storedSort = localStorage.getItem(storageKeys.sort);
      if (storedSort) {
        try {
          const parsed = JSON.parse(storedSort) as { key: string; dir: 'asc' | 'desc' };
          if (isSortKey(parsed.key)) {
            setSorting([{ id: parsed.key, desc: parsed.dir === 'desc' }]);
            restoredSort = true;
          }
        } catch {
          /* ignore */
        }
      }

      const storedDefaultSort = localStorage.getItem(storageKeys.defaultSort);
      if (storedDefaultSort) setDefaultSort(storedDefaultSort);

      const storedRange = localStorage.getItem(storageKeys.range) as ProductOrdersRangeKey | null;
      if (storedRange && PRODUCT_ORDERS_RANGE_KEYS.includes(storedRange)) {
        setRange(storedRange);
      }
    }

    setRememberPrefs(shouldRemember);

    if (!restoredSort) {
      const option = DEFAULT_SORT_OPTIONS.find((o) => o.value === 'date-desc');
      if (option) setSorting([option.sort]);
    }
  }, [storageKeys]);

  useEffect(() => {
    if (!rememberPrefs) return;
    localStorage.setItem(storageKeys.remember, 'true');
    localStorage.setItem(storageKeys.visibleColumns, JSON.stringify(visibleColumns));
    localStorage.setItem(storageKeys.columnOrder, JSON.stringify(columnOrder));
    localStorage.setItem(storageKeys.columnSizing, JSON.stringify(columnSizing));
    localStorage.setItem(storageKeys.selectedPaymentStatuses, JSON.stringify(selectedPaymentStatuses));
    localStorage.setItem(storageKeys.selectedSources, JSON.stringify(selectedSources));
    localStorage.setItem(storageKeys.shippedFilter, shippedFilter);
    localStorage.setItem(storageKeys.defaultSort, defaultSort);
    localStorage.setItem(storageKeys.range, range);
    if (sorting.length > 0 && isSortKey(sorting[0].id)) {
      localStorage.setItem(
        storageKeys.sort,
        JSON.stringify({ key: sorting[0].id, dir: sorting[0].desc ? 'desc' : 'asc' })
      );
    }
  }, [
    rememberPrefs,
    visibleColumns,
    columnOrder,
    columnSizing,
    selectedPaymentStatuses,
    selectedSources,
    shippedFilter,
    sorting,
    defaultSort,
    range,
    storageKeys,
  ]);

  const filteredRows = useMemo(() => {
    let result = rows;

    if (query.trim()) {
      const searchLower = query.toLowerCase();
      result = result.filter((row) => {
        const matchesName = row.buyerName.toLowerCase().includes(searchLower);
        const matchesPhone = row.phone?.toLowerCase().includes(searchLower) || false;
        const matchesEmail = row.email?.toLowerCase().includes(searchLower) || false;
        const matchesOrderNo = row.orderNo?.toLowerCase().includes(searchLower) || false;
        const matchesProduct = row.productLabel.toLowerCase().includes(searchLower);
        const matchesEvent = row.eventTitle?.toLowerCase().includes(searchLower) || false;
        const matchesSource = sourceLabel(row.source).toLowerCase().includes(searchLower);
        const matchesStatus = row.displayStatus.toLowerCase().includes(searchLower);
        const matchesAmount =
          String(row.amount).includes(searchLower) ||
          formatMoney(row.amount).toLowerCase().includes(searchLower);
        return (
          matchesName ||
          matchesPhone ||
          matchesEmail ||
          matchesOrderNo ||
          matchesProduct ||
          matchesEvent ||
          matchesSource ||
          matchesStatus ||
          matchesAmount
        );
      });
    }

    if (selectedPaymentStatuses.length > 0) {
      result = result.filter((row) => selectedPaymentStatuses.includes(row.paymentStatus));
    }

    if (selectedSources.length > 0) {
      result = result.filter((row) => selectedSources.includes(row.source));
    }

    if (shippedFilter === 'shipped') {
      result = result.filter((row) => !!row.shippedAt);
    } else if (shippedFilter === 'not_shipped') {
      result = result.filter((row) => !row.shippedAt);
    }

    return result;
  }, [rows, query, selectedPaymentStatuses, selectedSources, shippedFilter]);

  const hasActiveFilters =
    selectedPaymentStatuses.length > 0 ||
    selectedSources.length > 0 ||
    shippedFilter !== 'all';

  const handleClearFilters = () => {
    setSelectedPaymentStatuses([]);
    setSelectedSources([]);
    setShippedFilter('all');
  };

  const handleToggleColumn = (column: ColumnKey) => {
    setVisibleColumns((prev) => {
      if (prev.includes(column)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== column);
      }
      return [...prev, column];
    });
  };

  const moveColumn = (column: ColumnKey, direction: 'up' | 'down') => {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(column);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const visibleOrderedColumns = useMemo(
    () => columnOrder.filter((col) => visibleColumns.includes(col)),
    [columnOrder, visibleColumns]
  );

  const handleDefaultSortChange = (value: string) => {
    setDefaultSort(value);
    const option = DEFAULT_SORT_OPTIONS.find((opt) => opt.value === value);
    if (option) setSorting([option.sort]);
  };

  const handleExportCSV = useCallback(() => {
    if (filteredRows.length === 0) return;

    const columnLabels: Record<ColumnKey, string> = {
      status: 'Status',
      date: 'Date',
      orderNo: 'Order No',
      name: 'Name',
      phone: 'Phone',
      email: 'Email',
      product: 'Product',
      source: 'Source',
      event: 'Event',
      qty: 'Qty',
      amount: 'Amount',
      payment: 'Payment',
    };

    const escapeCSV = (value: string | null | undefined): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = visibleOrderedColumns.map((col) => columnLabels[col]);
    const csvRows = filteredRows.map((row) =>
      visibleOrderedColumns.map((col) => {
        switch (col) {
          case 'status':
            return escapeCSV(row.displayStatus);
          case 'date':
            return escapeCSV(
              row.createdAt ? format(new Date(row.createdAt), 'dd/MM/yyyy') : ''
            );
          case 'orderNo':
            return escapeCSV(row.orderNo || '');
          case 'name':
            return escapeCSV(row.buyerName);
          case 'phone':
            return escapeCSV(row.phone || '');
          case 'email':
            return escapeCSV(row.email || '');
          case 'product':
            return escapeCSV(row.productLabel);
          case 'source':
            return escapeCSV(sourceLabel(row.source));
          case 'event':
            return escapeCSV(row.eventTitle || '');
          case 'qty':
            return escapeCSV(String(row.quantity));
          case 'amount':
            return escapeCSV(formatMoney(row.amount));
          case 'payment':
            return escapeCSV(row.paymentStatus);
          default:
            return '';
        }
      })
    );

    const csvContent = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `product-orders-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredRows, visibleOrderedColumns]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('displayStatus', {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => getStatusText(row.original.displayStatus),
        enableSorting: true,
        sortingFn: (rowA, rowB) =>
          rowA.original.displayStatus.localeCompare(rowB.original.displayStatus),
        size: DEFAULT_COLUMN_SIZES.status,
        minSize: 60,
        maxSize: 200,
        enableResizing: true,
      }),
      columnHelper.accessor('createdAt', {
        id: 'date',
        header: 'Date',
        cell: ({ row }) =>
          row.original.createdAt
            ? format(new Date(row.original.createdAt), 'dd/MM/yyyy')
            : '—',
        enableSorting: true,
        sortingFn: (rowA, rowB) =>
          new Date(rowA.original.createdAt).getTime() - new Date(rowB.original.createdAt).getTime(),
        size: DEFAULT_COLUMN_SIZES.date,
        minSize: 100,
        maxSize: 220,
        enableResizing: true,
      }),
      columnHelper.accessor('orderNo', {
        id: 'orderNo',
        header: 'Order No',
        cell: ({ row }) => row.original.orderNo || '—',
        size: DEFAULT_COLUMN_SIZES.orderNo,
        minSize: 80,
        maxSize: 160,
        enableResizing: true,
      }),
      columnHelper.accessor('buyerName', {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium truncate block" title={row.original.buyerName}>
            {row.original.buyerName}
          </span>
        ),
        enableSorting: true,
        size: DEFAULT_COLUMN_SIZES.name,
        minSize: 80,
        maxSize: 300,
        enableResizing: true,
      }),
      columnHelper.accessor('phone', {
        id: 'phone',
        header: 'Phone',
        cell: ({ row }) => row.original.phone || '—',
        size: DEFAULT_COLUMN_SIZES.phone,
        minSize: 80,
        maxSize: 200,
        enableResizing: true,
      }),
      columnHelper.accessor('email', {
        id: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="truncate block" title={row.original.email ?? undefined}>
            {row.original.email || '—'}
          </span>
        ),
        size: DEFAULT_COLUMN_SIZES.email,
        minSize: 100,
        maxSize: 350,
        enableResizing: true,
      }),
      columnHelper.accessor('productLabel', {
        id: 'product',
        header: 'Product',
        cell: ({ row }) => (
          <span className="block max-w-full whitespace-normal break-words" title={row.original.productLabel}>
            {row.original.productLabel}
          </span>
        ),
        enableSorting: true,
        size: DEFAULT_COLUMN_SIZES.product,
        minSize: 100,
        maxSize: 400,
        enableResizing: true,
      }),
      columnHelper.accessor('source', {
        id: 'source',
        header: 'Source',
        cell: ({ row }) => sourceLabel(row.original.source),
        enableSorting: true,
        sortingFn: (rowA, rowB) => rowA.original.source.localeCompare(rowB.original.source),
        size: DEFAULT_COLUMN_SIZES.source,
        minSize: 80,
        maxSize: 160,
        enableResizing: true,
      }),
      columnHelper.accessor('eventTitle', {
        id: 'event',
        header: 'Event',
        cell: ({ row }) => (
          <span className="truncate block" title={row.original.eventTitle ?? undefined}>
            {row.original.eventTitle || '—'}
          </span>
        ),
        size: DEFAULT_COLUMN_SIZES.event,
        minSize: 80,
        maxSize: 280,
        enableResizing: true,
      }),
      columnHelper.accessor('quantity', {
        id: 'qty',
        header: 'Qty',
        cell: ({ row }) => row.original.quantity,
        size: DEFAULT_COLUMN_SIZES.qty,
        minSize: 50,
        maxSize: 80,
        enableResizing: true,
      }),
      columnHelper.accessor('amount', {
        id: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">{formatMoney(row.original.amount)}</span>
        ),
        enableSorting: true,
        sortingFn: (rowA, rowB) => rowA.original.amount - rowB.original.amount,
        size: DEFAULT_COLUMN_SIZES.amount,
        minSize: 70,
        maxSize: 140,
        enableResizing: true,
      }),
      columnHelper.accessor('paymentStatus', {
        id: 'payment',
        header: 'Payment',
        cell: ({ row }) => row.original.paymentStatus,
        size: DEFAULT_COLUMN_SIZES.payment,
        minSize: 80,
        maxSize: 140,
        enableResizing: true,
      }),
    ],
    []
  );

  const safeVisibleColumns = useMemo(() => {
    if (!visibleColumns || visibleColumns.length === 0) return [...DEFAULT_COLUMNS];
    return visibleColumns;
  }, [visibleColumns]);

  const safeColumnOrder = useMemo(() => {
    if (!columnOrder || columnOrder.length === 0) return [...DEFAULT_COLUMNS];
    return normalizeColumnOrder(columnOrder);
  }, [columnOrder]);

  const columnVisibility = useMemo((): VisibilityState => {
    return Object.fromEntries(
      DEFAULT_COLUMNS.map((c) => [c, safeVisibleColumns.includes(c)])
    );
  }, [safeVisibleColumns]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder: safeColumnOrder,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    getRowId: (row) => row.rowId,
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

  const columnLabels: Record<ColumnKey, string> = {
    status: 'Status',
    date: 'Date',
    orderNo: 'Order No',
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    product: 'Product',
    source: 'Source',
    event: 'Event',
    qty: 'Qty',
    amount: 'Amount',
    payment: 'Payment',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-gray-200 rounded-full p-1 flex-nowrap">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setRange(opt.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                range === opt.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
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
                aria-label="Filter orders"
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
                  <div className="text-sm font-medium">Payment</div>
                  {(['submitted', 'paid'] as const).map((status) => (
                    <div
                      key={status}
                      className="flex items-center space-x-2 cursor-pointer"
                      onClick={() => {
                        setSelectedPaymentStatuses((prev) =>
                          prev.includes(status)
                            ? prev.filter((s) => s !== status)
                            : [...prev, status]
                        );
                      }}
                    >
                      <Checkbox checked={selectedPaymentStatuses.includes(status)} />
                      <label className="text-sm cursor-pointer capitalize">{status}</label>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Source</div>
                  {(['product', 'event_addon'] as const).map((src) => (
                    <div
                      key={src}
                      className="flex items-center space-x-2 cursor-pointer"
                      onClick={() => {
                        setSelectedSources((prev) =>
                          prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
                        );
                      }}
                    >
                      <Checkbox checked={selectedSources.includes(src)} />
                      <label className="text-sm cursor-pointer">{sourceLabel(src)}</label>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Shipped</div>
                  {(
                    [
                      { value: 'all' as const, label: 'All' },
                      { value: 'shipped' as const, label: 'Shipped' },
                      { value: 'not_shipped' as const, label: 'Not shipped' },
                    ] as const
                  ).map((opt) => (
                    <div
                      key={opt.value}
                      className="flex items-center space-x-2 cursor-pointer"
                      onClick={() => setShippedFilter(opt.value)}
                    >
                      <Checkbox checked={shippedFilter === opt.value} />
                      <label className="text-sm cursor-pointer">{opt.label}</label>
                    </div>
                  ))}
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
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-4" align="end">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="text-sm font-medium">Columns</div>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {columnOrder.map((column, index) => {
                      const isVisible = visibleColumns.includes(column);
                      const isLastVisible = visibleColumns.length === 1 && isVisible;
                      return (
                        <div
                          key={column}
                          className="flex items-center gap-1"
                        >
                          <div
                            className="flex flex-1 min-w-0 items-center space-x-2 cursor-pointer"
                            onClick={() => !isLastVisible && handleToggleColumn(column)}
                          >
                            <Checkbox checked={isVisible} disabled={isLastVisible} />
                            <label
                              className={`text-sm cursor-pointer truncate ${isLastVisible ? 'text-muted-foreground' : ''}`}
                            >
                              {columnLabels[column]}
                            </label>
                          </div>
                          <div className="flex shrink-0 gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={index === 0}
                              aria-label={`Move ${columnLabels[column]} up`}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveColumn(column, 'up');
                              }}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={index === columnOrder.length - 1}
                              aria-label={`Move ${columnLabels[column]} down`}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveColumn(column, 'down');
                              }}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-medium">Default Behavior</div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Default Sort</label>
                    <Select value={defaultSort} onValueChange={handleDefaultSortChange}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEFAULT_SORT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div
                    className="flex items-center space-x-2 cursor-pointer"
                    onClick={() => {
                      const next = !rememberPrefs;
                      setRememberPrefs(next);
                      if (next) {
                        localStorage.setItem(storageKeys.remember, 'true');
                      } else {
                        localStorage.setItem(storageKeys.remember, 'false');
                        localStorage.removeItem(storageKeys.visibleColumns);
                        localStorage.removeItem(storageKeys.columnOrder);
                        localStorage.removeItem(storageKeys.columnSizing);
                        localStorage.removeItem(storageKeys.selectedPaymentStatuses);
                        localStorage.removeItem(storageKeys.selectedSources);
                        localStorage.removeItem(storageKeys.shippedFilter);
                        localStorage.removeItem(storageKeys.sort);
                        localStorage.removeItem(storageKeys.defaultSort);
                        localStorage.removeItem(storageKeys.range);
                      }
                    }}
                  >
                    <Checkbox checked={rememberPrefs} />
                    <label className="text-sm cursor-pointer">
                      Remember filters, columns & sort
                    </label>
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
                    disabled={filteredRows.length === 0}
                  >
                    Export CSV
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {filteredRows.length === rows.length
            ? `${filteredRows.length} ${filteredRows.length === 1 ? 'order' : 'orders'}`
            : `${filteredRows.length} / ${rows.length} orders`}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <div className="w-full border border-border bg-background py-8 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? 'No product orders in this date range.'
              : `No results for "${query}"`}
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto border border-border bg-background">
          <Table className="table-fixed" style={{ minWidth: '100%' }}>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-border hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const isLast =
                      headerGroup.headers.indexOf(header) === headerGroup.headers.length - 1;
                    const isSortable = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          'sticky top-0 z-10 h-auto border-r border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground',
                          isLast && 'last:border-r-0',
                          isSortable && 'cursor-pointer select-none'
                        )}
                        style={{
                          width: header.getSize(),
                          minWidth: header.getSize(),
                          maxWidth: header.getSize(),
                        }}
                        onClick={isSortable ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isSortable && sortDir && (
                            sortDir === 'asc' ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )
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
                            className={cn(
                              'absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none',
                              header.column.getIsResizing()
                                ? 'bg-primary opacity-100'
                                : 'hover:bg-border opacity-0 hover:opacity-100'
                            )}
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
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-border cursor-pointer hover:bg-muted/30"
                  onClick={() =>
                    navigate(
                      `/app/orders/${row.original.orderId}?range=${range === 'all' ? '90d' : range}&tab=all`
                    )
                  }
                >
                  {row.getVisibleCells().map((cell) => {
                    const isLast =
                      row.getVisibleCells().indexOf(cell) === row.getVisibleCells().length - 1;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'align-top border-r border-border px-2 py-1.5 text-sm',
                          isLast && 'last:border-r-0'
                        )}
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
