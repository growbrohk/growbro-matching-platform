import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { incrementTrackingScan, getTrackingCampaignByShortCode } from '@/lib/api/collabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function TrackingRedirect() {
  const { shortCode } = useParams<{ shortCode: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shortCode) {
      setError('Invalid tracking code');
      setLoading(false);
      return;
    }

    async function handleRedirect() {
      try {
        // First, verify the campaign exists
        const campaign = await getTrackingCampaignByShortCode(shortCode);
        if (!campaign) {
          setError('Tracking campaign not found');
          setLoading(false);
          return;
        }

        // Increment scan count
        const result = await incrementTrackingScan(shortCode);
        if (!result.success) {
          console.warn('Failed to increment scan count:', result.error);
          // Continue anyway - don't block redirect
        }

        // Redirect based on destination type
        if (result.destination_url) {
          // External URL redirect
          window.location.href = result.destination_url;
          return;
        }

        if (result.destination_type === 'product' && result.destination_id) {
          // Short URL; PublicProductByIdRedirect resolves org slug to canonical path
          navigate(`/products/${result.destination_id}`, { replace: true });
          return;
        }

        if (result.destination_type === 'event' && result.destination_id) {
          // Redirect to event page (if implemented)
          navigate(`/events/${result.destination_id}`, { replace: true });
          return;
        }

        // Fallback: show placeholder page
        setLoading(false);
      } catch (err: any) {
        console.error('Error handling tracking redirect:', err);
        setError('Failed to process tracking link');
        setLoading(false);
      }
    }

    void handleRedirect();
  }, [shortCode, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Tracking Link Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Placeholder page if no redirect destination
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Tracked Link</CardTitle>
          <CardDescription>
            This link has been tracked. Redirect destination not configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tracking code: <code className="font-mono">{shortCode}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

