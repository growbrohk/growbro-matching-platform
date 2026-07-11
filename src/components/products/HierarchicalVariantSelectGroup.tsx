import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getDefaultOptionSelections,
  getVariantHierarchy,
  getVariantOptionValue,
  orderVariantValuesForDisplay,
} from '@/lib/utils/variant-parser';

export interface HierarchicalVariantRow {
  id: string;
  name: string;
  price?: number | null;
}

export interface HierarchicalVariantSelectGroupProps {
  variants: HierarchicalVariantRow[];
  selectedVariantId: string | null;
  onVariantChange: (id: string | null) => void;
  variantRankOrder: string[];
  variantValueOrders: Record<string, string[]>;
  /** Product page: true. Add-ons: false (no implicit selection / validation). */
  autoSelectFirst?: boolean;
  disabled?: boolean;
  /** Flat fallback only — appended after variant name (e.g. price + stock). */
  flatItemSuffix?: (v: HierarchicalVariantRow) => ReactNode;
  flatItemDisabled?: (v: HierarchicalVariantRow) => boolean;
  /** Hierarchical only — disable a value when all matching variants are OOS etc. */
  isValueDisabled?: (
    optionName: string,
    value: string,
    prefix: Record<string, string>,
  ) => boolean;
  /** Hierarchical only — appended after option value (e.g. stock left). */
  hierarchicalItemSuffix?: (
    optionName: string,
    value: string,
    prefix: Record<string, string>,
  ) => ReactNode;
  triggerClassName?: string;
  labelClassName?: string;
  /** Changes to this key reset picker internal state (e.g. product id). */
  instanceKey?: string;
  hierarchicalContentClassName?: string;
  flatContentClassName?: string;
  flatViewportClassName?: string;
}

function buildPrefixForDepth(
  hierarchy: string[],
  optionSelections: Record<string, string>,
  depth: number,
): Record<string, string> {
  const prefix: Record<string, string> = {};
  for (let j = 0; j < depth; j++) {
    const k = hierarchy[j];
    const sel = optionSelections[k];
    if (sel) prefix[k] = sel;
  }
  return prefix;
}

function HierarchicalVariantSelectGroup({
  variants,
  selectedVariantId,
  onVariantChange,
  variantRankOrder,
  variantValueOrders,
  autoSelectFirst = true,
  disabled = false,
  flatItemSuffix,
  flatItemDisabled,
  isValueDisabled,
  hierarchicalItemSuffix,
  triggerClassName = 'w-full rounded-2xl',
  labelClassName = 'text-sm font-medium',
  instanceKey = '',
  hierarchicalContentClassName,
  flatContentClassName,
  flatViewportClassName,
}: HierarchicalVariantSelectGroupProps) {
  const hierarchy = useMemo(
    () => getVariantHierarchy(variants.map((v) => v.name), variantRankOrder),
    [variants, variantRankOrder],
  );
  const useHierarchicalPicker = hierarchy.length >= 1;

  const [optionSelections, setOptionSelections] = useState<Record<string, string>>({});
  const pickerInitKeyRef = useRef('');
  const emittedIdRef = useRef<string | null>(null);

  const variantIdsKey = useMemo(() => variants.map((v) => v.id).join(','), [variants]);

  useEffect(() => {
    pickerInitKeyRef.current = '';
  }, [instanceKey, variantIdsKey]);

  // Initialize hierarchical option rows (product page auto-fills first path; add-ons start empty)
  useEffect(() => {
    if (!useHierarchicalPicker || variants.length === 0) return;
    const key = `${instanceKey}|${hierarchy.join('\0')}|${variantIdsKey}|${JSON.stringify(variantValueOrders)}|${autoSelectFirst}`;
    if (pickerInitKeyRef.current === key) return;
    pickerInitKeyRef.current = key;

    if (!autoSelectFirst) {
      setOptionSelections({});
      return;
    }

    const next = getDefaultOptionSelections(
      variants.map((v) => v.name),
      variantRankOrder,
      variantValueOrders,
    );
    setOptionSelections(next);
  }, [
    instanceKey,
    useHierarchicalPicker,
    variants,
    hierarchy,
    variantIdsKey,
    variantValueOrders,
    autoSelectFirst,
  ]);

  // External selectedVariantId → optionSelections (draft restore); skip if we just emitted that id
  useEffect(() => {
    if (!useHierarchicalPicker || !selectedVariantId) return;
    if (selectedVariantId === emittedIdRef.current) return;

    const row = variants.find((v) => v.id === selectedVariantId);
    if (!row) return;

    const next: Record<string, string> = {};
    for (const h of hierarchy) {
      const val = getVariantOptionValue(row.name, h);
      if (val) next[h] = val;
    }
    setOptionSelections(next);
  }, [selectedVariantId, variants, hierarchy, useHierarchicalPicker]);

  const handleOptionChange = useCallback(
    (depth: number, value: string) => {
      setOptionSelections((prev) => {
        const next = { ...prev, [hierarchy[depth]]: value };
        if (autoSelectFirst) {
          for (let i = depth + 1; i < hierarchy.length; i++) {
            const pool = variants.filter((v) => {
              for (let j = 0; j < i; j++) {
                const key = hierarchy[j];
                const want = next[key];
                if (!want) return false;
                if (getVariantOptionValue(v.name, key) !== want) return false;
              }
              return true;
            });
            const optKey = hierarchy[i];
            const rawVals = [
              ...new Set(
                pool
                  .map((v) => getVariantOptionValue(v.name, optKey))
                  .filter((x): x is string => Boolean(x)),
              ),
            ];
            const vals = orderVariantValuesForDisplay(rawVals, optKey, variantValueOrders[optKey]);
            next[optKey] = vals[0] ?? '';
          }
        } else {
          for (let i = depth + 1; i < hierarchy.length; i++) {
            delete next[hierarchy[i]];
          }
        }
        return next;
      });
    },
    [hierarchy, variants, variantValueOrders, autoSelectFirst],
  );

  // Hierarchical: emit resolved id, or null when incomplete (add-ons only)
  useEffect(() => {
    if (!useHierarchicalPicker || variants.length === 0) return;

    const allSet = hierarchy.every((h) => (optionSelections[h] ?? '').length > 0);

    if (!allSet) {
      if (!autoSelectFirst && selectedVariantId) {
        emittedIdRef.current = null;
        onVariantChange(null);
      }
      return;
    }

    const matches = variants.filter((v) =>
      hierarchy.every((h) => getVariantOptionValue(v.name, h) === optionSelections[h]),
    );
    const effective = matches[0];
    if (!effective) return;

    if (effective.id !== selectedVariantId) {
      emittedIdRef.current = effective.id;
      onVariantChange(effective.id);
    }
  }, [
    optionSelections,
    useHierarchicalPicker,
    hierarchy,
    variants,
    autoSelectFirst,
    selectedVariantId,
    onVariantChange,
  ]);

  // Flat fallback: optional auto-first
  useEffect(() => {
    if (useHierarchicalPicker || variants.length === 0 || !autoSelectFirst) return;
    const first = variants[0];
    if (!selectedVariantId && first) {
      emittedIdRef.current = first.id;
      onVariantChange(first.id);
    }
  }, [useHierarchicalPicker, variants, autoSelectFirst, selectedVariantId, onVariantChange]);

  if (variants.length === 0) {
    return null;
  }

  if (useHierarchicalPicker) {
    return (
      <div className="space-y-4">
        {hierarchy.map((optionName, depth) => {
          const filtered = variants.filter((v) => {
            for (let j = 0; j < depth; j++) {
              const key = hierarchy[j];
              const sel = optionSelections[key];
              if (!sel) return false;
              if (getVariantOptionValue(v.name, key) !== sel) return false;
            }
            return true;
          });
          const rawChoices = [
            ...new Set(
              filtered
                .map((v) => getVariantOptionValue(v.name, optionName))
                .filter((x): x is string => Boolean(x)),
            ),
          ];
          const choices = orderVariantValuesForDisplay(
            rawChoices,
            optionName,
            variantValueOrders[optionName],
          );
          const rawCurrent = optionSelections[optionName] ?? '';
          const current =
            rawCurrent && choices.includes(rawCurrent) ? rawCurrent : autoSelectFirst ? choices[0] ?? '' : '';

          const prefix = buildPrefixForDepth(hierarchy, optionSelections, depth);

          return (
            <div key={optionName} className="space-y-2">
              <label className={labelClassName} style={{ color: '#0F1F17' }}>
                {optionName}
              </label>
              {choices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No options</p>
              ) : (
                <Select
                  value={current || undefined}
                  onValueChange={(v) => handleOptionChange(depth, v)}
                  disabled={disabled}
                >
                  <SelectTrigger className={triggerClassName}>
                    <SelectValue placeholder={`Select ${optionName}`} />
                  </SelectTrigger>
                  <SelectContent className={hierarchicalContentClassName}>
                    {choices.map((c) => {
                      const dimDisabled =
                        isValueDisabled?.(optionName, c, prefix) ?? false;
                      return (
                        <SelectItem key={c} value={c} disabled={dimDisabled}>
                          {c}
                          {hierarchicalItemSuffix?.(optionName, c, prefix)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className={labelClassName} style={{ color: '#0F1F17' }}>
        Variant
      </label>
      <Select
        value={selectedVariantId || undefined}
        onValueChange={(v) => {
          emittedIdRef.current = v;
          onVariantChange(v);
        }}
        disabled={disabled}
      >
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder="Select variant" />
        </SelectTrigger>
        <SelectContent
          className={flatContentClassName}
          viewportClassName={flatViewportClassName}
        >
          {variants.map((v) => {
            const itemDisabled = flatItemDisabled?.(v) ?? false;
            return (
              <SelectItem
                key={v.id}
                value={v.id}
                disabled={itemDisabled}
                className="whitespace-nowrap py-2"
              >
                {v.name}
                {flatItemSuffix?.(v)}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

export default HierarchicalVariantSelectGroup;
