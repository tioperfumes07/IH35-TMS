import type { UseFormSetValue } from "react-hook-form";
import { applyLoadTemplateToBookForm, type MinimalBookForm } from "../../LoadTemplateLibrary";
import {
  applyLiveLoadNumberFromJsonUnlessUserTyped,
  type LiveLoadNumberUserTypedRef,
} from "./liveLoadNumberFieldGuard";

/** Template/OCR/rate-con prefill — never overwrites user-typed AlwaysTrack #. */
export function applyBookLoadPrefillToForm<T extends MinimalBookForm & { live_load_number: string }>(
  setValue: UseFormSetValue<T>,
  json: Record<string, unknown>,
  liveLoadNumberUserTypedRef: LiveLoadNumberUserTypedRef,
) {
  // Bridge wider Book Load form setValue to MinimalBookForm / live_load_number helpers (RHF Path<T> is invariant).
  applyLoadTemplateToBookForm(setValue as unknown as UseFormSetValue<MinimalBookForm>, json);
  applyLiveLoadNumberFromJsonUnlessUserTyped(
    setValue as unknown as UseFormSetValue<{ live_load_number: string }>,
    liveLoadNumberUserTypedRef,
    json,
  );
}
