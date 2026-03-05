/**
 * Vercel Edge Middleware: Serves event-specific OG tags for social crawlers
 * when they hit direct event URLs (/:orgSlug/:eventSlug).
 * Human users continue to the SPA as normal.
 */

import { NextResponse } from 'next/server';

const SHARE_EVENT_BASE =
  'https://pbtupzbqtuxzznwummep.functions.supabase.co/share-event';

const RESERVED_ORG_SLUGS = new Set([
  'app',
  'login',
  'events',
  'admin',
  'api',
  'auth',
  'onboarding',
  'book',
  'r',
  'space',
  'profile',
  't',
  'o',
  'booking',
  'org',
  'messages',
  'dashboard',
  'collab',
  'enquiries',
  'orders',
  'settings',
  'account',
  'products',
  'catalog',
  'notifications',
  'checkout',
]);

const BOT_PATTERNS = [
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

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return ua === '' || BOT_PATTERNS.some((p) => ua.includes(p));
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Only handle paths with exactly 2 segments: /:orgSlug/:eventSlug
  if (pathParts.length !== 2) {
    return next();
  }

  const [orgSlug, eventSlug] = pathParts;

  // Skip reserved paths
  if (RESERVED_ORG_SLUGS.has(orgSlug.toLowerCase())) {
    return next();
  }

  // Only intercept bot requests
  const userAgent = request.headers.get('user-agent') || '';
  if (!isBot(userAgent)) {
    return next();
  }

  // Build share-event URL with query params (including ticket, etc.)
  const shareUrl = new URL(SHARE_EVENT_BASE);
  shareUrl.searchParams.set('orgSlug', orgSlug);
  shareUrl.searchParams.set('eventSlug', eventSlug);

  // Forward relevant query params (ticket, ticketSlug)
  const ticket = url.searchParams.get('ticket');
  const ticketSlug = url.searchParams.get('ticketSlug');
  if (ticket) shareUrl.searchParams.set('ticket', ticket);
  if (ticketSlug) shareUrl.searchParams.set('ticketSlug', ticketSlug);

  // Pass canonical URL so og:url reflects the direct URL
  shareUrl.searchParams.set('canonicalUrl', url.origin + url.pathname + url.search);

  try {
    const response = await fetch(shareUrl.toString(), {
      headers: {
        'User-Agent': userAgent || 'WhatsApp/2.0',
      },
    });

    // Pass through 404, 400, 500 etc.
    if (!response.ok) {
      return response;
    }

    return response;
  } catch (error) {
    console.error('[middleware] share-event fetch error:', error);
    return next();
  }
}

function next(): Response {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match /:orgSlug/:eventSlug (exactly 2 path segments, no leading slash in match)
    '/([^/]+)/([^/]+)',
  ],
};
