import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MapPin, Calendar, Loader2, ExternalLink } from 'lucide-react';
import { getPublicPosterSpaceByShortCode, type PosterSpace } from '@/lib/api/poster-spaces';
import { supabase } from '@/integrations/supabase/client';

export default function PublicPosterSpace() {
  const { spaceParam } = useParams<{ spaceParam: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [space, setSpace] = useState<PosterSpace | null>(null);
  const [org, setOrg] = useState<any>(null);
  const [orgProfile, setOrgProfile] = useState<any>(null);

  useEffect(() => {
    if (spaceParam) {
      fetchSpace();
    }
  }, [spaceParam]);

  const fetchSpace = async () => {
    if (!spaceParam) return;

    // Parse shortCode from spaceParam (format: "shortCode" or "shortCode-orgSlug")
    const shortCode = spaceParam.split('-')[0];

    try {
      setLoading(true);
      const result = await getPublicPosterSpaceByShortCode(shortCode);
      if (!result) {
        toast.error('Space not found');
        return;
      }
      setSpace(result.space);
      setOrg(result.org);

      // Optional redirect to canonical URL if slug exists and URL slug mismatches
      if (result.org.slug) {
        const expectedUrl = `/space/${shortCode}-${result.org.slug}`;
        const currentUrl = `/space/${spaceParam}`;
        if (currentUrl !== expectedUrl) {
          navigate(expectedUrl, { replace: true });
          return; // Let redirect happen, will re-render with correct URL
        }
      }

      // Fetch org profile for address/website
      const { data: profile } = await supabase
        .from('org_profiles')
        .select('address, website')
        .eq('org_id', result.org.id)
        .single();
      if (profile) setOrgProfile(profile);
    } catch (error: any) {
      console.error('Error fetching poster space:', error);
      toast.error('Failed to load space');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = () => {
    if (space?.price_cents === null || space?.price_cents === undefined) {
      return 'Pricing: Inquiry';
    }
    const amount = space.price_cents / 100;
    return `From ${space.currency} ${amount} / ${space.booking_unit}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!space || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Not Found</CardTitle>
            <CardDescription>This poster space could not be found</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FBF8F4' }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          {/* Org/Brand Info */}
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-1">{org.name}</h2>
            {orgProfile?.address && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{orgProfile.address}</span>
              </div>
            )}
            {orgProfile?.website && (
              <a
                href={orgProfile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline mt-1"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{orgProfile.website}</span>
              </a>
            )}
          </div>

          {/* Photos */}
          {space.photos && space.photos.length > 0 && (
            <div className="mb-6">
              <img
                src={space.photos[0]}
                alt={space.title}
                className="w-full h-64 md:h-96 object-cover rounded-lg mb-4"
              />
              {space.photos.length > 1 && (
                <div className="grid grid-cols-3 gap-2">
                  {space.photos.slice(1, 4).map((photo, index) => (
                    <img
                      key={index}
                      src={photo}
                      alt={`Photo ${index + 2}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Title & Category */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-2">{space.title}</h1>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Badge variant="secondary" className="capitalize">
                  {space.category}
                </Badge>
                <span className="text-sm capitalize">{space.booking_unit} booking</span>
              </div>
            </div>
          </div>

          {/* Description */}
          {space.short_description && (
            <p className="text-lg text-muted-foreground mb-4">{space.short_description}</p>
          )}

          {/* Bullets */}
          {space.bullets && space.bullets.length > 0 && (
            <ul className="list-disc list-inside space-y-2 mb-4">
              {space.bullets.map((bullet, index) => (
                <li key={index}>{bullet}</li>
              ))}
            </ul>
          )}

          {/* Price */}
          <div className="text-xl font-semibold mb-4">{formatPrice()}</div>

          {/* Allowed Durations */}
          {space.allowed_durations && space.allowed_durations.length > 0 && (
            <div className="text-sm text-muted-foreground mb-6">
              Available durations:{' '}
              {space.allowed_durations
                .map((d) => `${d} ${space.booking_unit}${d > 1 ? 's' : ''}`)
                .join(', ')}
            </div>
          )}
        </div>

        {/* CTA */}
        <Card>
          <CardContent className="pt-6">
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                const shortCode = spaceParam?.split('-')[0] || space.short_code;
                const url = org?.slug 
                  ? `/space/${shortCode}-${org.slug}/request`
                  : `/space/${shortCode}/request`;
                navigate(url);
              }}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Request to book
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

