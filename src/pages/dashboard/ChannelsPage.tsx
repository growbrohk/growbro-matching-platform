import { useState } from 'react';
import { useChannelRows } from '@/hooks/useChannelRows';
import { Loader2, ExternalLink, QrCode } from 'lucide-react';
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
import { QrCodeModal } from '@/components/channels/QrCodeModal';

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

export default function ChannelsPage() {
  const { data: channels, isLoading, error } = useChannelRows();
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => (
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
              </TableRow>
            ))}
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
    </div>
  );
}
