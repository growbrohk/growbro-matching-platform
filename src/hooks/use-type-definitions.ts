import { useState, useEffect } from 'react';
import { fetchTypeDefinitions, type TypeDefinition, type FetchTypeDefinitionsOptions } from '@/lib/api/type-definitions';

export interface UseTypeDefinitionsOptions {
  domain: string;
  parent_domain?: string;
  parent_value?: string;
  includeInactive?: boolean;
  fallback?: TypeDefinition[]; // Fallback if fetch fails
}

export interface UseTypeDefinitionsResult {
  typeDefinitions: TypeDefinition[];
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch type definitions from Supabase
 * Includes fallback support for backward compatibility
 */
export function useTypeDefinitions(
  options: UseTypeDefinitionsOptions
): UseTypeDefinitionsResult {
  const { domain, parent_domain, parent_value, includeInactive, fallback } = options;
  const [typeDefinitions, setTypeDefinitions] = useState<TypeDefinition[]>(fallback || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const definitions = await fetchTypeDefinitions({
          domain,
          parent_domain,
          parent_value,
          includeInactive,
        });

        if (!cancelled) {
          setTypeDefinitions(definitions);
        }
      } catch (err) {
        console.warn('Failed to fetch type definitions, using fallback:', err);
        if (!cancelled) {
          // Use fallback if provided, otherwise empty array
          setTypeDefinitions(fallback || []);
          setError(err instanceof Error ? err : new Error('Failed to fetch type definitions'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [domain, parent_domain, parent_value, includeInactive, fallback]);

  return { typeDefinitions, loading, error };
}

