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
  columns: ListViewColumn<unknown>[]
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
  }, [tableId, columns]);

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
