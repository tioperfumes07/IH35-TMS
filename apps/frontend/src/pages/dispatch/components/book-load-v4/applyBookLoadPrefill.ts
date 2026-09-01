import type { UseFormSetValue } from "react-hook-form";
import { applyLoadTemplateToBookForm, type MinimalBookForm } from "../../LoadTemplateLibrary";
import {
  applyLiveLoadNumberFromJsonUnlessUserTyped,
  type LiveLoadNumberUserTypedRef,
} from "./liveLoadNumberFieldGuard";

/** Template/OCR/rate-con prefill — never overwrites user-typed AlwaysTrack #. */
export function applyBookLoadPrefillToForm(
  setValue: UseFormSetValue<MinimalBookForm & { live_load_number: string }>,
  json: Record<string, unknown>,
  liveLoadNumberUserTypedRef: LiveLoadNumberUserTypedRef,
) {
  applyLoadTemplateToBookForm(setValue as UseFormSetValue<MinimalBookForm>, json);
  applyLiveLoadNumberFromJsonUnlessUserTyped(setValue, liveLoadNumberUserTypedRef, json);
}
