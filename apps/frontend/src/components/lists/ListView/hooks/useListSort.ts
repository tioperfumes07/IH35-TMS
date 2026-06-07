import { useMemo, useState } from "react";
import type { ListViewColumn, SortConfig, SortType } from "../types";

function compareValues(a: unknown, b: unknown, sortType: SortType): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;

  switch (sortType) {
    case "currency":
    case "number": {
      const stripCurrency = (v: unknown) =>
        parseFloat(String(v).replace(/[$,\s]/g, "")) || 0;
      return stripCurrency(a) - stripCurrency(b);
    }
    case "date": {
      const da = Date.parse(String(a));
      const db = Date.parse(String(b));
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return -1;
      if (isNaN(db)) return 1;
      return da - db;
    }
    default:
      return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }
}

export interface SortHookResult {
  sortKey: string;
  sortDir: "asc" | "desc";
  handleSort: (columnId: string) => void;
  sortRows: <T>(rows: T[], columns: ListViewColumn<T>[]) => T[];
}

export function useListSort(external?: SortConfig): SortHookResult {
  const [internalKey, setInternalKey] = useState("");
  const [internalDir, setInternalDir] = useState<"asc" | "desc">("asc");

  const sortKey = external ? external.key : internalKey;
  const sortDir = external ? external.dir : internalDir;

  const handleSort = (columnId: string) => {
    if (external) {
      const nextDir = external.key === columnId && external.dir === "asc" ? "desc" : "asc";
      external.onChange(columnId, nextDir);
    } else {
      setInternalDir((prev) =>
        internalKey === columnId && prev === "asc" ? "desc" : "asc"
      );
      setInternalKey(columnId);
    }
  };

  const sortRows = useMemo(
    () =>
      <T>(rows: T[], columns: ListViewColumn<T>[]): T[] => {
        if (!sortKey) return rows;
        const col = columns.find((c) => c.id === sortKey);
        const sortType: SortType = col?.sortType ?? "text";
        const sorted = [...rows].sort((a, b) => {
          const av = (a as Record<string, unknown>)[sortKey];
          const bv = (b as Record<string, unknown>)[sortKey];
          return compareValues(av, bv, sortType);
        });
        return sortDir === "asc" ? sorted : sorted.reverse();
      },
    [sortKey, sortDir]
  );

  return { sortKey, sortDir, handleSort, sortRows };
}
