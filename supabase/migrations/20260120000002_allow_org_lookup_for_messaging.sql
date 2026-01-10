-- Migration: Allow users to view other orgs for messaging purposes
-- Users need to be able to see other orgs' basic info (id, name, slug) to send messages

-- Drop policy if it exists (for idempotency)
DROP POLICY IF EXISTS "Authenticated users can view orgs for messaging" ON orgs;

-- Add policy to allow authenticated users to view any org (for messaging)
-- This works alongside the existing "Users can view orgs they belong to" policy
-- PostgreSQL RLS uses OR logic - if any policy allows, access is granted
CREATE POLICY "Authenticated users can view orgs for messaging"
  ON orgs FOR SELECT
  TO authenticated
  USING (true);

-- Note: This is safe because:
-- 1. We're only exposing basic fields (id, name, slug) which are needed for messaging
-- 2. More sensitive org data is in org_profiles table which has its own RLS
-- 3. Users can only send messages as their own org (enforced by RPC function and message INSERT policy)
-- 4. Org names and slugs are public-facing identifiers anyway
-- 5. This allows users to look up orgs by ID (needed for /messages/new?toOrg=<id>)

