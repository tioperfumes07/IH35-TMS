import { getUserPreferences, patchUserPreferences } from "../api/safety";

export type ModalSizePreset = "sm" | "md" | "lg" | "xl";

/** Minimum dimensions (px) per preset — resize cannot shrink below these. */
/** 443.295 (owner 2026-10-23): no popup is 85% of the window. Caps are the size.
 *  A modal that names no preset is md. A size the user saved by resizing still wins. */
export const MODAL_MAX_DEFAULT_W: Record<ModalSizePreset, number> = {
  sm: 480,
  md: 720,
  lg: 960,
  xl: 1280,
};

/** Tailwind max-width for a centered modal that has not been resized. */
export const MODAL_WIDTH_CLASS: Record<ModalSizePreset, string> = {
  sm: "max-w-[min(480px,calc(100vw-2rem))]",
  md: "max-w-[min(720px,calc(100vw-2rem))]",
  lg: "max-w-[min(960px,calc(100vw-2rem))]",
  xl: "max-w-[min(1280px,calc(100vw-2rem))]",
};

export const MODAL_MIN_BY_PRESET: Record<ModalSizePreset, { w: number; h: number }> = {
  sm: { w: 320, h: 240 },
  md: { w: 480, h: 360 },
  lg: { w: 720, h: 540 },
  xl: { w: 960, h: 720 },
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
