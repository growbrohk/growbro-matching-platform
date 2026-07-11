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


/** Normalize for comparing saved order with live variant values */
function normalizeOptionValueKey(s: string): string {
  return s.trim().toLowerCase();
}

const APPAREL_SIZE_ORDER: string[] = [
  'XXXS',
  '3XS',
  'XXS',
  '2XS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
  'XXXXL',
  'XXXXXL',
];

const APPAREL_SIZE_INDEX: Map<string, number> = new Map();
APPAREL_SIZE_ORDER.forEach((label, i) => {
  APPAREL_SIZE_INDEX.set(label, i);
});

/**
 * Map a display value to apparel size sort index, or null if unknown.
 */
function apparelSizeSortIndex(raw: string): number | null {
  let compact = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!compact) return null;
  // Common aliases → canonical token
  if (compact === '2XL') compact = 'XXL';
  if (compact === '3XL') compact = 'XXXL';
  if (compact === '4XL') compact = 'XXXXL';
  if (compact === '5XL') compact = 'XXXXXL';
  const direct = APPAREL_SIZE_INDEX.get(compact);
  if (direct !== undefined) return direct;
  return null;
}

function isLikelyApparelSizeOption(optionName: string): boolean {
  return /size|尺寸|尺碼|码|碼/i.test(optionName);
}

/**
 * Sort standalone value lists using apparel size heuristics when option looks like Size,
 * else alphabetical.
 */
export function sortVariantOptionValues(values: string[], optionName: string): string[] {
  const copy = [...values];
  if (isLikelyApparelSizeOption(optionName)) {
    copy.sort((a, b) => {
      const ia = apparelSizeSortIndex(a);
      const ib = apparelSizeSortIndex(b);
      if (ia !== null && ib !== null) return ia - ib;
      if (ia !== null) return -1;
      if (ib !== null) return 1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    return copy;
  }
  copy.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return copy;
}

/**
 * Apply org-saved value order first, then smart size / alphabetical for the rest.
 */
export function orderVariantValuesForDisplay(
  values: string[],
  optionName: string,
  savedOrder?: string[] | null,
): string[] {
  const unique = [...new Set(values)];
  if (!savedOrder || savedOrder.length === 0) {
    return sortVariantOptionValues(unique, optionName);
  }

  const byKey = new Map<string, string>();
  for (const u of unique) {
    byKey.set(normalizeOptionValueKey(u), u);
  }

  const used = new Set<string>();
  const ordered: string[] = [];

  for (const sav of savedOrder) {
    const canonical = byKey.get(normalizeOptionValueKey(sav));
    if (canonical && !used.has(canonical)) {
      ordered.push(canonical);
      used.add(canonical);
    }
  }

  const remainder = unique.filter((u) => !used.has(u));
  const remainderSorted = sortVariantOptionValues(remainder, optionName);
  return [...ordered, ...remainderSorted];
}

/**
 * Build default option selections using display order at each hierarchy level.
 * The first ordered value at rank 1, then the first ordered value at rank 2
 * among variants matching rank 1, and so on.
 */
export function getDefaultOptionSelections(
  variantNames: string[],
  rankOrder: string[] = [],
  valueOrders: Record<string, string[]> = {},
): Record<string, string> {
  const hierarchy = getVariantHierarchy(variantNames, rankOrder);
  const next: Record<string, string> = {};

  for (let i = 0; i < hierarchy.length; i++) {
    const pool = variantNames.filter((name) => {
      for (let j = 0; j < i; j++) {
        const keyOpt = hierarchy[j];
        const want = next[keyOpt];
        if (!want) return false;
        if (getVariantOptionValue(name, keyOpt) !== want) return false;
      }
      return true;
    });

    const optKey = hierarchy[i];
    const rawVals = [
      ...new Set(
        pool
          .map((name) => getVariantOptionValue(name, optKey))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const vals = orderVariantValuesForDisplay(rawVals, optKey, valueOrders[optKey]);
    next[optKey] = vals[0] ?? '';
  }

  return next;
}

/**
 * Resolve the variant row id that matches default option selections.
 * Falls back to the first variant when hierarchy cannot be parsed.
 */
export function getDefaultVariantId(
  variants: Array<{ id: string; name: string }>,
  rankOrder: string[] = [],
  valueOrders: Record<string, string[]> = {},
): string | null {
  if (variants.length === 0) return null;

  const variantNames = variants.map((v) => v.name);
  const hierarchy = getVariantHierarchy(variantNames, rankOrder);
  if (hierarchy.length === 0) return variants[0].id;

  const selections = getDefaultOptionSelections(variantNames, rankOrder, valueOrders);
  const match = variants.find((v) =>
    hierarchy.every((h) => getVariantOptionValue(v.name, h) === selections[h]),
  );
  return match?.id ?? variants[0].id;
}

