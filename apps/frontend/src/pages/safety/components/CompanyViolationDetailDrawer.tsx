import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeCompanyViolationCorrectiveAction,
  escalateCompanyViolation,
  resolveCompanyViolation,
  updateCompanyViolation,
} from "../../../api/safety";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CompanyViolationCorrectiveActionForm } from "./CompanyViolationCorrectiveActionForm";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  open: boolean;
  violation: Record<string, unknown> | null;
  operatingCompanyId: string;
  onClose: () => void;
  onUpdated: () => void;
};

const DRAWER_TITLE = "Company Violation Detail";

type ViolationActionScope = {
  violationId: string;
  companyId: string;
  generation: number;
};

export function CompanyViolationDetailDrawer({ open, violation, operatingCompanyId, onClose, onUpdated }: Props) {
  // SAF-B24: the panel is now a <div> inside ParityDrawer rather than a bespoke <aside>, so the ref
  // element type follows. Focus behaviour is unchanged.
  const panelRef = useRef<HTMLDivElement>(null);
  const [outcome, setOutcome] = useState<"warning" | "written_reprimand" | "monetary_fine" | "termination" | "dismissed">("warning");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [fineOverrideCents, setFineOverrideCents] = useState("");
  const [correctiveActionDirty, setCorrectiveActionDirty] = useState(false);
  const [attemptClose, setAttemptClose] = useState<() => void>(() => () => {});
  const actionGenerationRef = useRef(0);
  const patchMutation = useMutation({
    mutationFn: (input: ViolationActionScope & { payload: Record<string, unknown> }) =>
      updateCompanyViolation(input.violationId, input.companyId, input.payload),
    onSuccess: (_result, input) => {
      if (input.generation === actionGenerationRef.current) onUpdated();
    },
  });
  const completeMutation = useMutation({
    mutationFn: (input: ViolationActionScope & { completedDate: string; notes: string }) =>
      completeCompanyViolationCorrectiveAction(input.violationId, input.companyId, {
        completed_date: input.completedDate,
        notes: input.notes,
      }),
    onSuccess: (_result, input) => {
      if (input.generation === actionGenerationRef.current) onUpdated();
    },
  });
  const escalateMutation = useMutation({
    mutationFn: (input: ViolationActionScope) =>
      escalateCompanyViolation(input.violationId, input.companyId, "Escalated from Safety UI"),
    onSuccess: (_result, input) => {
      if (input.generation === actionGenerationRef.current) onUpdated();
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (input: ViolationActionScope & {
      outcome: typeof outcome;
      resolutionNotes: string;
      fineAmountCentsOverride?: number;
    }) =>
      resolveCompanyViolation(input.violationId, input.companyId, {
        outcome: input.outcome,
        resolutionNotes: input.resolutionNotes,
        fineAmountCentsOverride: input.fineAmountCentsOverride,
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      onUpdated();
      setResolutionNotes("");
      setFineOverrideCents("");
    },
  });
  const resetPatchMutation = patchMutation.reset;
  const resetCompleteMutation = completeMutation.reset;
  const resetEscalateMutation = escalateMutation.reset;
  const resetResolveMutation = resolveMutation.reset;

  const resetActionState = useCallback(() => {
    actionGenerationRef.current += 1;
    setOutcome("warning");
    setResolutionNotes("");
    setFineOverrideCents("");
    setCorrectiveActionDirty(false);
    resetPatchMutation();
    resetCompleteMutation();
    resetEscalateMutation();
    resetResolveMutation();
  }, [resetCompleteMutation, resetEscalateMutation, resetPatchMutation, resetResolveMutation]);

  useEffect(() => {
    resetActionState();
  }, [open, operatingCompanyId, violation?.id, resetActionState]);

  const actionPending = patchMutation.isPending || completeMutation.isPending || escalateMutation.isPending || resolveMutation.isPending;
  const handleClose = useCallback(() => {
    if (actionPending) return;
    resetActionState();
    onClose();
  }, [actionPending, onClose, resetActionState]);

  useEffect(() => {
    if (!open || !violation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, violation]);

  useEffect(() => {
    if (!open || !violation) return;
    const firstInput = panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea");
    firstInput?.focus();
  }, [open, violation]);

  const currentViolationId = String(violation?.id ?? "");
  const isCurrentAction = (variables: ViolationActionScope | undefined) =>
    variables?.violationId === currentViolationId &&
    variables?.companyId === operatingCompanyId &&
    variables?.generation === actionGenerationRef.current;
  const patchErrorCurrent = patchMutation.isError && isCurrentAction(patchMutation.variables);
  const escalateErrorCurrent = escalateMutation.isError && isCurrentAction(escalateMutation.variables);
  const resolveErrorCurrent = resolveMutation.isError && isCurrentAction(resolveMutation.variables);
  const completeErrorCurrent = completeMutation.isError && isCurrentAction(completeMutation.variables);
  const currentActionError = patchErrorCurrent
    ? patchMutation.error
    : escalateErrorCurrent
      ? escalateMutation.error
      : null;

  if (!open || !violation) return null;
  const driverLabels = (violation.related_driver_labels && typeof violation.related_driver_labels === "object"
    ? violation.related_driver_labels
    : {}) as Record<string, unknown>;
  const unitLabels = (violation.related_unit_labels && typeof violation.related_unit_labels === "object"
    ? violation.related_unit_labels
    : {}) as Record<string, unknown>;

  return (
    <>
      {/* SAF-B24: was a bespoke <aside> carrying its own backdrop, z-index, width, escape handling
          and close button — a second drawer implementation living beside the shared one, so every
          fix to drawer chrome had to be made twice and this copy silently drifted. ParityDrawer is
          the single surface. The panel ref is retained for the existing focus behaviour, and the
          data-testid moves onto the inner content so existing selectors keep resolving. */}
      <ParityDrawer
        open
        onClose={handleClose}
        title={DRAWER_TITLE}
        size="wide"
        confirmDiscardOnClose
        isDirty={outcome !== "warning" || Boolean(resolutionNotes.trim() || fineOverrideCents.trim()) || correctiveActionDirty}
        onRegisterAttemptClose={(next) => setAttemptClose(() => next)}
        footer={<button type="button" className="rounded-sm border border-slate-300 px-3 py-1 text-xs font-semibold" disabled={actionPending} onClick={attemptClose}>Close</button>}
      >
        <div ref={panelRef} data-testid="company-violation-detail-drawer" className="space-y-2 text-sm">
          <div><strong>Status:</strong> {String(violation.status ?? "open")}</div>
          <div><strong>Type:</strong> {String(violation.violation_type ?? "—")}</div>
          <div><strong>Severity:</strong> {String(violation.violation_severity ?? "—")}</div>
          <div><strong>Description:</strong> {String(violation.description ?? "—")}</div>
          <div>
            <strong>Related drivers:</strong>{" "}
            {Array.isArray(violation.related_driver_ids) && (violation.related_driver_ids as unknown[]).length > 0
              ? (violation.related_driver_ids as unknown[]).map((id, idx) => {
                  const driverId = String(id ?? "");
                  if (!driverId) return null;
                  return (
                    <span key={driverId}>
                      {idx > 0 ? ", " : ""}
                      <EntityLink kind="driver" id={driverId} label={entityLabel(driverLabels[driverId], driverId, "Driver")} />
                    </span>
                  );
                })
              : "—"}
          </div>
          <div>
            <strong>Related units:</strong>{" "}
            {Array.isArray(violation.related_unit_ids) && (violation.related_unit_ids as unknown[]).length > 0
              ? (violation.related_unit_ids as unknown[]).map((id, idx) => {
                  const unitId = String(id ?? "");
                  if (!unitId) return null;
                  return (
                    <span key={unitId}>
                      {idx > 0 ? ", " : ""}
                      <EntityLink kind="unit" id={unitId} label={entityLabel(unitLabels[unitId], unitId, "Unit")} />
                    </span>
                  );
                })
              : "—"}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            disabled={actionPending}
            onClick={() => patchMutation.mutate({
              violationId: String(violation.id ?? ""),
              companyId: operatingCompanyId,
              generation: actionGenerationRef.current,
              payload: { status: "in_progress" },
            })}
          >
            Mark In Progress
          </button>
          <button
            type="button"
            className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            disabled={actionPending}
            onClick={() => escalateMutation.mutate({
              violationId: String(violation.id ?? ""),
              companyId: operatingCompanyId,
              generation: actionGenerationRef.current,
            })}
          >
            Escalate
          </button>
        </div>
        {(patchErrorCurrent || escalateErrorCurrent) ? (
          <p className="mt-2 text-xs text-red-700" data-testid="company-violation-action-error">
            {userFacingApiError(
              currentActionError,
              "Could not update the company violation.",
            )}
          </p>
        ) : null}

        <div className="mt-4 rounded-sm border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resolve Violation</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Outcome
              <SelectCombobox
                className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-2 text-xs"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value as typeof outcome)}
              >
                <option value="warning">Warning</option>
                <option value="written_reprimand">Written reprimand</option>
                <option value="monetary_fine">Monetary fine</option>
                <option value="termination">Termination</option>
                <option value="dismissed">Dismissed</option>
              </SelectCombobox>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Fine Override (USD)
              {/* M-1: was raw "(cents)"; cents-mode MoneyInput; Number(fineOverrideCents) unchanged. */}
              <MoneyInput
                valueCents={fineOverrideCents ? Number(fineOverrideCents) : null}
                onChangeCents={(c) => setFineOverrideCents(c == null ? "" : String(c))}
                ariaLabel="Fine Override (USD)"
                placeholder="Optional"
                disabled={outcome !== "monetary_fine"}
                className="mt-1 w-full"
              />
            </label>
            <label className="text-xs font-medium text-slate-700 md:col-span-2">
              Resolution Notes (minimum 20 characters)
              <textarea
                className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-2 text-xs"
                rows={3}
                value={resolutionNotes}
                onChange={(event) => setResolutionNotes(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-2">
            <button
              type="button"
              className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionPending || resolutionNotes.trim().length < 20}
              onClick={() => resolveMutation.mutate({
                violationId: String(violation.id ?? ""),
                companyId: operatingCompanyId,
                generation: actionGenerationRef.current,
                outcome,
                resolutionNotes: resolutionNotes.trim(),
                fineAmountCentsOverride: fineOverrideCents.trim() ? Number(fineOverrideCents) : undefined,
              })}
            >
              Resolve & Apply Outcome
            </button>
            {resolveErrorCurrent ? (
              <p className="mt-2 text-xs text-red-700" data-testid="company-violation-resolve-error">
                {userFacingApiError(resolveMutation.error, "Could not resolve the company violation.")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <CompanyViolationCorrectiveActionForm
            key={`${operatingCompanyId}:${String(violation.id ?? "")}`}
            loading={completeMutation.isPending}
            onDirtyChange={setCorrectiveActionDirty}
            onComplete={(completedDate, notes) => completeMutation.mutate({
              violationId: String(violation.id ?? ""),
              companyId: operatingCompanyId,
              generation: actionGenerationRef.current,
              completedDate,
              notes,
            })}
          />
          {completeErrorCurrent ? (
            <p className="mt-2 text-xs text-red-700" data-testid="company-violation-complete-error">
              {userFacingApiError(completeMutation.error, "Could not complete the corrective action.")}
            </p>
          ) : null}
        </div>
      </ParityDrawer>
    </>
  );
}
