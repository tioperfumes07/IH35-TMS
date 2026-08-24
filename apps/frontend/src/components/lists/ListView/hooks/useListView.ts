import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../../api/client";
import type { ActiveFilter, Density, GearState, ListViewColumn } from "../types";

interface SavedViewData {
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  visibleColumns?: Record<string, boolean>;
  pageSize?: number;
  density?: Density;
  activeFilters?: ActiveFilter[];
  includeInactive?: boolean;
  statusFilter?: "all" | "active" | "inactive";
  showBadges?: boolean;
}

interface SavedViewPrefs {
  saved_view?: SavedViewData;
}

const DEBOUNCE_MS = 600;

export interface ListViewHookResult {
  savedView: SavedViewData | null;
  persistView: (data: SavedViewData) => void;
  loading: boolean;
}

export function useListView(
  savedViewsKey: string | undefined,
  // RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP: intentionally unused — see the comment below on why
  // `columns` must never become an effect dependency here. Kept in the signature for API parity
  // with callers; underscore-prefixed so TS's noUnusedParameters doesn't flag deliberate non-use.
  _columns: ListViewColumn<unknown>[]
): ListViewHookResult {
  const [savedView, setSavedView] = useState<SavedViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableId = savedViewsKey ? `listview:${savedViewsKey}` : null;

  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const resp = await apiRequest<SavedViewPrefs>(
          `/api/v1/users/me/table-preferences?table_id=${encodeURIComponent(tableId)}`
        );
        if (!cancelled && resp.saved_view) {
          setSavedView(resp.saved_view);
        }
      } catch {
        // Offline / unauthenticated — no saved view
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // RESIZABLE-TABLE-COLUMN-WIDTHS-FETCH-LOOP: `columns` is never read inside this effect (the fetch
    // only needs `tableId`) but was listed as a dependency anyway. ListView's caller passes `columns`
    // as `columns as ListViewColumn<unknown>[]` — a value that is not stable across renders wherever a
    // caller builds its column list inline (the same unmemoized-array-literal pattern that caused the
    // sibling ResizableTable/useColumnWidths loop). With `columns` as a dependency, `setLoading(true)`
    // → re-render → new `columns` reference → effect re-fires → `setLoading` again, forever: an
    // infinite GET /api/v1/users/me/table-preferences loop for as long as the ListView stayed mounted,
    // live-confirmed on the sibling hook via 130+ back-to-back identical requests on /vendors. Only
    // `tableId` should ever trigger a fresh server fetch.
  }, [tableId]);

  const persistView = useCallback(
    (data: SavedViewData) => {
      if (!tableId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void apiRequest("/api/v1/users/me/table-preferences", {
          method: "PATCH",
          body: { table_id: tableId, saved_view: data },
        }).catch(() => undefined);
      }, DEBOUNCE_MS);
    },
    [tableId]
  );

  return { savedView, persistView, loading };
}

export function buildDefaultGearState<T>(
  columns: ListViewColumn<T>[],
  density: Density = "cozy",
  pageSize = 50
): GearState {
  return {
    visibleColumns: Object.fromEntries(
      columns.map((c) => [c.id, c.visible !== false])
    ),
    includeInactive: true,
    statusFilter: "all",
    showBadges: true,
    pageSize,
    density,
  };
}
