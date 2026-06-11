/**
 * useResizableColumns — W2-P PLANNER-REDESIGN
 * Resizable column widths with localStorage persistence.
 * All planners share this hook.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface ColumnDef {
  key: string;
  header: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth: number;
}

interface ResizableColumnsResult {
  widths: Record<string, number>;
  startResize: (key: string) => (e: React.MouseEvent) => void;
  isResizing: boolean;
}

const STORAGE_KEY_PREFIX = "planner_col_widths_";

export function useResizableColumns(
  plannerId: string,
  columns: ColumnDef[]
): ResizableColumnsResult {
  const storageKey = `${STORAGE_KEY_PREFIX}${plannerId}`;

  // Load persisted widths
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") {
      return Object.fromEntries(columns.map((c) => [c.key, c.defaultWidth]));
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, number>;
        // Merge with defaults for any new columns
        const merged: Record<string, number> = {};
        for (const col of columns) {
          merged[col.key] = parsed[col.key] ?? col.defaultWidth;
        }
        return merged;
      }
    } catch {
      // ignore parse errors
    }
    return Object.fromEntries(columns.map((c) => [c.key, c.defaultWidth]));
  });

  // Persist on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [storageKey, widths]);

  const [isResizing, setIsResizing] = useState(false);
  const activeKeyRef = useRef<string | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const startResize = useCallback((key: string) => {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      activeKeyRef.current = key;
      startXRef.current = e.clientX;
      startWidthRef.current = widths[key] ?? 100;
      setIsResizing(true);
    };
  }, [widths]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent) => {
      const key = activeKeyRef.current;
      if (!key) return;
      const col = columns.find((c) => c.key === key);
      if (!col) return;

      const delta = e.clientX - startXRef.current;
      let next = startWidthRef.current + delta;
      if (col.minWidth) next = Math.max(next, col.minWidth);
      if (col.maxWidth) next = Math.min(next, col.maxWidth);

      setWidths((prev) => ({ ...prev, [key]: next }));
    };

    const handleUp = () => {
      activeKeyRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing, columns]);

  return { widths, startResize, isResizing };
}

export default useResizableColumns;
