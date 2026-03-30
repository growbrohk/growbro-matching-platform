/**
 * Variant Configuration API Layer
 * Handles variant option ranking (Rank1, Rank2) for hierarchical display
 */

import { supabase } from '@/integrations/supabase/client';

export interface VariantConfig {
  org_id: string;
  rank1: string;
  rank2: string;
  value_orders: Record<string, string[]>;
  updated_at?: string;
  created_at?: string;
}

function parseValueOrders(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      out[k] = v.map((x) => String(x)).filter((s) => s.length > 0);
    }
  }
  return out;
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

  if (!data) {
    return {
      org_id: orgId,
      rank1: 'Color',
      rank2: 'Size',
      value_orders: {},
    };
  }

  return {
    ...(data as VariantConfig),
    value_orders: parseValueOrders((data as { value_orders?: unknown }).value_orders),
  };
}

/**
 * Upsert variant config for an org
 */
export async function upsertVariantConfig(
  orgId: string,
  config: {
    rank1: string;
    rank2: string;
    value_orders?: Record<string, string[]>;
  },
): Promise<VariantConfig> {
  const row: Record<string, unknown> = {
    org_id: orgId,
    rank1: config.rank1,
    rank2: config.rank2,
    updated_at: new Date().toISOString(),
  };
  if (config.value_orders !== undefined) {
    row.value_orders = config.value_orders;
  }

  const { data, error } = await supabase
    .from('org_variant_config')
    .upsert(row)
    .select()
    .single();

  if (error) throw error;

  return {
    ...(data as VariantConfig),
    value_orders: parseValueOrders((data as { value_orders?: unknown }).value_orders),
  };
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
