/**
 * Variable Products Types
 * Types for products with variations (e.g., size, color)
 */

export interface ProductVariable {
  id: string;
  product_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariableValue {
  id: string;
  variable_id: string;
  value: string;
  display_order: number;
  created_at: string;
}

export interface ProductVariation {
  id: string;
  product_id: string;
  sku?: string;
  attributes: Record<string, string>; // e.g., { "Color": "Black", "Size": "S" }
  price_in_cents?: number;
  image_url?: string;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductVariationInventory {
  id: string;
  variation_id: string;
  inventory_location_id: string;
  stock_quantity: number;
  reserved_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariableWithValues extends ProductVariable {
  values: ProductVariableValue[];
}

export interface ProductWithVariations {
  id: string;
  variables: ProductVariableWithValues[];
  variations: ProductVariation[];
}

// Form types
export interface VariableFormData {
  name: string;
  values: string[];
}

export interface VariationFormData {
  attributes: Record<string, string>;
  sku?: string;
  price_in_cents?: number;
  image_url?: string;
  stock_quantity?: number;
  is_active?: boolean;
}

