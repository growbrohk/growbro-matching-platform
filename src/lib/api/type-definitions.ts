import { supabase } from '@/integrations/supabase/client';

export interface TypeDefinition {
  id: string;
  domain: string;
  value: string;
  label: string;
  parent_domain: string | null;
  parent_value: string | null;
  db_table: string | null;
  db_column: string | null;
  db_values: string[];
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FetchTypeDefinitionsOptions {
  domain: string;
  parent_domain?: string;
  parent_value?: string;
  includeInactive?: boolean;
}

/**
 * Fetch type definitions from Supabase
 */
export async function fetchTypeDefinitions(
  options: FetchTypeDefinitionsOptions
): Promise<TypeDefinition[]> {
  const { domain, parent_domain, parent_value, includeInactive = false } = options;

  let query = supabase
    .from('type_definitions')
    .select('*')
    .eq('domain', domain)
    .order('sort_order', { ascending: true });

  // Filter by active status unless includeInactive is true
  if (!includeInactive) {
    query = query.eq('active', true);
  }

  // Filter by parent if provided
  if (parent_domain) {
    query = query.eq('parent_domain', parent_domain);
  }
  if (parent_value) {
    query = query.eq('parent_value', parent_value);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching type definitions:', error);
    throw error;
  }

  return (data || []) as TypeDefinition[];
}

/**
 * Fetch all type definitions for a domain (including nested children)
 */
export async function fetchTypeDefinitionsWithChildren(
  domain: string,
  includeInactive = false
): Promise<TypeDefinition[]> {
  const { data, error } = await supabase
    .from('type_definitions')
    .select('*')
    .or(`domain.eq.${domain},and(parent_domain.eq.${domain})`)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching type definitions with children:', error);
    throw error;
  }

  // Filter by active status if needed
  let result = (data || []) as TypeDefinition[];
  if (!includeInactive) {
    result = result.filter((td) => td.active);
  }

  return result;
}

/**
 * Map UI space type selections to database category values
 */
export function mapSpaceUiTypeToCategories(
  selectedSpaceTypes: string[],
  selectedPromoTypes: string[],
  typeDefinitions: TypeDefinition[]
): string[] {
  const categories: Set<string> = new Set();

  // Get all space_type definitions
  const spaceTypeDefs = typeDefinitions.filter(
    (td) => td.domain === 'space_type' && selectedSpaceTypes.includes(td.value)
  );

  // If promotion is selected and promotion subtypes are selected, use those instead
  if (selectedSpaceTypes.includes('promotion') && selectedPromoTypes.length > 0) {
    const promoTypeDefs = typeDefinitions.filter(
      (td) =>
        td.domain === 'promotion_type' &&
        td.parent_domain === 'space_type' &&
        td.parent_value === 'promotion' &&
        selectedPromoTypes.includes(td.value)
    );

    // Use promotion subtype db_values
    promoTypeDefs.forEach((def) => {
      def.db_values.forEach((val) => categories.add(val));
    });
  } else {
    // Use space_type db_values
    spaceTypeDefs.forEach((def) => {
      def.db_values.forEach((val) => categories.add(val));
    });
  }

  return Array.from(categories);
}

/**
 * Map UI brand type selections to query filters
 */
export function mapBrandUiTypeToQueries(
  selectedBrandTypes: string[],
  typeDefinitions: TypeDefinition[]
): {
  productsFilter?: { type: string[] };
  eventsFilter?: { isWorkshop?: boolean };
} {
  const result: {
    productsFilter?: { type: string[] };
    eventsFilter?: { isWorkshop?: boolean };
  } = {};

  const brandTypeDefs = typeDefinitions.filter(
    (td) => td.domain === 'brand_type' && selectedBrandTypes.includes(td.value)
  );

  // Check for product type
  const productDef = brandTypeDefs.find((td) => td.value === 'product');
  if (productDef && productDef.db_values.length > 0) {
    result.productsFilter = { type: productDef.db_values };
  }

  // Check for event/workshop types
  const eventDef = brandTypeDefs.find((td) => td.value === 'event');
  const workshopDef = brandTypeDefs.find((td) => td.value === 'workshop');

  if (eventDef || workshopDef) {
    result.eventsFilter = {};
    if (workshopDef) {
      result.eventsFilter.isWorkshop = true;
    }
  }

  return result;
}

