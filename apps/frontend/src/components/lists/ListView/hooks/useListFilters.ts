import { useCallback, useMemo, useState } from "react";
import type { ActiveFilter, ListViewFilter } from "../types";

export interface FiltersHookResult {
  activeFilters: ActiveFilter[];
  setFilter: (filterId: string, values: string[]) => void;
  clearFilter: (filterId: string) => void;
  clearAll: () => void;
  getFilterValues: (filterId: string) => string[];
  filterRows: <T>(rows: T[]) => T[];
}

export function useListFilters(
  filterDefs: ListViewFilter[] = [],
  onFilterChange?: (active: ActiveFilter[]) => void
): FiltersHookResult {
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  const setFilter = useCallback(
    (filterId: string, values: string[]) => {
      setActiveFilters((prev) => {
        const next =
          values.length === 0
            ? prev.filter((f) => f.filterId !== filterId)
            : [
                ...prev.filter((f) => f.filterId !== filterId),
                { filterId, values },
              ];
        onFilterChange?.(next);
        return next;
      });
    },
    [onFilterChange]
  );

  const clearFilter = useCallback(
    (filterId: string) => setFilter(filterId, []),
    [setFilter]
  );

  const clearAll = useCallback(() => {
    setActiveFilters([]);
    onFilterChange?.([]);
  }, [onFilterChange]);

  const getFilterValues = useCallback(
    (filterId: string) =>
      activeFilters.find((f) => f.filterId === filterId)?.values ?? [],
    [activeFilters]
  );

  const filterRows = useMemo(() => {
    const defMap = new Map(filterDefs.map((d) => [d.id, d]));
    return <T>(rows: T[]): T[] => {
      if (activeFilters.length === 0) return rows;
      return rows.filter((row) => {
        for (const { filterId, values } of activeFilters) {
          if (values.length === 0) continue;
          const def = defMap.get(filterId);
          if (!def) continue;
          const cellValue = String((row as Record<string, unknown>)[filterId] ?? "");
          if (def.type === "text") {
            const term = values[0]?.toLowerCase() ?? "";
            if (!cellValue.toLowerCase().includes(term)) return false;
          } else {
            if (!values.includes(cellValue)) return false;
          }
        }
        return true;
      });
    };
  }, [activeFilters, filterDefs]);

  return { activeFilters, setFilter, clearFilter, clearAll, getFilterValues, filterRows };
}
