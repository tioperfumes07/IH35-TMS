// GAP-14: Pre-Dispatch Validation Panel.
// Fetches validation data when driver/unit/customer changes; surfaces blockers and warnings.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ValidationPanel, type ValidationResult } from "../shared/ValidationPanel";

type Props = {
  operatingCompanyId: string;
  driverUuid?: string | null;
  unitUuid?: string | null;
  trailerUuid?: string | null;
  customerId?: string | null;
  /** Optional human labels when the parent already resolved them (Book Load form). */
  driverLabel?: string | null;
  unitLabel?: string | null;
  trailerLabel?: string | null;
  customerLabel?: string | null;
  /** Reports readiness and advisory state; only blockers gate the Book button. */
  onValidationChange?: (canDispatch: boolean, hasBlockers: boolean, hasWarnings: boolean) => void;
  /** Override reason collected by the parent (BookLoadModalV4). */
  overrideReason?: string;
  onOverrideReasonChange?: (reason: string) => void;
  /** OWNER-ALWAYS-OVERRIDE: true only for the Owner role (BookLoadModalV4 canOverrideHardBlock). */
  canOwnerOverride?: boolean;
  /** Submits the booking with override=true. Present only when canOwnerOverride. */
  onOwnerOverride?: () => void;
};

const EMPTY_RESULT: ValidationResult = {
  blockers: [],
  warnings: [],
  info: [],
  can_dispatch: true,
};

async function fetchPreDispatchValidation(body: {
  operating_company_id: string;
  driver_uuid?: string | null;
  unit_uuid?: string | null;
  trailer_uuid?: string | null;
  customer_id?: string | null;
}): Promise<ValidationResult> {
  return apiRequest<ValidationResult>("/api/v1/dispatch/validation/pre-dispatch", {
    method: "POST",
    body,
  });
}

export function PreDispatchValidationPanel({
  operatingCompanyId,
  driverUuid,
  unitUuid,
  trailerUuid,
  customerId,
  driverLabel,
  unitLabel,
  trailerLabel,
  customerLabel,
  onValidationChange,
  overrideReason,
  onOverrideReasonChange,
  canOwnerOverride = false,
  onOwnerOverride,
}: Props) {
  const [result, setResult] = useState<ValidationResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgedRules, setAcknowledgedRules] = useState<Set<string>>(new Set());
  const [retryGeneration, setRetryGeneration] = useState(0);

  // Re-run whenever any key input changes.
  const inputKey = useMemo(
    () => [operatingCompanyId, driverUuid, unitUuid, trailerUuid, customerId].join("|"),
    [operatingCompanyId, driverUuid, unitUuid, trailerUuid, customerId]
  );

  useEffect(() => {
    setLoading(false);
    setError(null);
    setAcknowledgedRules(new Set());
    // Only run if there's something to validate.
    if (!driverUuid && !unitUuid && !customerId) {
      setResult(EMPTY_RESULT);
      onValidationChange?.(true, false, false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchPreDispatchValidation({
      operating_company_id: operatingCompanyId,
      driver_uuid: driverUuid,
      unit_uuid: unitUuid,
      trailer_uuid: trailerUuid,
      customer_id: customerId,
    })
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        onValidationChange?.(data.can_dispatch, data.blockers.length > 0, data.warnings.length > 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Validation check failed.");
        setResult(EMPTY_RESULT);
        // A failed preview is not a passing preview. The server remains the submit-time authority,
        // but telling the parent `true` made Section D render "All checks pass · ready to book"
        // directly above this unavailable error. Preserve no fabricated blockers while making the
        // readiness signal honestly unavailable/not-passing.
        onValidationChange?.(false, false, false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey, retryGeneration]);

  const handleAck = useCallback((ruleId: string) => {
    setAcknowledgedRules((prev) => {
      const next = new Set(prev);
      next.add(ruleId);
      return next;
    });
  }, []);

  const hasBlockers = result.blockers.length > 0;
  const hasUnackedBlockers = result.blockers.some((b) => !acknowledgedRules.has(b.rule_id));

  return (
    <div className="space-y-2" data-testid="pre-dispatch-validation-panel">
      {/* Exact Leaves dispatch.panel.pre_dispatch_validation:unit|trailer|customer|driver —
          validation used UUIDs as query params only; expose real EntityLinks for selected identities. */}
      {(driverUuid || unitUuid || trailerUuid || customerId) ? (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700"
          data-testid="pre-dispatch-validation-entitylinks"
        >
          {driverUuid ? (
            <span>
              Driver:{" "}
              <EntityLinkOrTombstone kind="driver" id={driverUuid} name={driverLabel} noun="Driver" />
            </span>
          ) : null}
          {unitUuid ? (
            <span>
              Unit: <EntityLinkOrTombstone kind="unit" id={unitUuid} name={unitLabel} noun="Unit" />
            </span>
          ) : null}
          {trailerUuid ? (
            <span>
              Trailer:{" "}
              <EntityLinkOrTombstone kind="trailer" id={trailerUuid} name={trailerLabel} noun="Trailer" />
            </span>
          ) : null}
          {customerId ? (
            <span>
              Customer:{" "}
              <EntityLinkOrTombstone kind="customer" id={customerId} name={customerLabel} noun="Customer" />
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">
          <span>Pre-dispatch check unavailable: {error}</span>
          <button
            type="button"
            className="ml-3 rounded-sm border border-slate-300 bg-white px-2 py-1 font-medium"
            onClick={() => setRetryGeneration((generation) => generation + 1)}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      ) : (
        <ValidationPanel
          result={result}
          loading={loading}
          acknowledgedRules={acknowledgedRules}
          onAck={handleAck}
        />
      )}

      {hasBlockers && !loading && (
        <div className="rounded-sm border border-red-200 bg-red-50 p-2.5 text-xs">
          <div className="mb-1.5 font-semibold text-red-800">
            Override required to dispatch with active blocker(s).
          </div>
          <textarea
            value={overrideReason ?? ""}
            onChange={(e) => onOverrideReasonChange?.(e.target.value)}
            className="w-full rounded-sm border border-red-300 px-2 py-1 text-xs"
            rows={2}
            placeholder="Override reason (min 10 chars) — this creates an audit log entry"
          />
          {/* OWNER-ALWAYS-OVERRIDE (owner ruling 2026-08-02): the Owner is never told to contact an
              owner. Previously this line rendered for EVERY role, so the Owner — the only role that
              can authorize — was sent to find themselves, with a textarea that could not be typed in.
              The blocker may be WRONG (credential valid in reality but stale/missing/unreadable in the
              system); the Owner carries that liability and attests on the record. The reason is
              required at >=10 chars here AND re-enforced server-side, where the override is written to
              the append-only audit trail with who/when/why/which-reasons. */}
          {canOwnerOverride ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-red-700">
                Owner override — this is recorded to the audit trail with your name, the time, and the
                exact blockers overridden.
              </span>
              <button
                type="button"
                disabled={(overrideReason ?? "").trim().length < 10 || !onOwnerOverride}
                onClick={() => onOwnerOverride?.()}
                className="shrink-0 rounded-sm border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-800 disabled:opacity-40 hover:bg-red-100"
              >
                Override &amp; dispatch
              </button>
            </div>
          ) : (
            hasUnackedBlockers && (
              <div className="mt-1 text-[10px] text-red-600">
                Dispatcher-level override requires owner approval. Contact your owner to proceed.
              </div>
            )
          )}
        </div>
      )}

      {!loading && !error && (
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>
            {result.blockers.length > 0
              ? `${result.blockers.length} blocker(s) — override required to dispatch`
              : result.warnings.length > 0
              ? `${result.warnings.length} warning(s) — acknowledge to note, booking still allowed`
              : "All checks pass"}
          </span>
        </div>
      )}
    </div>
  );
}
