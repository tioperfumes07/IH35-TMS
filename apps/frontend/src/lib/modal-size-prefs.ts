import { getUserPreferences, patchUserPreferences } from "../api/safety";

export type ModalSizePreset = "sm" | "md" | "lg" | "xl";

/** Minimum dimensions (px) per preset — resize cannot shrink below these. */
/** U7 (owner, 2026-10-03): "Create Check is out of proportion — a modal, QBO size". The default width was 85% of the
 *  window — about 2,040 px on a 2,400 px screen, a check form stretched past any proportion. A preset may cap its
 *  default width (a size the user saved by resizing still wins). xl = 1,280 px, QBO's check / bill form proportion. */
export const MODAL_MAX_DEFAULT_W: Partial<Record<string, number>> = { xl: 1280 };

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
