import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePipelineRevenueRows } from '@/hooks/usePipelineRevenueRows';
import type { RangeKey } from '@/hooks/useOrdersDashboard';
import { cn } from '@/lib/utils';
import { Loader2, ExternalLink, QrCode, Copy, Check } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { QrCodeModal } from '@/components/channels/QrCodeModal';
import { PipelineRow } from '@/hooks/usePipelineRows';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

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

type RoleTab = 'host' | 'collab';
type StatusTab = 'active' | 'payment_pending' | 'paid' | 'inactive';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'today' },
  { key: '7d', label: 'last 7 days' },
  { key: '30d', label: 'last 30 days' },
  { key: '90d', label: 'last 90 days' },
];

export default function PipelineRevenuePage() {
  const { currentOrg } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const rangeParam = searchParams.get('range') as RangeKey | null;
  const initialRange: RangeKey =
    rangeParam && ['today', '7d', '30d', '90d'].includes(rangeParam) ? rangeParam : '30d';
  const [selectedRange, setSelectedRange] = useState<RangeKey>(initialRange);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('range', selectedRange);
    setSearchParams(params, { replace: true });
  }, [selectedRange, searchParams, setSearchParams]);

  const [roleTab, setRoleTab] = useState<RoleTab>('host');
  const [statusTab, setStatusTab] = useState<StatusTab>('active');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  
  const { data: pipelines, isLoading, error } = usePipelineRevenueRows({
    mode: roleTab,
    orgId: currentOrg?.id || '',
    rangeKey: selectedRange,
    status: statusTab,
  });
  
  const handleCopyLink = async (slug: string) => {
    const link = `https://www.growbrohk.com/r/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: 'Copied!',
        description: 'Tracking link copied to clipboard',
      });
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'payment_pending':
        return 'secondary';
      case 'paid':
        return 'outline';
      case 'inactive':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-600 text-white';
      case 'payment_pending':
        return 'bg-yellow-500 text-white';
      case 'paid':
        return 'bg-blue-500 text-white';
      case 'inactive':
        return 'bg-gray-300 text-gray-700';
      default:
        return 'bg-gray-300 text-gray-700';
    }
  };

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case 'payment_pending':
        return 'Payment pending';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const pageHeader = (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
        Pipeline Revenue
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
        View revenue and payout lifecycle for pipelines with revenue
      </p>
    </div>
  );

  const rangePillsBlock = (
    <>
      <style>{`
        .pill-filter-container::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div
        className="pill-filter-container flex gap-2.5 flex-nowrap overflow-x-auto"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {RANGE_OPTIONS.map((option) => {
          const isSelected = selectedRange === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setSelectedRange(option.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0',
                'min-h-[36px]',
                isSelected
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </>
  );

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        {pageHeader}
        {rangePillsBlock}
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full space-y-6">
        {pageHeader}
        {rangePillsBlock}
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-sm" style={{ color: '#EF4444' }}>
              Error loading pipeline revenue
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {pageHeader}
      {rangePillsBlock}

      {/* Role Tabs */}
      <Tabs value={roleTab} onValueChange={(value) => setRoleTab(value as RoleTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="host">Host</TabsTrigger>
          <TabsTrigger value="collab">Collab</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Status Subtabs */}
      <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as StatusTab)}>
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="payment_pending">Payment pending</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
        </TabsList>

        <TabsContent value={statusTab} className="mt-4">
          {!pipelines || pipelines.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
                No pipelines found
              </p>
            </div>
          ) : (
            <div className="rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ color: '#0F1F17' }}>Label</TableHead>
                    <TableHead style={{ color: '#0F1F17' }}>Revenue</TableHead>
                    <TableHead style={{ color: '#0F1F17' }}>Orders</TableHead>
                    <TableHead style={{ color: '#0F1F17' }}>Commission rate</TableHead>
                    <TableHead style={{ color: '#0F1F17' }}>
                      {roleTab === 'host' ? 'Affiliate org' : 'Host org'}
                    </TableHead>
                    <TableHead style={{ color: '#0F1F17' }}>Destination</TableHead>
                    <TableHead style={{ color: '#0F1F17' }}>Status</TableHead>
                    <TableHead style={{ color: '#0F1F17' }}>Link</TableHead>
                    <TableHead style={{ color: '#0F1F17' }}>QR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipelines.map((pipeline) => (
                    <TableRow key={pipeline.tracking_link_id}>
                      <TableCell style={{ color: '#0F1F17' }}>{pipeline.label}</TableCell>
                      <TableCell style={{ color: '#0F1F17' }}>
                        {formatHKD(pipeline.revenue)}
                      </TableCell>
                      <TableCell style={{ color: '#0F1F17' }}>
                        {pipeline.orders.toLocaleString()}
                      </TableCell>
                      <TableCell style={{ color: '#0F1F17' }}>
                        {(pipeline.type === 'affiliate' || pipeline.type === 'collab') && pipeline.commission_rate !== null
                          ? `${(pipeline.commission_rate * 100).toFixed(1)}%`
                          : '—'}
                      </TableCell>
                      <TableCell style={{ color: '#0F1F17' }}>
                        {roleTab === 'host' 
                          ? (pipeline.affiliate_org_name || '—')
                          : (pipeline.host_org_name || '—')}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const isCustomUrl = pipeline.destination_type === 'custom';
                          const isEvent = pipeline.destination_type === 'event';
                          const isProduct = pipeline.destination_type === 'product';

                          let displayText: string;
                          if (isEvent && pipeline.event_title) {
                            displayText = pipeline.event_title;
                          } else if (isProduct && pipeline.product_title) {
                            displayText = pipeline.product_title;
                          } else {
                            displayText = pipeline.destination_url.length > 40 
                              ? `${pipeline.destination_url.substring(0, 40)}...` 
                              : pipeline.destination_url;
                          }

                          if (isCustomUrl) {
                            return (
                              <a
                                href={pipeline.destination_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm hover:underline"
                                style={{ color: '#0E7A3A' }}
                              >
                                {displayText}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            );
                          }

                          return (
                            <a
                              href={pipeline.destination_url}
                              className="inline-flex items-center gap-1 text-sm hover:underline"
                              style={{ color: '#0E7A3A' }}
                            >
                              {displayText}
                            </a>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getStatusBadgeVariant(pipeline.status)}
                          className={getStatusBadgeStyle(pipeline.status)}
                        >
                          {formatStatusLabel(pipeline.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyLink(pipeline.slug)}
                                className="h-7 px-2"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Copy link</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSlug(pipeline.slug);
                            setQrModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1"
                        >
                          <QrCode className="h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

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
