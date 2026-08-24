import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api/client";

const MIN_WIDTH = 60;
const MAX_WIDTH = 800;
const DEBOUNCE_MS = 500;

type ColumnWidths = Record<string, number>;

function storageKey(tableId: string) {
  return `ih35:table-widths:${tableId}`;
}

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function readLocal(tableId: string): ColumnWidths {
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ColumnWidths;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, clampWidth(Number(value) || MIN_WIDTH)])
    );
  } catch {
    return {};
  }
}

function writeLocal(tableId: string, widths: ColumnWidths) {
  try {
    localStorage.setItem(storageKey(tableId), JSON.stringify(widths));
  } catch {
    // Safari ITP / private mode — local-only best effort
  }
}

export function useColumnWidths(tableId: string, defaultWidths: ColumnWidths) {
  const [widths, setWidths] = useState<ColumnWidths>(() => ({
    ...defaultWidths,
    ...readLocal(tableId),
  }));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverLoadedRef = useRef(false);

  // RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP: callers (ResizableTable) build `defaultWidths` as a
  // fresh object literal every render (`Object.fromEntries(columns.map(...))`, no memo) from a
  // `columns` prop that is ITSELF a fresh array literal every render — so no amount of memoizing the
  // caller alone fixes this; the caller's identity churn is effectively unavoidable without a bigger
  // refactor. With `defaultWidths` in this effect's dependency array, every render re-ran the fetch,
  // whose `setWidths` triggered another render, whose new `defaultWidths` re-ran the fetch again — an
  // infinite GET /api/v1/users/me/table-preferences loop for as long as the table stayed mounted.
  // Live-confirmed on /vendors: 130+ identical requests fired back-to-back, still climbing after
  // navigating away to an unrelated page (the effect from the unmounted Vendors tree was still
  // in-flight releasing new fetches). Fix: a ref carries the LATEST defaultWidths into the effect
  // without being a dependency, so the effect only re-runs on a real `tableId` change — exactly the
  // one thing that should ever require a fresh server fetch.
  const defaultWidthsRef = useRef(defaultWidths);
  defaultWidthsRef.current = defaultWidths;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiRequest<{ column_widths?: ColumnWidths }>(
          `/api/v1/users/me/table-preferences?table_id=${encodeURIComponent(tableId)}`
        );
        if (cancelled || !response.column_widths) return;
        serverLoadedRef.current = true;
        setWidths((prev) => ({
          ...defaultWidthsRef.current,
          ...prev,
          ...Object.fromEntries(
            Object.entries(response.column_widths ?? {}).map(([k, v]) => [k, clampWidth(Number(v) || MIN_WIDTH)])
          ),
        }));
      } catch {
        // Offline / unauthenticated — localStorage only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  const persistServer = useCallback(
    (next: ColumnWidths) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void apiRequest("/api/v1/users/me/table-preferences", {
          method: "PATCH",
          body: { table_id: tableId, column_widths: next },
        }).catch(() => undefined);
      }, DEBOUNCE_MS);
    },
    [tableId]
  );

  const setWidth = useCallback(
    (columnId: string, width: number) => {
      const clamped = clampWidth(width);
      setWidths((prev) => {
        const next = { ...prev, [columnId]: clamped };
        writeLocal(tableId, next);
        if (serverLoadedRef.current || Object.keys(prev).length > 0) {
          persistServer(next);
        }
        return next;
      });
    },
    [persistServer, tableId]
  );

  return useMemo(
    () => ({
      widths,
      setWidth,
      minWidth: MIN_WIDTH,
      maxWidth: MAX_WIDTH,
      getWidth: (columnId: string, fallback = MIN_WIDTH) => widths[columnId] ?? fallback,
    }),
    [setWidth, widths]
  );
}
