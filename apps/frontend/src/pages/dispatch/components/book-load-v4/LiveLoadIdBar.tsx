import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../../api/client";
import { peekNextLoadNumber } from "../../../../api/dispatch";
import { QboDocumentNumberField } from "../../../../components/forms/QboDocumentNumberField";

export type LiveReservation = {
  reservation_uuid: string;
  load_number: string;
  reserved_until: string;
  ttl_seconds: number;
};

type Props = {
  operatingCompanyId: string;
  onReservationUpdate: (r: LiveReservation | null) => void;
};

const FIRST_LOAD_REQUIRED = "first_load_number_required";

function apiErrorCode(err: unknown): string {
  if (err instanceof ApiError) {
    const payload = err.data;
    if (payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string") {
      return String((payload as { error: string }).error);
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "";
}

function isFirstLoadNumberRequired(err: unknown): boolean {
  const code = apiErrorCode(err);
  return code === FIRST_LOAD_REQUIRED || code.includes(FIRST_LOAD_REQUIRED);
}

/**
 * P0 2026-09-14 (LOAD-NUMBER-COUNTER-BURN-ON-OPEN) — this component used to call
 * reserveDispatchLoadId on every mount, which spent a real, permanent load number (via
 * lib.next_trace_no()) the instant the wizard opened, whether or not a load was ever created.
 * Live-proven the same day: last_trace_no 13611 -> open wizard -> close without saving -> 13612.
 * Sixteen numbers burned in ninety minutes of ordinary use, zero loads created.
 *
 * FIX: this bar now only PEEKS (peekNextLoadNumber — a pure read, never writes, never increments)
 * to show a live PREVIEW of what the next number would be right now. No reservation is created, so
 * there is nothing to renew, nothing to release, nothing to abandon. The real, permanent
 * allocation happens exactly once — atomically, via the existing lib.next_trace_no() sequence —
 * only at the moment the load is actually saved (book-load.service.ts's own
 * `if (!loadNumber) { reserveNextLoadId(...) }` fallback, which already existed and was simply
 * unreachable in practice because this component always pre-empted it with a proactive
 * open-time reservation).
 *
 * Two dispatchers opening the wizard at once may briefly see the same preview number — that is
 * not a collision. Peeking issues nothing; only the real save-time allocator issues a number, and
 * it remains atomic (whoever's save transaction reaches it first gets it). The second
 * dispatcher's stale preview simply never matches what they end up actually submitting with; the
 * number shown to them after a successful save is always the real one.
 */
export function LiveLoadIdBar({ operatingCompanyId, onReservationUpdate }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [manualNumber, setManualNumber] = useState("");
  const manualNumberRef = useRef("");
  manualNumberRef.current = manualNumber;
  const [error, setError] = useState<string | null>(null);
  const [awaitingFirstNumber, setAwaitingFirstNumber] = useState(false);
  const scopeGenerationRef = useRef(0);
  const onUpdateRef = useRef(onReservationUpdate);
  onUpdateRef.current = onReservationUpdate;
  // Tracks whether the OPERATOR has ever touched the box (typed into it, including clearing it to
  // blank on purpose) — as opposed to it merely being empty because nothing has pre-filled it yet.
  // Only pre-fill from a fresh peek while this is still false, so a slow peek response racing a
  // fast typist can never clobber something the operator typed.
  const hasUserEditedRef = useRef(false);

  const publishTypedNumber = useCallback((next: string) => {
    onUpdateRef.current({
      reservation_uuid: "", // no reservation exists in the peek-only flow; submit allocates for real
      load_number: next,
      reserved_until: new Date(Date.now() + 60_000).toISOString(),
      ttl_seconds: 60,
    });
  }, []);

  const doPeek = useCallback(async () => {
    const submittedGeneration = scopeGenerationRef.current;
    const submittedCompanyId = operatingCompanyId;
    setError(null);
    try {
      const r = await peekNextLoadNumber(submittedCompanyId);
      if (scopeGenerationRef.current !== submittedGeneration) return;
      setAwaitingFirstNumber(false);
      setPreview(r.next_number);
      if (!hasUserEditedRef.current) {
        // Pre-fill the BOX visually with the previewed number — still fully editable; the moment
        // the operator types (even to clear it), hasUserEditedRef flips and this branch never
        // fires again. Critically, publish an EMPTY load_number to the parent form here, not the
        // preview: if this got submitted as-is, book-load.service.ts would treat it exactly like
        // a manually-typed number (assertLoadNumberAvailable + direct claim) instead of routing
        // through the real atomic allocator at save time — reintroducing the same race class
        // GO-10-REV-B eliminated, and defeating the whole point of peeking. Leaving it empty here
        // means an unedited submit reaches book-load.service.ts's `if (!loadNumber)` fallback,
        // which allocates for real, atomically, at that exact moment.
        setManualNumber(r.next_number);
        onUpdateRef.current({
          reservation_uuid: "",
          load_number: "",
          reserved_until: new Date(Date.now() + 60_000).toISOString(),
          ttl_seconds: 60,
        });
      } else {
        publishTypedNumber(manualNumberRef.current.trim());
      }
    } catch (err) {
      if (scopeGenerationRef.current !== submittedGeneration) return;
      setPreview(null);
      if (isFirstLoadNumberRequired(err)) {
        setAwaitingFirstNumber(true);
        setError(null);
        publishTypedNumber(manualNumberRef.current.trim());
        return;
      }
      setError(apiErrorCode(err) || "Could not preview the next load number");
      publishTypedNumber(manualNumberRef.current.trim());
    }
  }, [operatingCompanyId, publishTypedNumber]);

  useEffect(() => {
    scopeGenerationRef.current += 1;
    setPreview(null);
    setError(null);
    setAwaitingFirstNumber(false);
    setManualNumber("");
    hasUserEditedRef.current = false;
    onUpdateRef.current(null);
    void doPeek();
    // No cleanup needed: peeking creates nothing to release on unmount.
  }, [doPeek, operatingCompanyId]);

  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="book-load-live-load-id-bar">
      <div className="min-w-[14rem] max-w-[18rem] text-left normal-case tracking-normal text-slate-900">
        <QboDocumentNumberField
          label="Load #"
          value={manualNumber}
          onChange={(next) => {
            // Any operator keystroke — including clearing the box back to blank on purpose — is a
            // deliberate edit from here on; the pre-fill in doPeek() never overwrites it again.
            hasUserEditedRef.current = true;
            setManualNumber(next);
            publishTypedNumber(next);
          }}
          operatingCompanyId={operatingCompanyId}
          // P1 2026-09-14 — no longer used for a caption suggestion here (the box is pre-filled
          // directly from the live peek's own real next number instead); this generic
          // "increment the last-saved row's number" endpoint isn't load-number aware and was
          // live-caught suggesting a non-numeric placeholder load number as the "next" one.
          // checkPath still runs so a typed override that collides with an existing load number
          // is still caught.
          nextNumberPath={undefined}
          checkPath={awaitingFirstNumber ? undefined : "/api/v1/dispatch/loads/next-number"}
          fieldName="load"
          autoFocus={awaitingFirstNumber}
          hint={
            awaitingFirstNumber
              ? "Click the white box and type the first number (example 13508)."
              : "Next number, not reserved yet — type to use a different one."
          }
          data-testid="qbo-document-number-load"
        />
      </div>
      {awaitingFirstNumber ? (
        <span className="pb-5 text-xs font-normal text-slate-600">
          First load for this company — type the Load # in the box. Later loads can stay blank.
        </span>
      ) : error ? (
        <>
          <span className="pb-5 text-xs text-red-700">Load number unavailable: {error}</span>
          <button type="button" className="mb-5 rounded-sm border border-gray-300 px-2 py-1 text-xs" onClick={() => void doPeek()}>
            Retry
          </button>
        </>
      ) : (
        <span className="pb-5 text-xs text-slate-600">{preview ? "Previewed — assigned on save" : "Loading…"}</span>
      )}
    </div>
  );
}
