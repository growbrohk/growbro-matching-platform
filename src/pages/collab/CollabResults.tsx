import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ChevronDown, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useTypeDefinitions } from '@/hooks/use-type-definitions';
import { mapSpaceUiTypeToCategories } from '@/lib/api/type-definitions';
import type { PosterSpace } from '@/lib/api/poster-spaces';
import type { TypeDefinition } from '@/lib/api/type-definitions';

interface SpaceResult extends PosterSpace {
  org_name?: string;
  org_slug?: string;
}

const FALLBACK_SPACE_TYPES: TypeDefinition[] = [
  { id: '1', domain: 'space_type', value: 'consignment', label: 'Consignment', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['consignment_shelf', 'shelf', 'booth', 'counter'], sort_order: 1, active: true, created_at: '', updated_at: '' },
  { id: '2', domain: 'space_type', value: 'promotion', label: 'Promotion', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['poster_space', 'cup_sleeve_promotion'], sort_order: 2, active: true, created_at: '', updated_at: '' },
  { id: '3', domain: 'space_type', value: 'event', label: 'Event Hosting', parent_domain: null, parent_value: null, db_table: 'poster_spaces', db_column: 'category', db_values: ['event_hosting'], sort_order: 3, active: true, created_at: '', updated_at: '' },
];

const FALLBACK_PROMOTION_TYPES: TypeDefinition[] = [
  { id: '6', domain: 'promotion_type', value: 'poster', label: 'Poster', parent_domain: 'space_type', parent_value: 'promotion', db_table: 'poster_spaces', db_column: 'category', db_values: ['poster_space'], sort_order: 1, active: true, created_at: '', updated_at: '' },
  { id: '7', domain: 'promotion_type', value: 'cupsleeve', label: 'Cupsleeve', parent_domain: 'space_type', parent_value: 'promotion', db_table: 'poster_spaces', db_column: 'category', db_values: ['cup_sleeve_promotion'], sort_order: 2, active: true, created_at: '', updated_at: '' },
];

export default function CollabResults() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Parse query params
  const tab = searchParams.get('tab') || 'space';
  const location = searchParams.get('location') || '';
  const startDateStr = searchParams.get('start') || '';
  const endDateStr = searchParams.get('end') || '';
  const typesStr = searchParams.get('types') || '';
  const promoTypesStr = searchParams.get('promoTypes') || '';

  const selectedSpaceTypes = useMemo(() => {
    return typesStr ? typesStr.split(',').filter(Boolean) : [];
  }, [typesStr]);

  const selectedPromoTypes = useMemo(() => {
    return promoTypesStr ? promoTypesStr.split(',').filter(Boolean) : [];
  }, [promoTypesStr]);

  const [spaces, setSpaces] = useState<SpaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgMap, setOrgMap] = useState<Record<string, { name: string; slug?: string }>>({});

  // Fetch type definitions
  const { typeDefinitions: spaceTypes } = useTypeDefinitions({
    domain: 'space_type',
    fallback: FALLBACK_SPACE_TYPES,
  });

  const { typeDefinitions: promoTypes } = useTypeDefinitions({
    domain: 'promotion_type',
    parent_domain: 'space_type',
    parent_value: 'promotion',
    fallback: FALLBACK_PROMOTION_TYPES,
  });

  // Combine all type definitions for mapping
  const allTypeDefinitions = useMemo(() => {
    return [...spaceTypes, ...promoTypes];
  }, [spaceTypes, promoTypes]);

  // Compute categories from UI types
  const categories = useMemo(() => {
    if (tab !== 'space' || selectedSpaceTypes.length === 0) {
      return [];
    }
    return mapSpaceUiTypeToCategories(selectedSpaceTypes, selectedPromoTypes, allTypeDefinitions);
  }, [tab, selectedSpaceTypes, selectedPromoTypes, allTypeDefinitions]);

  // Format date range
  const formattedDateRange = useMemo(() => {
    if (!startDateStr && !endDateStr) {
      return 'Any dates';
    }
    try {
      if (startDateStr && endDateStr) {
        const start = parseISO(startDateStr);
        const end = parseISO(endDateStr);
        return `${format(start, 'EEE, d MMM')} - ${format(end, 'EEE, d MMM')}`;
      } else if (startDateStr) {
        const start = parseISO(startDateStr);
        return `From ${format(start, 'EEE, d MMM')}`;
      } else if (endDateStr) {
        const end = parseISO(endDateStr);
        return `Until ${format(end, 'EEE, d MMM')}`;
      }
    } catch (e) {
      console.error('Error formatting dates:', e);
    }
    return 'Any dates';
  }, [startDateStr, endDateStr]);

  // Fetch spaces
  useEffect(() => {
    if (tab !== 'space') {
      setLoading(false);
      return;
    }

    async function fetchSpaces() {
      try {
        setLoading(true);

        // Build query
        let query = supabase
          .from('poster_spaces')
          .select('*')
          .eq('status', 'published');

        // Apply category filter if categories exist
        if (categories.length > 0) {
          query = query.in('category', categories);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching spaces:', error);
          return;
        }

        const spacesData = (data || []) as PosterSpace[];

        // Collect unique org_ids
        const orgIds = [...new Set(spacesData.map((s) => s.org_id))];

        // Fetch org names and slugs
        const orgMapData: Record<string, { name: string; slug?: string }> = {};
        if (orgIds.length > 0) {
          const { data: orgsData, error: orgsError } = await supabase
            .from('orgs')
            .select('id, name, slug')
            .in('id', orgIds);

          if (!orgsError && orgsData) {
            orgsData.forEach((org) => {
              orgMapData[org.id] = {
                name: org.name,
                slug: org.slug || undefined,
              };
            });
          }
        }

        setOrgMap(orgMapData);

        // Combine spaces with org info
        const spacesWithOrg: SpaceResult[] = spacesData.map((space) => ({
          ...space,
          org_name: orgMapData[space.org_id]?.name,
          org_slug: orgMapData[space.org_id]?.slug,
        }));

        setSpaces(spacesWithOrg);
      } catch (error) {
        console.error('Error fetching spaces:', error);
      } finally {
        setLoading(false);
      }
    }

    void fetchSpaces();
  }, [tab, categories]);

  const handleSpaceClick = (space: SpaceResult) => {
    if (space.short_code) {
      const url = space.org_slug
        ? `/space/${space.short_code}-${space.org_slug}`
        : `/space/${space.short_code}`;
      navigate(url);
    }
  };

  const handleOrgClick = (e: React.MouseEvent, space: SpaceResult) => {
    e.stopPropagation();
    if (space.org_slug) {
      navigate(`/profile/${space.org_slug}`);
    } else if (space.org_name) {
      // Fallback: generate slug from org name if slug is missing
      // This handles cases where orgs don't have slugs yet
      const generatedSlug = space.org_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (generatedSlug) {
        navigate(`/profile/${generatedSlug}`);
      }
    }
  };

  // Extract rate and listing fee from space
  const getRateAndFee = (space: SpaceResult) => {
    // Use default_host_split_percent from space (fallback to 10 if missing)
    const percent = space.default_host_split_percent ?? 10;
    const rate = `${percent}%`;

    // Format listing fee: integer dollars if divisible by 100, else 2 decimals
    const listingFeeCents = space.listing_fee_cents ?? 0;
    const listingFeeDollars = listingFeeCents / 100;
    const bookingUnit = space.booking_unit || 'week';
    
    // Capitalize first letter of booking unit
    const unitDisplay = bookingUnit.charAt(0).toUpperCase() + bookingUnit.slice(1);
    
    const listingFeeAmount = listingFeeCents % 100 === 0
      ? listingFeeDollars.toFixed(0)
      : listingFeeDollars.toFixed(2);
    
    const listingFee = `HK$${listingFeeAmount}/${unitDisplay}`;

    return { rate, listingFee };
  };

  if (tab === 'brand') {
    return (
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full shrink-0"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {location || 'Anywhere'} ({spaces.length})
                </div>
                <div className="text-xs text-gray-500">{formattedDateRange}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center text-gray-500">
            <p className="text-lg">Brand results coming soon</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Agoda-style Header */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0 bg-gray-50 rounded-full px-4 py-2.5">
              <div className="text-sm font-medium text-gray-900 truncate">
                {location || 'Anywhere'} ({loading ? '...' : spaces.length})
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{formattedDateRange}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="border-b">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-around py-3">
            <Button variant="ghost" className="text-sm text-gray-700">
              Filters <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
            <Button variant="ghost" className="text-sm text-gray-700">
              Price <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
            <Button variant="ghost" className="text-sm text-gray-700">
              Sort <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex gap-3">
                  <Skeleton className="w-24 h-24 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No spaces found matching your criteria.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {spaces.map((space) => {
              const { rate, listingFee } = getRateAndFee(space);
              const photoUrl = space.photos && space.photos.length > 0 ? space.photos[0] : null;

              return (
                <Card
                  key={space.id}
                  className="p-4 rounded-lg border hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleSpaceClick(space)}
                >
                  <div className="flex gap-3">
                    {/* Image */}
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={space.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="text-gray-400 text-xs text-center px-2">
                          No image
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">
                        {space.title}
                      </h3>

                      {/* Description */}
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {space.short_description || 'No description available'}
                      </p>

                      {/* Metrics Row */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-semibold text-green-600">{rate}</span>
                        <span className="text-sm text-gray-500">{listingFee}</span>
                      </div>

                      {/* Host Row */}
                      {space.org_name && (
                        <div className="flex items-center justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-3 text-xs rounded-full bg-gray-50 hover:bg-gray-100 border-gray-200"
                            onClick={(e) => handleOrgClick(e, space)}
                          >
                            {space.org_name}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Placeholder for kebab menu
                            }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

