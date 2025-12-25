-- Migration: Add Variant Configuration Table
-- This table stores variant option ranking (Rank1, Rank2) for hierarchical display

-- ============================================================================
-- 1. CREATE TABLE
-- ============================================================================

CREATE TABLE org_variant_config (
  org_id UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  rank1 TEXT NOT NULL DEFAULT 'Color',
  rank2 TEXT NOT NULL DEFAULT 'Size',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_org_variant_config_org_id ON org_variant_config(org_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE org_variant_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view variant config for their orgs"
  ON org_variant_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_variant_config.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert variant config for their orgs"
  ON org_variant_config FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_variant_config.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update variant config for their orgs"
  ON org_variant_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_variant_config.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE TRIGGER update_org_variant_config_updated_at
  BEFORE UPDATE ON org_variant_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. MIGRATION: Import existing variant_option_order from org metadata
-- ============================================================================

DO $$
DECLARE
  org_record RECORD;
  option_order TEXT[];
  rank1_val TEXT;
  rank2_val TEXT;
BEGIN
  -- Loop through all orgs
  FOR org_record IN 
    SELECT id, metadata FROM orgs WHERE metadata IS NOT NULL
  LOOP
    -- Check if org has variant_option_order in metadata
    IF org_record.metadata ? 'variant_option_order' AND
       jsonb_typeof(org_record.metadata->'variant_option_order') = 'array' THEN
      
      -- Extract the array
      SELECT ARRAY(
        SELECT jsonb_array_elements_text(org_record.metadata->'variant_option_order')
      ) INTO option_order;
      
      -- Set rank1 and rank2 from the array
      rank1_val := COALESCE(option_order[1], 'Color');
      rank2_val := COALESCE(option_order[2], 'Size');
      
      -- Insert config
      INSERT INTO org_variant_config (org_id, rank1, rank2)
      VALUES (org_record.id, rank1_val, rank2_val)
      ON CONFLICT (org_id) DO UPDATE
      SET rank1 = EXCLUDED.rank1, rank2 = EXCLUDED.rank2;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 6. HELPER COMMENTS
-- ============================================================================

COMMENT ON TABLE org_variant_config IS 'Stores variant option ranking for hierarchical inventory display per org';
COMMENT ON COLUMN org_variant_config.rank1 IS 'Primary variant grouping option (e.g., Color)';
COMMENT ON COLUMN org_variant_config.rank2 IS 'Secondary variant grouping option (e.g., Size)';

