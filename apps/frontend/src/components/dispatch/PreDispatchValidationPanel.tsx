// GAP-14: Pre-Dispatch Validation Panel.
// Fetches validation data when driver/unit/customer changes; surfaces blockers and warnings.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import { ValidationPanel, type ValidationResult } from "../shared/ValidationPanel";

type Props = {
  operatingCompanyId: string;
  driverUuid?: string | null;
  unitUuid?: string | null;
  trailerUuid?: string | null;
  customerId?: string | null;
  /** Called whenever can_dispatch changes — used to gate the Book button. */
  onValidationChange?: (canDispatch: boolean, hasBlockers: boolean) => void;
  /** Override reason collected by the parent (BookLoadModalV4). */
  overrideReason?: string;
  onOverrideReasonChange?: (reason: string) => void;
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
  onValidationChange,
  overrideReason,
  onOverrideReasonChange,
}: Props) {
  const [result, setResult] = useState<ValidationResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgedRules, setAcknowledgedRules] = useState<Set<string>>(new Set());

  // Re-run whenever any key input changes.
  const inputKey = useMemo(
    () => [operatingCompanyId, driverUuid, unitUuid, trailerUuid, customerId].join("|"),
    [operatingCompanyId, driverUuid, unitUuid, trailerUuid, customerId]
  );

  useEffect(() => {
    // Only run if there's something to validate.
    if (!driverUuid && !unitUuid && !customerId) {
      setResult(EMPTY_RESULT);
      onValidationChange?.(true, false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setAcknowledgedRules(new Set());

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
        onValidationChange?.(data.can_dispatch, data.blockers.length > 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Validation check failed.");
        setResult(EMPTY_RESULT);
        onValidationChange?.(true, false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

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
    <div className="space-y-2">
      {error ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Pre-dispatch check unavailable: {error}
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
        <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs">
          <div className="mb-1.5 font-semibold text-red-800">
            Override required to dispatch with active blocker(s).
          </div>
          <textarea
            value={overrideReason ?? ""}
            onChange={(e) => onOverrideReasonChange?.(e.target.value)}
            className="w-full rounded border border-red-300 px-2 py-1 text-xs"
            rows={2}
            placeholder="Override reason (min 10 chars) — this creates an audit log entry"
          />
          {hasUnackedBlockers && (
            <div className="mt-1 text-[10px] text-red-600">
              Dispatcher-level override requires owner approval. Contact your owner to proceed.
            </div>
          )}
        </div>
      )}

      {!loading && !error && (
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>
            {result.blockers.length > 0
              ? `${result.blockers.length} blocker(s) — Book button disabled`
              : result.warnings.length > 0
              ? `${result.warnings.length} warning(s) — Ack to note, booking still allowed`
              : "All checks pass"}
          </span>
          <span className="font-mono">GAP-14</span>
        </div>
      )}
    </div>
  );
}
