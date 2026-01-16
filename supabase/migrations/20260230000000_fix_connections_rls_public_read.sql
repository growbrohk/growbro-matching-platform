-- ============================================================================
-- Migration: Fix connections RLS for public read access
-- Purpose: Allow public viewing of accepted connections (simplest fix)
-- ============================================================================

-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view connections for their orgs" ON connections;

-- Create a permissive SELECT policy that allows everyone to read connections
CREATE POLICY "connections_select_all" 
  ON connections 
  FOR SELECT 
  USING (true);

COMMENT ON POLICY "connections_select_all" ON connections IS 'Allow public read access to connections table. This enables public RPCs to query connections without RLS blocking.';
