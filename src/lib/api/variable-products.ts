/**
 * Variable Products API
 * Handles CRUD operations for product variables, values, and variations
 */

import { supabase } from '@/integrations/supabase/client';
import {
  ProductVariable,
  ProductVariableValue,
  ProductVariation,
  ProductVariableWithValues,
  VariableFormData,
  VariationFormData,
} from '@/lib/types/variable-products';

/**
 * Save product variables and their values
 */
export async function saveProductVariables(
  productId: string,
  variables: VariableFormData[]
): Promise<{ error: Error | null }> {
  try {
    // Delete existing variables (cascade will delete values)
    await supabase
      .from('product_variables')
      .delete()
      .eq('product_id', productId);

    // Insert new variables and values
    for (let i = 0; i < variables.length; i++) {
      const variable = variables[i];
      if (!variable.name.trim() || variable.values.length === 0) continue;

      // Insert variable
      const { data: variableData, error: varError } = await supabase
        .from('product_variables')
        .insert({
          product_id: productId,
          name: variable.name.trim(),
          display_order: i,
        })
        .select()
        .single();

      if (varError) throw varError;
      if (!variableData) continue;

      // Insert values
      const valuesToInsert = variable.values
        .filter((v) => v.trim())
        .map((value, j) => ({
          variable_id: variableData.id,
          value: value.trim(),
          display_order: j,
        }));

      if (valuesToInsert.length > 0) {
        const { error: valuesError } = await supabase
          .from('product_variable_values')
          .insert(valuesToInsert);

        if (valuesError) throw valuesError;
      }
    }

    return { error: null };
  } catch (error: any) {
    return { error: error as Error };
  }
}

/**
 * Get product variables with their values
 */
export async function getProductVariables(
  productId: string
): Promise<{ data: ProductVariableWithValues[] | null; error: Error | null }> {
  try {
    const { data: variables, error: varsError } = await supabase
      .from('product_variables')
      .select('*')
      .eq('product_id', productId)
      .order('display_order', { ascending: true });

    if (varsError) throw varsError;

    if (!variables || variables.length === 0) {
      return { data: [], error: null };
    }

    // Get values for each variable
    const variablesWithValues = await Promise.all(
      variables.map(async (variable) => {
        const { data: values, error: valuesError } = await supabase
          .from('product_variable_values')
          .select('*')
          .eq('variable_id', variable.id)
          .order('display_order', { ascending: true });

        if (valuesError) throw valuesError;

        return {
          ...variable,
          values: values || [],
        } as ProductVariableWithValues;
      })
    );

    return { data: variablesWithValues, error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Generate all possible variations from variables
 */
export function generateVariations(
  variables: ProductVariableWithValues[]
): Record<string, string>[] {
  if (variables.length === 0) return [];

  // Generate cartesian product of all variable values
  const combinations: Record<string, string>[] = [];

  function generate(index: number, current: Record<string, string>) {
    if (index === variables.length) {
      combinations.push({ ...current });
      return;
    }

    const variable = variables[index];
    for (const value of variable.values) {
      generate(index + 1, { ...current, [variable.name]: value.value });
    }
  }

  generate(0, {});
  return combinations;
}

/**
 * Save product variations
 */
export async function saveProductVariations(
  productId: string,
  variations: VariationFormData[]
): Promise<{ error: Error | null }> {
  try {
    // Delete existing variations (cascade will delete inventory)
    await supabase
      .from('product_variations')
      .delete()
      .eq('product_id', productId);

    // Insert new variations
    if (variations.length > 0) {
      const variationsToInsert = variations.map((variation) => ({
        product_id: productId,
        sku: variation.sku?.trim() || null,
        attributes: variation.attributes,
        price_in_cents: variation.price_in_cents || null,
        image_url: variation.image_url?.trim() || null,
        stock_quantity: variation.stock_quantity || 0,
        is_active: variation.is_active ?? true,
      }));

      const { error } = await supabase
        .from('product_variations')
        .insert(variationsToInsert);

      if (error) throw error;
    }

    return { error: null };
  } catch (error: any) {
    return { error: error as Error };
  }
}

/**
 * Get product variations
 */
export async function getProductVariations(
  productId: string
): Promise<{ data: ProductVariation[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('product_variations')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return { data: (data as ProductVariation[]) || [], error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get variation inventory by location
 */
export async function getVariationInventory(
  variationId: string
): Promise<{ data: any[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('product_variation_inventory')
      .select('*, inventory_locations(*)')
      .eq('variation_id', variationId);

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error: any) {
    return { data: null, error: error as Error };
  }
}

/**
 * Update variation inventory at a location
 */
export async function updateVariationInventory(
  variationId: string,
  locationId: string,
  stockQuantity: number,
  reservedQuantity: number = 0
): Promise<{ error: Error | null; data?: any }> {
  try {
    console.log('updateVariationInventory called:', { variationId, locationId, stockQuantity, reservedQuantity });
    
    const { data, error } = await supabase
      .from('product_variation_inventory')
      .upsert({
        variation_id: variationId,
        inventory_location_id: locationId,
        stock_quantity: stockQuantity,
        reserved_quantity: reservedQuantity,
      }, {
        onConflict: 'variation_id,inventory_location_id'
      })
      .select('variation_id, inventory_location_id, stock_quantity, reserved_quantity')
      .single();

    if (error) {
      console.error('updateVariationInventory error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('updateVariationInventory success:', data);
    return { error: null, data };
  } catch (error: any) {
    console.error('updateVariationInventory exception:', error);
    console.error('Exception details:', JSON.stringify(error, null, 2));
    return { error: error as Error };
  }
}

