import { useCallback, useEffect, useState } from "react";
import { getUserPreferences, patchUserPreferences } from "../api/safety";

export type EntityViewMode = "list" | "master-detail";

const STORAGE_PREFIX = "ih35:view-mode:";

function readLocal(key: string): EntityViewMode | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "list" || stored === "master-detail") return stored;
  } catch {
    // private mode
  }
  return null;
}

function writeLocal(key: string, mode: EntityViewMode) {
  try {
    localStorage.setItem(key, mode);
  } catch {
    // private mode
  }
}

export function useViewModePref(entity: "customers" | "vendors") {
  const storageKey = `${STORAGE_PREFIX}${entity}`;
  const prefKey = `${entity}_view_mode`;

  const [viewMode, setViewModeState] = useState<EntityViewMode>(() => readLocal(storageKey) ?? "list");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await getUserPreferences();
        const fromServer = prefs.preferences?.[prefKey];
        if (!cancelled && (fromServer === "list" || fromServer === "master-detail")) {
          setViewModeState(fromServer);
          writeLocal(storageKey, fromServer);
        }
      } catch {
        // offline / unauthenticated
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefKey, storageKey]);

  const setViewMode = useCallback(
    (mode: EntityViewMode) => {
      setViewModeState(mode);
      writeLocal(storageKey, mode);
      void patchUserPreferences({ [prefKey]: mode }).catch(() => undefined);
    },
    [prefKey, storageKey]
  );

  return { viewMode, setViewMode };
}
