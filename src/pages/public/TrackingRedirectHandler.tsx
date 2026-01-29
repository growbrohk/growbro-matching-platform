import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

const CLICK_TRACK_TIMEOUT_MS = 1500;

/**
 * Tracking Redirect Handler
 * Handles /r/:slug routes:
 * 1. Looks up tracking_links by slug where status='active'
 * 2. Inserts click record into tracking_clicks
 * 3. Redirects to destination_url with ?tid=<tracking_link_id> appended
 */
export default function TrackingRedirectHandler() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    async function handleRedirect() {
      if (!slug) {
        // Invalid slug, redirect to homepage
        navigate('/', { replace: true });
        return;
      }

      try {
        // 1. Look up tracking link by slug
        // Use maybeSingle() instead of single() to avoid 406 errors when RLS blocks access
        const { data: trackingLink, error: lookupError } = await (supabase.from('tracking_links' as any) as any)
          .select('id, destination_url')
          .eq('slug', String(slug))
          .eq('status', 'active')
          .maybeSingle();

        if (lookupError) {
          // Query error, log and redirect
          console.error('Error looking up tracking link:', lookupError);
          navigate('/', { replace: true });
          return;
        }

        if (!trackingLink) {
          // Tracking link not found or inactive, redirect to homepage
          console.warn('Tracking link not found:', slug);
          navigate('/', { replace: true });
          return;
        }

        // 2. Log the click (blocking - wait for it to complete before redirecting)
        const referrer = document.referrer || null;
        const userAgent = navigator.userAgent || null;

        // Ensure Supabase client is ready and wait for click to be logged
        if (supabase) {
          try {
            // Wait for the insert to complete (with timeout)
            const insertPromise = (supabase.from('tracking_clicks' as any) as any)
              .insert({
                tracking_link_id: trackingLink.id,
                referrer,
                user_agent: userAgent,
              });

            const timeoutPromise = new Promise((resolve) => {
              setTimeout(() => resolve({ error: { message: 'Timeout' } }), CLICK_TRACK_TIMEOUT_MS);
            });

            const result: any = await Promise.race([insertPromise, timeoutPromise]);
            
            if (result?.error) {
              if (result.error.message === 'Timeout') {
                console.warn(`Click logging timed out after ${CLICK_TRACK_TIMEOUT_MS}ms, redirecting anyway`);
              } else {
                console.error('Failed to log tracking click:', result.error);
                console.error('Error details:', {
                  tracking_link_id: trackingLink.id,
                  referrer,
                  userAgent,
                  error: result.error,
                });
              }
            } else {
              console.log('✓ Click tracked successfully for slug:', slug);
            }
          } catch (err) {
            console.error('Exception logging tracking click:', err);
            // Continue with redirect even if click logging fails
          }
        } else {
          console.warn('Supabase client not initialized, skipping click tracking');
        }

        // 3. Build redirect URL with tid parameter
        const destinationUrl = new URL(trackingLink.destination_url, window.location.origin);
        const tid = trackingLink.id;

        // Append tid parameter
        destinationUrl.searchParams.set('tid', tid);

        // 4. Redirect (302) - only after click logging attempt completes
        window.location.href = destinationUrl.toString();
      } catch (err) {
        console.error('Error handling tracking redirect:', err);
        // On any error, redirect to homepage
        navigate('/', { replace: true });
      }
    }

    void handleRedirect();
  }, [slug, navigate]);

  // Show loading state while processing
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FBF8F4' }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0E7A3A' }} />
    </div>
  );
}
