import { useState, useMemo } from 'react';
import { useChannelRows } from '@/hooks/useChannelRows';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ExternalLink, QrCode, Pencil, Search, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCodeModal } from '@/components/channels/QrCodeModal';
import { EditChannelModal } from '@/components/channels/EditChannelModal';
import { ChannelRow } from '@/hooks/useChannelRows';
import { ChannelsFilterDrawer } from '@/components/channels/ChannelsFilterDrawer';

/**
 * Format money as HKD currency
 */
function formatHKD(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded % 1 === 0) {
    return `HK$${rounded.toLocaleString()}`;
  }
  return `HK$${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type SortKey = 'clicks' | 'orders' | 'revenue';
type SortDirection = 'asc' | 'desc';
type CollabPartnerFilter = 'all' | 'without' | 'with';
type QrCodeFilter = 'all' | 'with' | 'without';
type StatusFilter = 'all' | 'active' | 'inactive';

export default function ChannelsPage() {
  const { data: channels, isLoading, error } = useChannelRows();
  const queryClient = useQueryClient();
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelRow | null>(null);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [collabPartnerFilter, setCollabPartnerFilter] = useState<CollabPartnerFilter>('all');
  const [qrCodeFilter, setQrCodeFilter] = useState<QrCodeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (collabPartnerFilter !== 'all') count++;
    if (qrCodeFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    return count;
  }, [collabPartnerFilter, qrCodeFilter, statusFilter]);

  const handleEditClick = (channel: ChannelRow) => {
    setSelectedChannel(channel);
    setEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    // Invalidate and refetch channel data
    queryClient.invalidateQueries({ queryKey: ['channel-rows'] });
  };

  // Filter and sort channels client-side
  const filteredAndSortedChannels = useMemo(() => {
    if (!channels) return [];

    let filtered = [...channels];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((channel) => {
        const labelMatch = channel.label?.toLowerCase().includes(query) ?? false;
        const slugMatch = channel.slug?.toLowerCase().includes(query) ?? false;
        const destinationMatch = channel.destination_url?.toLowerCase().includes(query) ?? false;
        const collabMatch = channel.collab_partner_name?.toLowerCase().includes(query) ?? false;
        return labelMatch || slugMatch || destinationMatch || collabMatch;
      });
    }

    // Apply collab partner filter
    if (collabPartnerFilter === 'without') {
      filtered = filtered.filter(
        (channel) => !channel.collab_partner_org_id && !channel.collab_partner_name
      );
    } else if (collabPartnerFilter === 'with') {
      filtered = filtered.filter(
        (channel) => !!channel.collab_partner_org_id || !!channel.collab_partner_name
      );
    }

    // Apply QR code filter
    if (qrCodeFilter === 'with') {
      filtered = filtered.filter((channel) => channel.qr_enabled === true);
    } else if (qrCodeFilter === 'without') {
      filtered = filtered.filter((channel) => channel.qr_enabled === false);
    }

    // Apply status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter((channel) => channel.status === 'active');
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter((channel) => channel.status === 'inactive');
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: number = 0;
      let bValue: number = 0;

      switch (sortKey) {
        case 'clicks':
          aValue = a.clicks ?? 0;
          bValue = b.clicks ?? 0;
          break;
        case 'orders':
          aValue = a.orders ?? 0;
          bValue = b.orders ?? 0;
          break;
        case 'revenue':
          aValue = a.revenue ?? 0;
          bValue = b.revenue ?? 0;
          break;
      }

      if (sortDirection === 'desc') {
        return bValue - aValue;
      } else {
        return aValue - bValue;
      }
    });

    return filtered;
  }, [channels, searchQuery, sortKey, sortDirection, collabPartnerFilter, qrCodeFilter, statusFilter]);

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      // Toggle direction if clicking the same sort key
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // Set new sort key with default desc direction
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-sm" style={{ color: '#EF4444' }}>
            Error loading channels
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  if (!channels || channels.length === 0) {
    return (
      <div className="w-full space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
            Channels
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Tracking channels overview
          </p>
        </div>
        <div className="py-12 text-center">
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
            No channels found
          </p>
        </div>
      </div>
    );
  }

  const totalChannels = channels.length;

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
          Channels
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Tracking channels overview
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" style={{ color: 'rgba(15,31,23,0.6)' }} />
        <Input
          type="text"
          placeholder="Search event / product / link…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Sort and Filter Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Sort Tabs */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'rgba(15,31,23,0.72)' }}>
            Sort by:
          </span>
          <div className="inline-flex items-center gap-0 rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)', padding: '2px' }}>
            <Button
              type="button"
              variant={sortKey === 'clicks' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleSortClick('clicks')}
              className={`h-8 px-3 text-xs rounded-md ${sortKey === 'clicks' ? '' : 'hover:bg-transparent'}`}
            >
              Clicks
              {sortKey === 'clicks' && (
                <ArrowUpDown className={`h-3 w-3 ml-1 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
              )}
            </Button>
            <Button
              type="button"
              variant={sortKey === 'orders' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleSortClick('orders')}
              className={`h-8 px-3 text-xs rounded-md ${sortKey === 'orders' ? '' : 'hover:bg-transparent'}`}
            >
              Orders
              {sortKey === 'orders' && (
                <ArrowUpDown className={`h-3 w-3 ml-1 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
              )}
            </Button>
            <Button
              type="button"
              variant={sortKey === 'revenue' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleSortClick('revenue')}
              className={`h-8 px-3 text-xs rounded-md ${sortKey === 'revenue' ? '' : 'hover:bg-transparent'}`}
            >
              Revenue
              {sortKey === 'revenue' && (
                <ArrowUpDown className={`h-3 w-3 ml-1 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
              )}
            </Button>
          </div>
        </div>

        {/* Filter Button */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFilterDrawerOpen(true)}
            className="relative h-8 px-3"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="ml-2">Filter</span>
            {activeFilterCount > 0 && (
              <Badge
                variant="default"
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                style={{ backgroundColor: '#0E7A3A', color: 'white' }}
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
        Showing {filteredAndSortedChannels.length} of {totalChannels}
      </div>

      {/* Table */}
      <div className="rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ color: '#0F1F17' }}>Label</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Clicks</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Orders</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Revenue</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Destination</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>QR code</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Collab partner</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Status</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedChannels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8" style={{ color: 'rgba(15,31,23,0.6)' }}>
                  No channels match your search and filters
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedChannels.map((channel) => (
              <TableRow key={channel.tracking_link_id}>
                <TableCell style={{ color: '#0F1F17' }}>{channel.label}</TableCell>
                <TableCell style={{ color: '#0F1F17' }}>{channel.clicks.toLocaleString()}</TableCell>
                <TableCell style={{ color: '#0F1F17' }}>{channel.orders.toLocaleString()}</TableCell>
                <TableCell style={{ color: '#0F1F17' }}>{formatHKD(channel.revenue)}</TableCell>
                <TableCell>
                  <a
                    href={channel.destination_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm hover:underline"
                    style={{ color: '#0E7A3A' }}
                  >
                    {channel.destination_url.length > 40 
                      ? `${channel.destination_url.substring(0, 40)}...` 
                      : channel.destination_url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
                <TableCell>
                  {channel.qr_enabled ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSlug(channel.slug);
                        setQrModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1"
                    >
                      <QrCode className="h-4 w-4" />
                      View
                    </Button>
                  ) : (
                    <span style={{ color: '#0F1F17' }}>—</span>
                  )}
                </TableCell>
                <TableCell style={{ color: '#0F1F17' }}>
                  {channel.collab_partner_name || '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={channel.status === 'active' ? 'default' : 'secondary'}
                    className={
                      channel.status === 'active'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-300 text-gray-700'
                    }
                  >
                    {channel.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditClick(channel)}
                    className="inline-flex items-center gap-1"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* QR Code Modal */}
      {selectedSlug && (
        <QrCodeModal
          open={qrModalOpen}
          onOpenChange={(open) => {
            setQrModalOpen(open);
            if (!open) {
              setSelectedSlug(null);
            }
          }}
          slug={selectedSlug}
        />
      )}

      {/* Edit Channel Modal */}
      {selectedChannel && (
        <EditChannelModal
          open={editModalOpen}
          onOpenChange={(open) => {
            setEditModalOpen(open);
            if (!open) {
              setSelectedChannel(null);
            }
          }}
          channel={selectedChannel}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Filter Drawer */}
      <ChannelsFilterDrawer
        open={filterDrawerOpen}
        onOpenChange={setFilterDrawerOpen}
        collabPartnerFilter={collabPartnerFilter}
        qrCodeFilter={qrCodeFilter}
        statusFilter={statusFilter}
        onApply={(collabPartner, qrCode, status) => {
          setCollabPartnerFilter(collabPartner);
          setQrCodeFilter(qrCode);
          setStatusFilter(status);
          setFilterDrawerOpen(false);
        }}
      />
    </div>
  );
}
