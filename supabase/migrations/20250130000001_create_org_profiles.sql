-- Migration: Create org_profiles table
-- This separates org profile data from orgs.metadata for better structure and type safety
-- Profile fields: roles, category, instagram, address, bio, website, logo_url

-- ============================================================================
-- 1. CREATE TABLE
-- ============================================================================

CREATE TABLE org_profiles (
  org_id UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  category TEXT NOT NULL CHECK (category IN ('f&b', 'retail', 'service', 'other')),
  instagram TEXT,
  address TEXT NOT NULL,
  bio TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_org_profiles_org_id ON org_profiles(org_id);
CREATE INDEX idx_org_profiles_category ON org_profiles(category);

-- ============================================================================
-- 3. CREATE TRIGGER FOR updated_at
-- ============================================================================

CREATE TRIGGER update_org_profiles_updated_at
  BEFORE UPDATE ON org_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE org_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view profiles from orgs they belong to
CREATE POLICY "Users can view profiles from their orgs"
  ON org_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_profiles.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- Users can insert profiles for orgs they own or admin
CREATE POLICY "Users can create profiles in their orgs"
  ON org_profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_profiles.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- Users can update profiles for orgs they own or admin
CREATE POLICY "Users can update profiles in their orgs"
  ON org_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_profiles.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 5. MIGRATE EXISTING DATA (Optional)
-- ============================================================================
-- This migrates profile data from orgs.metadata to org_profiles for existing orgs
-- Only migrates if metadata contains profile fields and org_profiles row doesn't exist

INSERT INTO org_profiles (
  org_id,
  roles,
  category,
  instagram,
  address,
  bio,
  website,
  logo_url,
  created_at,
  updated_at
)
SELECT 
  o.id AS org_id,
  COALESCE(
    CASE 
      WHEN o.metadata->>'roles' IS NOT NULL 
      THEN ARRAY(SELECT jsonb_array_elements_text(o.metadata->'roles'))
      ELSE ARRAY[]::TEXT[]
    END,
    ARRAY[]::TEXT[]
  ) AS roles,
  COALESCE(
    o.metadata->>'category',
    'other' -- Default category if missing
  ) AS category,
  NULLIF(o.metadata->>'instagram', '') AS instagram,
  COALESCE(
    NULLIF(o.metadata->>'address', ''),
    'Address not set' -- Default placeholder (user will need to update)
  ) AS address,
  NULLIF(o.metadata->>'bio', '') AS bio,
  NULLIF(o.metadata->>'website', '') AS website,
  NULLIF(o.metadata->>'logo_url', '') AS logo_url,
  o.created_at,
  o.updated_at
FROM orgs o
WHERE 
  -- Only migrate if metadata has profile fields
  (
    o.metadata->>'roles' IS NOT NULL 
    OR o.metadata->>'category' IS NOT NULL
    OR o.metadata->>'address' IS NOT NULL
    OR o.metadata->>'instagram' IS NOT NULL
    OR o.metadata->>'bio' IS NOT NULL
    OR o.metadata->>'website' IS NOT NULL
    OR o.metadata->>'logo_url' IS NOT NULL
  )
  -- And org_profiles row doesn't already exist
  AND NOT EXISTS (
    SELECT 1 FROM org_profiles op
    WHERE op.org_id = o.id
  )
ON CONFLICT (org_id) DO NOTHING;

