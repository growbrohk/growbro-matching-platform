-- Add archived_at and active fields to product_variants

ALTER TABLE product_variants
ADD COLUMN archived_at TIMESTAMPTZ,
ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- Index for querying active variants
CREATE INDEX idx_product_variants_active ON product_variants(product_id, active) WHERE archived_at IS NULL;

-- Comment explaining archival strategy
COMMENT ON COLUMN product_variants.archived_at IS 'Soft delete timestamp. Variants are archived instead of deleted to preserve inventory references.';

