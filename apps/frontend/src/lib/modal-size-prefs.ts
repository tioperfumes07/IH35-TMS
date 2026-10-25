import { getUserPreferences, patchUserPreferences } from "../api/safety";

export type ModalSizePreset = "sm" | "md" | "lg" | "xl";

/**
 * ROUND 443.295 popup standard (owner 10-23 / 10-25):
 *   sm 480 · md 720 · lg 960 · xl 1,280
 * A Modal with no sizePreset defaults to md (never 85% of the window).
 * A user-resized size still wins when persisted under modalKind.
 */
export const MODAL_MAX_DEFAULT_W: Record<ModalSizePreset, number> = {
  sm: 480,
  md: 720,
  lg: 960,
  xl: 1280,
};

/** Minimum dimensions (px) per preset — resize cannot shrink below these. */
export const MODAL_MIN_BY_PRESET: Record<ModalSizePreset, { w: number; h: number }> = {
  sm: { w: 360, h: 240 },
  md: { w: 480, h: 360 },
  lg: { w: 640, h: 480 },
  xl: { w: 800, h: 540 },
};

export type StoredModalSize = { w: number; h: number };

type PrefsUi = { modal_sizes?: Record<string, StoredModalSize> };

export function readModalSizeFromPrefs(preferences: Record<string, unknown> | undefined, kind: string): StoredModalSize | null {
  const ui = (preferences?.ui ?? {}) as PrefsUi;
  const raw = ui.modal_sizes?.[kind];
  if (!raw || typeof raw.w !== "number" || typeof raw.h !== "number") return null;
  return { w: Math.round(raw.w), h: Math.round(raw.h) };
}

export async function persistModalSize(kind: string, size: StoredModalSize): Promise<void> {
  const previous = await getUserPreferences();
  const existing = ((previous.preferences?.ui ?? {}) as PrefsUi).modal_sizes ?? {};
  await patchUserPreferences({
    ui: {
      ...((previous.preferences?.ui ?? {}) as Record<string, unknown>),
      modal_sizes: { ...existing, [kind]: { w: Math.round(size.w), h: Math.round(size.h) } },
    },
  });
}
