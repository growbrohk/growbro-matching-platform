import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePipelineRows } from '@/hooks/usePipelineRows';
import type { RangeKey } from '@/hooks/useOrdersDashboard';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ExternalLink, QrCode, Pencil, Search, ArrowUpDown, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { QrCodeModal } from '@/components/channels/QrCodeModal';
import { EditChannelModal } from '@/components/channels/EditChannelModal';
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

/**
 * Normalize URL for display in group headers
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname;
  } catch {
    return url.length > 50 ? `${url.substring(0, 50)}...` : url;
  }
}

type SortKey = 'clicks' | 'orders' | 'revenue';
type SortDirection = 'asc' | 'desc';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'today' },
  { key: '7d', label: 'last 7 days' },
  { key: '30d', label: 'last 30 days' },
  { key: '90d', label: 'last 90 days' },
];

// Grouped data structure
interface DestinationKeyGroup {
  destinationKey: string; // event_id, product_id, or normalized URL
  destinationTitle: string; // event title, product title, or normalized URL
  pipelines: PipelineRow[]; // Direct array of pipelines, sorted
  totalActive: number;
}

interface DestinationTypeGroup {
  destinationType: 'event' | 'product' | 'custom';
  destinationKeys: DestinationKeyGroup[];
  totalActive: number;
}

export default function PipelinePage() {
  const { currentOrg } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get mode from URL query param, default to 'host'
  const modeParam = searchParams.get('mode');
  const mode: 'host' | 'collab' = (modeParam === 'collab' ? 'collab' : 'host');

  const rangeParam = searchParams.get('range') as RangeKey | null;
  const initialRange: RangeKey =
    rangeParam && ['today', '7d', '30d', '90d'].includes(rangeParam) ? rangeParam : '30d';
  const [selectedRange, setSelectedRange] = useState<RangeKey>(initialRange);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('range', selectedRange);
    setSearchParams(params, { replace: true });
  }, [selectedRange, searchParams, setSearchParams]);

  const { data: pipelines, isLoading, error } = usePipelineRows({
    mode,
    orgId: currentOrg?.id || '',
    rangeKey: selectedRange,
  });
  
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineRow | null>(null);
  
  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Expansion state
  const [expandedTypeKeys, setExpandedTypeKeys] = useState<Set<string>>(new Set(['event', 'product', 'custom'])); // Default expanded
  const [expandedDestKeys, setExpandedDestKeys] = useState<Set<string>>(new Set()); // Default collapsed - empty set

  const handleEditClick = (pipeline: PipelineRow) => {
    setSelectedPipeline(pipeline);
    setEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-rows'] });
  };

  const handleCopyLink = async (slug: string) => {
    const link = `${window.location.origin}/r/${slug}`;
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

  // Filter pipelines by search query
  const filteredPipelines = useMemo(() => {
    if (!pipelines) return [];

    if (!searchQuery.trim()) return pipelines;

    const query = searchQuery.toLowerCase().trim();
    return pipelines.filter((p) => {
      const labelMatch = p.label?.toLowerCase().includes(query) ?? false;
      const slugMatch = p.slug?.toLowerCase().includes(query) ?? false;
      const destinationMatch = p.destination_url?.toLowerCase().includes(query) ?? false;
      const eventMatch = p.event_title?.toLowerCase().includes(query) ?? false;
      const productMatch = p.product_title?.toLowerCase().includes(query) ?? false;
      const affiliateMatch = p.affiliate_org_name?.toLowerCase().includes(query) ?? false;
      return labelMatch || slugMatch || destinationMatch || eventMatch || productMatch || affiliateMatch;
    });
  }, [pipelines, searchQuery]);

  // Group pipelines into 2-level hierarchy
  const groupedData = useMemo(() => {
    if (!filteredPipelines || filteredPipelines.length === 0) return [];

    // Sort pipelines first
    const sortedPipelines = [...filteredPipelines].sort((a, b) => {
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

    // Group by destination_type
    const byType = new Map<'event' | 'product' | 'custom', PipelineRow[]>();
    sortedPipelines.forEach((p) => {
      const type = p.destination_type;
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(p);
    });

    // Build grouped structure
    const typeGroups: DestinationTypeGroup[] = [];

    (['event', 'product', 'custom'] as const).forEach((destType) => {
      const typePipelines = byType.get(destType) || [];
      if (typePipelines.length === 0) return;

      // Group by destination key
      const byDestKey = new Map<string, PipelineRow[]>();
      typePipelines.forEach((p) => {
        let key: string;

        if (destType === 'event' && p.event_id) {
          key = p.event_id;
        } else if (destType === 'product' && p.product_id) {
          key = p.product_id;
        } else {
          key = normalizeUrl(p.destination_url);
        }

        const destKey = `${destType}-${key}`;
        if (!byDestKey.has(destKey)) {
          byDestKey.set(destKey, []);
        }
        byDestKey.get(destKey)!.push(p);
      });

      // Build destination key groups - pipelines are already sorted
      const destKeyGroups: DestinationKeyGroup[] = [];
      byDestKey.forEach((destPipelines, destKey) => {
        const firstPipeline = destPipelines[0];
        const destTitle = destType === 'event' 
          ? (firstPipeline.event_title || firstPipeline.event_id || 'Unknown Event')
          : destType === 'product'
          ? (firstPipeline.product_title || firstPipeline.product_id || 'Unknown Product')
          : normalizeUrl(firstPipeline.destination_url);

        destKeyGroups.push({
          destinationKey: destKey,
          destinationTitle: destTitle,
          pipelines: destPipelines, // Direct array, already sorted
          totalActive: destPipelines.length,
        });
      });

      typeGroups.push({
        destinationType: destType,
        destinationKeys: destKeyGroups,
        totalActive: typePipelines.length,
      });
    });

    return typeGroups;
  }, [filteredPipelines, sortKey, sortDirection]);

  // Calculate total active pipelines
  const totalActivePipelines = useMemo(() => {
    return pipelines?.length || 0;
  }, [pipelines]);

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const toggleTypeExpansion = (typeKey: string) => {
    setExpandedTypeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(typeKey)) {
        next.delete(typeKey);
      } else {
        next.add(typeKey);
      }
      return next;
    });
  };

  const toggleDestExpansion = (destKey: string) => {
    setExpandedDestKeys((prev) => {
      const next = new Set(prev);
      if (next.has(destKey)) {
        next.delete(destKey);
      } else {
        next.add(destKey);
      }
      return next;
    });
  };

  const pageHeader = (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ fontFamily: "'Inter Tight', sans-serif", color: '#0F1F17' }}>
        {mode === 'collab' ? 'Collab Pipelines' : 'Pipelines'}
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'rgba(15,31,23,0.72)' }}>
        {mode === 'collab' ? 'Affiliate pipelines overview' : 'Pipelines overview'}
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
              Error loading pipelines
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgba(15,31,23,0.6)' }}>
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!pipelines || pipelines.length === 0) {
    return (
      <div className="w-full space-y-6">
        {pageHeader}
        {rangePillsBlock}
        <div className="py-12 text-center">
          <p className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
            {mode === 'collab' ? 'No collab pipelines found' : 'No pipelines found'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {pageHeader}
      {rangePillsBlock}

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

      {/* Sort Controls */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm font-medium shrink-0" style={{ color: 'rgba(15,31,23,0.72)' }}>
          Sort by:
        </span>
        <div className="min-w-0 overflow-x-auto whitespace-nowrap">
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
      </div>

      {/* Results Count */}
      <div className="text-sm" style={{ color: 'rgba(15,31,23,0.6)' }}>
        Showing {filteredPipelines.length} of {totalActivePipelines} active pipelines
      </div>

      {/* Grouped Table */}
      <div className="rounded-lg border" style={{ borderColor: 'rgba(14,122,58,0.14)', backgroundColor: 'rgba(251,248,244,0.9)' }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ color: '#0F1F17' }}>Label</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Revenue</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Orders</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Clicks</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Destination</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>{mode === 'collab' ? 'Host org' : 'Affiliate org'}</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Commission rate</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Link</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>QR Code</TableHead>
              <TableHead style={{ color: '#0F1F17' }}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8" style={{ color: 'rgba(15,31,23,0.6)' }}>
                  No pipelines match your search
                </TableCell>
              </TableRow>
            ) : (
              groupedData.map((typeGroup) => {
                const typeKey = typeGroup.destinationType;
                const isTypeExpanded = expandedTypeKeys.has(typeKey);
                const typeLabel = typeKey === 'event' ? 'Event' : typeKey === 'product' ? 'Product' : 'Custom URL';
                const typeCount = typeGroup.totalActive;

                return (
                  <React.Fragment key={`type-${typeKey}`}>
                    {/* Level 1: Destination Type Header */}
                    <TableRow className="bg-gray-50">
                      <TableCell colSpan={10} className="py-2">
                        <button
                          onClick={() => toggleTypeExpansion(typeKey)}
                          className="flex items-center gap-2 w-full text-left font-semibold"
                          style={{ color: '#0F1F17' }}
                        >
                          {isTypeExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <span>{typeLabel}</span>
                          <Badge variant="secondary" className="ml-2">
                            {typeCount}
                          </Badge>
                        </button>
                      </TableCell>
                    </TableRow>

                    {isTypeExpanded && typeGroup.destinationKeys.map((destGroup) => (
                      <React.Fragment key={`dest-${destGroup.destinationKey}`}>
                        {/* Level 2: Destination Key Header */}
                        <TableRow className="bg-gray-100">
                          <TableCell colSpan={10} className="py-2 pl-8">
                            <button
                              onClick={() => toggleDestExpansion(destGroup.destinationKey)}
                              className="flex items-center gap-2 w-full text-left font-medium"
                              style={{ color: '#0F1F17' }}
                            >
                              {expandedDestKeys.has(destGroup.destinationKey) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <span>{destGroup.destinationTitle}</span>
                              <Badge variant="outline" className="ml-2">
                                {destGroup.totalActive}
                              </Badge>
                            </button>
                          </TableCell>
                        </TableRow>

                        {/* Leaf Rows: Actual Pipelines - rendered directly under destination key */}
                        {expandedDestKeys.has(destGroup.destinationKey) && destGroup.pipelines.map((pipeline) => (
                          <TableRow key={pipeline.tracking_link_id}>
                            <TableCell style={{ color: '#0F1F17' }}>{pipeline.label}</TableCell>
                            <TableCell style={{ color: '#0F1F17' }}>{formatHKD(pipeline.revenue)}</TableCell>
                            <TableCell style={{ color: '#0F1F17' }}>{pipeline.orders.toLocaleString()}</TableCell>
                            <TableCell style={{ color: '#0F1F17' }}>{pipeline.clicks.toLocaleString()}</TableCell>
                            <TableCell>
                              {(() => {
                                // Determine display text based on destination_type
                                let displayText: string;
                                const isCustomUrl = pipeline.destination_type === 'custom';
                                const isEvent = pipeline.destination_type === 'event';
                                const isProduct = pipeline.destination_type === 'product';

                                if (isEvent && pipeline.event_title) {
                                  displayText = pipeline.event_title;
                                } else if (isProduct && pipeline.product_title) {
                                  displayText = pipeline.product_title;
                                } else {
                                  // Fallback to destination_url for custom URLs or when names are missing
                                  displayText = pipeline.destination_url.length > 40 
                                    ? `${pipeline.destination_url.substring(0, 40)}...` 
                                    : pipeline.destination_url;
                                }

                                // For custom URLs, use external link behavior
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

                                // For events and products, use internal link (no target="_blank")
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
                            <TableCell style={{ color: '#0F1F17' }}>
                              {mode === 'collab' 
                                ? (pipeline.host_org_name || '—')
                                : (pipeline.type === 'affiliate' ? (pipeline.affiliate_org_name || '—') : '—')
                              }
                            </TableCell>
                            <TableCell style={{ color: '#0F1F17' }}>
                              {pipeline.type === 'affiliate' && pipeline.commission_rate !== null
                                ? `${(pipeline.commission_rate * 100).toFixed(1)}%`
                                : '—'}
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
                            <TableCell>
                              <Badge
                                variant={pipeline.status === 'active' ? 'default' : 'secondary'}
                                className={
                                  pipeline.status === 'active'
                                    ? 'bg-green-600 text-white'
                                    : 'bg-gray-300 text-gray-700'
                                }
                              >
                                {pipeline.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                );
              })
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

      {/* Edit Pipeline Modal */}
      {selectedPipeline && (
        <EditChannelModal
          open={editModalOpen}
          onOpenChange={(open) => {
            setEditModalOpen(open);
            if (!open) {
              setSelectedPipeline(null);
            }
          }}
          channel={selectedPipeline as any}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
