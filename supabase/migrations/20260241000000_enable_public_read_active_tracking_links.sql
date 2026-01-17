-- Migration: Enable public read access for active tracking links
-- Allows anonymous users to resolve tracking links by slug for redirects
-- This fixes 406 Not Acceptable errors when accessing tracking links in incognito mode

-- Ensure RLS is enabled (should already be enabled, but safe to run)
ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "public can resolve active tracking links" ON public.tracking_links;
DROP POLICY IF EXISTS "authed can resolve active tracking links" ON public.tracking_links;

-- Allow anonymous users to read active tracking links (for redirect resolution)
CREATE POLICY "public can resolve active tracking links"
ON public.tracking_links
FOR SELECT
TO anon
USING (is_active = true);

-- Allow authenticated users to read active tracking links (recommended)
CREATE POLICY "authed can resolve active tracking links"
ON public.tracking_links
FOR SELECT
TO authenticated
USING (is_active = true);
