/**
 * Variant Parser Utilities
 * 
 * Parses variant names in format: "Color: Orange / Size: M"
 * into structured data for hierarchical inventory display
 */

export interface VariantOption {
  name: string;  // e.g., "Color", "Size"
  value: string; // e.g., "Orange", "M"
}

export interface ParsedVariant {
  options: VariantOption[];
  raw: string;
}

/**
 * Parse a variant name string into structured options
 * 
 * Example:
 *   Input: "Color: Orange / Size: M"
 *   Output: [
 *     { name: "Color", value: "Orange" },
 *     { name: "Size", value: "M" }
 *   ]
 */
export function parseVariantName(variantName: string): VariantOption[] {
  if (!variantName || !variantName.trim()) {
    return [];
  }

  const options: VariantOption[] = [];
  
  // Split by " / " to get individual option pairs
  const pairs = variantName.split('/').map(s => s.trim());
  
  for (const pair of pairs) {
    // Split by ":" to separate name and value
    const colonIndex = pair.indexOf(':');
    if (colonIndex === -1) {
      // No colon found, treat entire string as value with empty name
      continue;
    }
    
    const name = pair.substring(0, colonIndex).trim();
    const value = pair.substring(colonIndex + 1).trim();
    
    if (name && value) {
      options.push({ name, value });
    }
  }
  
  return options;
}

/**
 * Get unique variant option names from a list of variant names
 * Used to determine available option types (e.g., ["Color", "Size"])
 */
export function getUniqueVariantOptionNames(variantNames: string[]): string[] {
  const namesSet = new Set<string>();
  
  for (const variantName of variantNames) {
    const options = parseVariantName(variantName);
    for (const option of options) {
      namesSet.add(option.name);
    }
  }
  
  return Array.from(namesSet);
}

/**
 * Get the value for a specific option name from a variant
 * 
 * Example:
 *   getVariantOptionValue("Color: Orange / Size: M", "Color") => "Orange"
 *   getVariantOptionValue("Color: Orange / Size: M", "Size") => "M"
 */
export function getVariantOptionValue(variantName: string, optionName: string): string | null {
  const options = parseVariantName(variantName);
  const option = options.find(opt => opt.name === optionName);
  return option?.value || null;
}

/**
 * Group variants by a specific option name
 * 
 * Example:
 *   variants = ["Color: Orange / Size: M", "Color: Orange / Size: L", "Color: Blue / Size: M"]
 *   groupVariantsByOption(variants, "Color")
 *   => {
 *     "Orange": ["Color: Orange / Size: M", "Color: Orange / Size: L"],
 *     "Blue": ["Color: Blue / Size: M"]
 *   }
 */
export function groupVariantsByOption(
  variantNames: string[],
  optionName: string
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  
  for (const variantName of variantNames) {
    const value = getVariantOptionValue(variantName, optionName);
    if (value) {
      if (!groups.has(value)) {
        groups.set(value, []);
      }
      groups.get(value)!.push(variantName);
    }
  }
  
  return groups;
}

/**
 * Sort variant option names based on a custom order
 * Options not in the custom order are placed at the end in alphabetical order
 */
export function sortVariantOptionNames(
  optionNames: string[],
  customOrder: string[]
): string[] {
  const orderMap = new Map(customOrder.map((name, index) => [name, index]));
  
  return [...optionNames].sort((a, b) => {
    const orderA = orderMap.get(a);
    const orderB = orderMap.get(b);
    
    // Both in custom order
    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB;
    }
    
    // Only A in custom order
    if (orderA !== undefined) {
      return -1;
    }
    
    // Only B in custom order
    if (orderB !== undefined) {
      return 1;
    }
    
    // Neither in custom order, sort alphabetically
    return a.localeCompare(b);
  });
}

/**
 * Get variant hierarchy levels based on option order
 * Returns array of option names in the order they should appear in the hierarchy
 * 
 * Example:
 *   variants = ["Color: Orange / Size: M", "Color: Blue / Size: L"]
 *   customOrder = ["Color", "Size"]
 *   => ["Color", "Size"]
 */
export function getVariantHierarchy(
  variantNames: string[],
  customOrder: string[] = []
): string[] {
  const uniqueNames = getUniqueVariantOptionNames(variantNames);
  return sortVariantOptionNames(uniqueNames, customOrder);
}

