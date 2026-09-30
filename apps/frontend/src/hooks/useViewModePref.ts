import { useCallback, useEffect, useRef, useState } from "react";
import { getUserPreferences, patchUserPreferences } from "../api/safety";

export type EntityViewMode = "list" | "master-detail";

const STORAGE_PREFIX = "ih35:view-mode:";
const CHOSEN_SUFFIX = ":chosen";

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

function readChosen(key: string): boolean {
  try {
    return localStorage.getItem(`${key}${CHOSEN_SUFFIX}`) === "1";
  } catch {
    return false;
  }
}

function writeChosen(key: string) {
  try {
    localStorage.setItem(`${key}${CHOSEN_SUFFIX}`, "1");
  } catch {
    // private mode
  }
}

// CLOSURE-31 + C-02 (2026-09-30): DEFAULT is master-detail. localStorage may only override
// AFTER an explicit user click (chosen flag). Cleared storage / first visit → master-detail.
const DEFAULT_VIEW_MODE: EntityViewMode = "master-detail";

export function useViewModePref(
  entity: "customers" | "vendors" | "drivers",
  defaultMode: EntityViewMode = DEFAULT_VIEW_MODE
) {
  const storageKey = `${STORAGE_PREFIX}${entity}`;
  const prefKey = `${entity}_view_mode`;

  // C-02: seed from code default only. Do NOT read localStorage for the initial value —
  // stale "list" from a never-chosen session must not win over the house default.
  const [viewMode, setViewModeState] = useState<EntityViewMode>(() => defaultMode);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingModeRef = useRef<EntityViewMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Explicit local choice (user clicked) may restore immediately.
    if (readChosen(storageKey)) {
      const local = readLocal(storageKey);
      if (local && !cancelled) setViewModeState(local);
    }
    void (async () => {
      try {
        const prefs = await getUserPreferences();
        const fromServer = prefs.preferences?.[prefKey];
        if (!cancelled && (fromServer === "list" || fromServer === "master-detail")) {
          // Server preference is an explicit prior save — treat as chosen.
          setViewModeState(fromServer);
          writeLocal(storageKey, fromServer);
          writeChosen(storageKey);
        }
      } catch {
        // offline / unauthenticated
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefKey, storageKey]);

  const persistMode = useCallback(async (mode: EntityViewMode) => {
    try {
      await patchUserPreferences({ [prefKey]: mode });
      setSaveError(null);
    } catch {
      setSaveError("View preference could not be saved. This selection is temporary.");
    }
  }, [prefKey]);

  const setViewMode = useCallback((mode: EntityViewMode) => {
    pendingModeRef.current = mode;
    setSaveError(null);
    setViewModeState(mode);
    writeLocal(storageKey, mode);
    writeChosen(storageKey);
    void persistMode(mode);
  }, [persistMode, storageKey]);

  const retryViewModeSave = useCallback(() => {
    if (pendingModeRef.current) void persistMode(pendingModeRef.current);
  }, [persistMode]);

  return { viewMode, setViewMode, viewModeSaveError: saveError, retryViewModeSave };
}
