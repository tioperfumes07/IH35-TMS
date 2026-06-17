import { useCallback, useEffect, useState } from "react";

// GLOBAL-TABLE-CONTROLS — per-user persistence of table view prefs (rows-per-page +
// hidden columns + column widths), keyed by a stable table id. localStorage =
// per-user-per-device; mirrors the useViewModePref pattern. Never destroys data.
const PREFIX = "ih35:table-pref:";

export type TablePref = { pageSize: number; hidden: string[]; widths: Record<string, number> };

function read(key: string): Partial<TablePref> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Partial<TablePref>;
  } catch {
    // private mode / malformed JSON — fall back to defaults
  }
  return null;
}

function write(key: string, pref: TablePref) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(pref));
  } catch {
    // private mode — non-fatal
  }
}

export function useTablePref(tableKey: string, defaults: { pageSize: number; hidden?: string[] }) {
  const initial = read(tableKey);
  const [pageSize, setPageSizeState] = useState<number>(initial?.pageSize ?? defaults.pageSize);
  const [hidden, setHiddenState] = useState<Set<string>>(new Set(initial?.hidden ?? defaults.hidden ?? []));
  const [widths, setWidthsState] = useState<Record<string, number>>(initial?.widths ?? {});

  useEffect(() => {
    write(tableKey, { pageSize, hidden: Array.from(hidden), widths });
  }, [tableKey, pageSize, hidden, widths]);

  const setPageSize = useCallback((n: number) => setPageSizeState(n), []);
  const toggleColumn = useCallback((key: string) => {
    setHiddenState((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const setHidden = useCallback((keys: string[]) => setHiddenState(new Set(keys)), []);
  const setColumnWidth = useCallback((key: string, width: number) => {
    setWidthsState((prev) => ({ ...prev, [key]: Math.max(48, Math.round(width)) }));
  }, []);

  return { pageSize, setPageSize, hidden, toggleColumn, setHidden, widths, setColumnWidth };
}
