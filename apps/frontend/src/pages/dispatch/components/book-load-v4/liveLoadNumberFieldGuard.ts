import type { UseFormSetValue } from "react-hook-form";

/** Tracks whether the dispatcher manually typed AlwaysTrack # — autofill/template must not clobber it. */
export type LiveLoadNumberUserTypedRef = { current: boolean };

export function createLiveLoadNumberUserTypedRef(): LiveLoadNumberUserTypedRef {
  return { current: false };
}

export function resetLiveLoadNumberUserTyped(ref: LiveLoadNumberUserTypedRef) {
  ref.current = false;
}

export function markLiveLoadNumberUserTyped(ref: LiveLoadNumberUserTypedRef) {
  ref.current = true;
}

export function setLiveLoadNumberUnlessUserTyped(
  setValue: UseFormSetValue<{ live_load_number: string }>,
  ref: LiveLoadNumberUserTypedRef,
  value: string,
  options?: { shouldDirty?: boolean },
) {
  if (ref.current) return;
  setValue("live_load_number", value, { shouldDirty: options?.shouldDirty ?? false });
}

/** Apply live_load_number from template/OCR JSON only when the dispatcher has not typed yet. */
export function applyLiveLoadNumberFromJsonUnlessUserTyped(
  setValue: UseFormSetValue<{ live_load_number: string }>,
  ref: LiveLoadNumberUserTypedRef,
  json: Record<string, unknown>,
) {
  const raw = json.live_load_number;
  if (typeof raw !== "string") return;
  const trimmed = raw.trim();
  if (!trimmed) return;
  setLiveLoadNumberUnlessUserTyped(setValue, ref, trimmed, { shouldDirty: true });
}
