import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ============================================================================
   ENV VARS
============================================================================ */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/* ============================================================================
   EDGE FUNCTION
============================================================================ */
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Extract orgSlug and eventSlug from path or query params
    // Expected paths:
    // - /s/:orgSlug/:eventSlug (when proxied/rewritten)
    // - /functions/v1/share-event?orgSlug=...&eventSlug=... (direct access)
    let orgSlug: string | null = null;
    let eventSlug: string | null = null;
    let ticketId: string | null = null;
    let ticketSlug: string | null = null;

    // Check if this is a direct function call or a proxied /s/ route
    const isDirectFunctionCall = pathParts.includes('share-event') || pathParts.includes('functions');
    
    if (isDirectFunctionCall) {
      // Direct function call - get params from query string
      orgSlug = url.searchParams.get('orgSlug');
      eventSlug = url.searchParams.get('eventSlug');
      ticketId = url.searchParams.get('ticket');
      ticketSlug = url.searchParams.get('ticketSlug');
      
      // Also support s=orgSlug/eventSlug format
      const sParam = url.searchParams.get('s');
      if (sParam && !orgSlug) {
        const [org, event] = sParam.split('/');
        if (org) orgSlug = org;
        if (event) eventSlug = event;
      }
    } else {
      // Proxied route - extract from path: /s/:orgSlug/:eventSlug
      const sIndex = pathParts.indexOf('s');
      if (sIndex >= 0 && pathParts.length > sIndex + 1) {
        orgSlug = pathParts[sIndex + 1];
        if (pathParts.length > sIndex + 2) {
          eventSlug = pathParts[sIndex + 2];
        }
      }
      
      // Also check query params as fallback
      if (!orgSlug) orgSlug = url.searchParams.get('orgSlug');
      if (!eventSlug) eventSlug = url.searchParams.get('eventSlug');
      ticketId = url.searchParams.get('ticket');
      ticketSlug = url.searchParams.get('ticketSlug');
    }

    if (!orgSlug || !eventSlug) {
      return new Response('Missing orgSlug or eventSlug', { status: 400 });
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch organization
    const { data: org, error: orgError } = await supabase
      .from('orgs')
      .select('id, name, slug, metadata')
      .eq('slug', orgSlug)
      .single();

    if (orgError || !org) {
      return new Response('Organization not found', { status: 404 });
    }

    // Fetch event (metadata used for OG image dimensions)
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(
        'id, title, description, slug, instagram_preview_image_url, og_preview_image_url, metadata, status, updated_at'
      )
      .eq('org_id', org.id)
      .eq('slug', eventSlug)
      .single();

    if (eventError || !event) {
      return new Response('Event not found', { status: 404 });
    }

    // Fetch ticket type if ticket param exists
    let ticketType: any = null;
    if (ticketId) {
      const { data: ticket, error: ticketError } = await supabase
        .from('ticket_types')
        .select('id, name, metadata')
        .eq('id', ticketId)
        .eq('event_id', event.id)
        .single();

      if (!ticketError && ticket) {
        ticketType = ticket;
      }
    } else if (ticketSlug) {
      // If ticketSlug is provided, try to find by slug in metadata
      const { data: tickets, error: ticketError } = await supabase
        .from('ticket_types')
        .select('id, name, metadata')
        .eq('event_id', event.id);

      if (!ticketError && tickets) {
        ticketType = tickets.find(t => (t.metadata as any)?.slug === ticketSlug);
      }
    }

    // Determine OG tags
    const ogTitle = ticketType?.name || event.title || 'Event on Growbro';
    const ogDescription = event.description?.trim() || 'Book now on Growbro';
    // Limit description to 200 chars for OG
    const ogDescriptionShort = ogDescription.length > 200 
      ? ogDescription.substring(0, 197) + '...' 
      : ogDescription;

    const eventMeta =
      event.metadata && typeof event.metadata === 'object'
        ? (event.metadata as Record<string, any>)
        : {};

    // Dimensions for og:image (from upload metadata); optional — improves Facebook/WhatsApp parsers
    let ogImageWidth: number | null = null;
    let ogImageHeight: number | null = null;

    // Determine image: ticket preview > og_preview_image_url (landscape) > instagram preview > org logo > default
    let ogImage = '';
    if (ticketType?.metadata && typeof ticketType.metadata === 'object') {
      const ticketMeta = ticketType.metadata as Record<string, any>;
      ogImage = ticketMeta.preview_image_url || ticketMeta.image_url || '';
      if (
        ogImage &&
        typeof ticketMeta.preview_image_width === 'number' &&
        typeof ticketMeta.preview_image_height === 'number'
      ) {
        ogImageWidth = ticketMeta.preview_image_width;
        ogImageHeight = ticketMeta.preview_image_height;
      }
    }

    if (!ogImage && event.og_preview_image_url) {
      ogImage = event.og_preview_image_url;
      if (typeof eventMeta.og_preview_image_width === 'number') {
        ogImageWidth = eventMeta.og_preview_image_width;
      }
      if (typeof eventMeta.og_preview_image_height === 'number') {
        ogImageHeight = eventMeta.og_preview_image_height;
      }
    }

    if (!ogImage && event.instagram_preview_image_url) {
      ogImage = event.instagram_preview_image_url;
      if (typeof eventMeta.instagram_preview_image_width === 'number') {
        ogImageWidth = eventMeta.instagram_preview_image_width;
      }
      if (typeof eventMeta.instagram_preview_image_height === 'number') {
        ogImageHeight = eventMeta.instagram_preview_image_height;
      }
    }

    if (!ogImage && org.metadata && typeof org.metadata === 'object') {
      const orgMeta = org.metadata as Record<string, any>;
      ogImage = orgMeta.logo_url || orgMeta.image_url || '';
    }

    // Ensure image URL is absolute HTTPS
    if (ogImage && !ogImage.startsWith('http')) {
      // If relative URL, make it absolute
      if (ogImage.startsWith('/')) {
        // Remove /rest/v1 or similar paths from SUPABASE_URL to get base URL
        const baseUrl = SUPABASE_URL.replace(/\/rest\/v1.*$/, '');
        ogImage = `${baseUrl}${ogImage}`;
      } else {
        // If it's a storage path (e.g., "event-previews/..."), construct full URL
        const baseUrl = SUPABASE_URL.replace(/\/rest\/v1.*$/, '');
        // Check if it looks like a storage path
        if (!ogImage.includes('://')) {
          ogImage = `${baseUrl}/storage/v1/object/public/${ogImage}`;
        }
      }
    }

    // Ensure HTTPS (required for OG tags)
    if (ogImage && ogImage.startsWith('http://')) {
      ogImage = ogImage.replace('http://', 'https://');
    }

    // Fallback image if still empty
    if (!ogImage) {
      ogImage = 'https://growbrohk.com/og-default.png'; // You may want to add a default OG image
      ogImageWidth = 1200;
      ogImageHeight = 630;
    }

    // Append cache-buster so WhatsApp re-fetches when the event updates (same storage path overwrite)
    if (ogImage.startsWith('https://')) {
      const sep = ogImage.includes('?') ? '&' : '?';
      const evt = event as { updated_at?: string };
      const updatedTs =
        typeof evt.updated_at === 'string' ? new Date(evt.updated_at).getTime() : Date.now();
      ogImage = `${ogImage}${sep}cb=${updatedTs}`;
    }

    const ogImageSecureTag = ogImage.startsWith('https://')
      ? `\n  <meta property="og:image:secure_url" content="${escapeHtml(ogImage)}">`
      : '';

    const ogImageDimensionTags =
      ogImageWidth != null &&
      ogImageHeight != null &&
      ogImageWidth > 0 &&
      ogImageHeight > 0
        ? `\n  <meta property="og:image:width" content="${ogImageWidth}">\n  <meta property="og:image:height" content="${ogImageHeight}">`
        : '';

    // Build redirect URL
    const redirectUrl = ticketId 
      ? `https://growbrohk.com/${orgSlug}/${eventSlug}?ticket=${ticketId}`
      : `https://growbrohk.com/${orgSlug}/${eventSlug}`;

    // Build share URL (og:url) - use canonicalUrl if provided (e.g. from middleware for direct URLs)
    const canonicalUrlParam = url.searchParams.get('canonicalUrl');
    const shareUrl = (canonicalUrlParam && /^https:\/\/(www\.)?growbrohk\.com\//.test(canonicalUrlParam))
      ? canonicalUrlParam
      : (ticketId
        ? `https://growbrohk.com/s/${orgSlug}/${eventSlug}?ticket=${ticketId}`
        : `https://growbrohk.com/s/${orgSlug}/${eventSlug}`);

    // Detect link preview bots via User-Agent
    const ua = (req.headers.get('user-agent') || '').toLowerCase();
    const botPatterns = [
      'facebookexternalhit',
      'facebot',
      'meta-externalagent',
      'meta-externalfetcher',
      'whatsapp',
      'instagram',
      'twitterbot',
      'slackbot',
      'discordbot',
      'telegrambot',
      'linkedinbot',
    ];
    // Instagram/WhatsApp in-app browsers have full browser UA (Mozilla/AppleWebKit).
    // Treat as human; crawlers use facebookexternalhit, not full browser UA.
    const hasBrowserUA = ua.includes('mozilla') || ua.includes('applewebkit');
    const isInAppBrowser = hasBrowserUA && (ua.includes('instagram') || ua.includes('whatsapp'));
    const isBot = (ua === '' || botPatterns.some(pattern => ua.includes(pattern))) && !isInAppBrowser;

    // If human, return HTTP 302 redirect
    if (!isBot) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': redirectUrl,
          'Cache-Control': 'no-store',
        },
      });
    }

    // If bot, return OG HTML (no meta refresh, no JS redirect)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:locale" content="zh_HK">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescriptionShort)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  ${ogImage.includes('event-previews') || ogImage.endsWith('.webp') ? '<meta property="og:image:type" content="image/webp">' : ''}
  ${ogImageSecureTag}${ogImageDimensionTags}
  <meta property="og:image:alt" content="${escapeHtml(ogTitle)}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${shareUrl}">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescriptionShort)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  
  <!-- Standard meta tags -->
  <title>${escapeHtml(ogTitle)}</title>
  <meta name="description" content="${escapeHtml(ogDescriptionShort)}">
</head>
<body>
  <h1>${escapeHtml(ogTitle)}</h1>
  <p>${escapeHtml(ogDescriptionShort)}</p>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Share endpoint error:', error);
    return new Response('Internal server error', { status: 500 });
  }
});

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
