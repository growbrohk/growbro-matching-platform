-- Migration 1: Organizations and Org Members
-- This creates the foundation for multi-tenant organization scoping

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- stores org_type: 'brand' | 'venue'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Org members table (user-org relationship with role)
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Indexes
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_org_id ON org_members(org_id);

-- RLS for orgs
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view orgs they belong to"
  ON orgs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = orgs.id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert orgs (will be handled by RPC)"
  ON orgs FOR INSERT
  WITH CHECK (true); -- RPC function will handle permissions

CREATE POLICY "Users can update orgs they own or admin"
  ON orgs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = orgs.id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- RLS for org_members
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own org memberships"
  ON org_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view members of their orgs"
  ON org_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = org_members.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orgs_updated_at
  BEFORE UPDATE ON orgs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



