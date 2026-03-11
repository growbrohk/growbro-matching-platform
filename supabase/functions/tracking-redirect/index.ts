import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CLICK_TRACK_TIMEOUT_MS = 1500;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');

    if (!slug) {
      return Response.redirect('https://growbrohk.com/', 302);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: trackingLink, error: lookupError } = await supabase
      .from('tracking_links')
      .select('id, destination_url')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();

    if (lookupError || !trackingLink) {
      return Response.redirect('https://growbrohk.com/', 302);
    }

    // Log click (non-blocking, with timeout)
    const referrer = req.headers.get('referer') || null;
    const userAgent = req.headers.get('user-agent') || null;

    const insertPromise = supabase.from('tracking_clicks').insert({
      tracking_link_id: trackingLink.id,
      referrer,
      user_agent: userAgent,
    });

    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      setTimeout(() => resolve({ error: { message: 'Timeout' } }), CLICK_TRACK_TIMEOUT_MS);
    });

    await Promise.race([insertPromise, timeoutPromise]);

    // Build destination URL with tid param
    let destinationUrl: URL;
    try {
      destinationUrl = new URL(trackingLink.destination_url, 'https://growbrohk.com');
    } catch {
      return Response.redirect('https://growbrohk.com/', 302);
    }

    destinationUrl.searchParams.set('tid', trackingLink.id);

    return Response.redirect(destinationUrl.toString(), 302);
  } catch (error) {
    console.error('Tracking redirect error:', error);
    return Response.redirect('https://growbrohk.com/', 302);
  }
});
