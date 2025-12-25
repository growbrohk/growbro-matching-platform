/**
 * Variant Configuration API Layer
 * Handles variant option ranking (Rank1, Rank2) for hierarchical display
 */

import { supabase } from '@/integrations/supabase/client';

export interface VariantConfig {
  org_id: string;
  rank1: string;
  rank2: string;
  updated_at?: string;
  created_at?: string;
}

/**
 * Get variant config for an org
 * Returns default config if not found
 */
export async function getVariantConfig(orgId: string): Promise<VariantConfig> {
  const { data, error } = await supabase
    .from('org_variant_config')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw error;

  // Return found config or defaults
  return data || {
    org_id: orgId,
    rank1: 'Color',
    rank2: 'Size',
  };
}

/**
 * Upsert variant config for an org
 */
export async function upsertVariantConfig(
  orgId: string,
  config: { rank1: string; rank2: string }
): Promise<VariantConfig> {
  const { data, error } = await supabase
    .from('org_variant_config')
    .upsert({
      org_id: orgId,
      rank1: config.rank1,
      rank2: config.rank2,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete variant config for an org (resets to defaults)
 */
export async function deleteVariantConfig(orgId: string): Promise<void> {
  const { error } = await supabase
    .from('org_variant_config')
    .delete()
    .eq('org_id', orgId);

  if (error) throw error;
}

