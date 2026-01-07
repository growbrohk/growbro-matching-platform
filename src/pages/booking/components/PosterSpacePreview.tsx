import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Calendar } from 'lucide-react';
import type { UpsertPosterSpaceInput } from '@/lib/api/poster-spaces';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PosterSpacePreviewProps {
  formData: UpsertPosterSpaceInput;
}

export default function PosterSpacePreview({ formData }: PosterSpacePreviewProps) {
  const { currentOrg } = useAuth();
  const [orgProfile, setOrgProfile] = useState<any>(null);

  useEffect(() => {
    if (currentOrg?.id) {
      // Fetch org profile for address/area
      supabase
        .from('org_profiles')
        .select('address')
        .eq('org_id', currentOrg.id)
        .single()
        .then(({ data }) => {
          if (data) setOrgProfile(data);
        });
    }
  }, [currentOrg?.id]);

  const formatPrice = () => {
    if (formData.price_cents === null || formData.price_cents === undefined) {
      return 'Pricing: Inquiry';
    }
    const amount = formData.price_cents / 100;
    return `From ${formData.currency} ${amount} / ${formData.booking_unit}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview (Public Listing)</CardTitle>
        <CardDescription>This is how your space will appear to the public</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Org/Brand Info */}
        <div>
          <h3 className="font-semibold text-lg">{currentOrg?.name || 'Brand Name'}</h3>
          {orgProfile?.address && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <MapPin className="h-4 w-4" />
              <span>{orgProfile.address}</span>
            </div>
          )}
        </div>

        {/* Photos */}
        {formData.photos && formData.photos.length > 0 && (
          <div className="space-y-2">
            <img
              src={formData.photos[0]}
              alt={formData.title || 'Space preview'}
              className="w-full h-48 object-cover rounded-lg"
            />
            {formData.photos.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {formData.photos.slice(1, 4).map((photo, index) => (
                  <img
                    key={index}
                    src={photo}
                    alt={`Photo ${index + 2}`}
                    className="w-full h-24 object-cover rounded-lg"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Title & Category */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-2">
            <h2 className="text-2xl font-bold">{formData.title || 'Poster Space Title'}</h2>
            <Badge variant="secondary" className="capitalize">
              {formData.category || 'poster'}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {formData.booking_unit && (
              <span className="capitalize">{formData.booking_unit}</span>
            )}{' '}
            booking
          </div>
        </div>

        {/* Description */}
        {formData.short_description && (
          <p className="text-muted-foreground">{formData.short_description}</p>
        )}

        {/* Bullets */}
        {formData.bullets && formData.bullets.length > 0 && (
          <ul className="list-disc list-inside space-y-1 text-sm">
            {formData.bullets.map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
        )}

        {/* Price */}
        <div className="font-semibold">{formatPrice()}</div>

        {/* Allowed Durations */}
        {formData.allowed_durations && formData.allowed_durations.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Available durations:{' '}
            {formData.allowed_durations
              .map((d) => `${d} ${formData.booking_unit}${d > 1 ? 's' : ''}`)
              .join(', ')}
          </div>
        )}

        {/* CTA Button */}
        <Button disabled className="w-full">
          <Calendar className="h-4 w-4 mr-2" />
          Request to book
        </Button>
      </CardContent>
    </Card>
  );
}

