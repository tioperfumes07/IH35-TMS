import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  completeCompanyViolationCorrectiveAction,
  escalateCompanyViolation,
  resolveCompanyViolation,
  updateCompanyViolation,
} from "../../../api/safety";
import { CompanyViolationCorrectiveActionForm } from "./CompanyViolationCorrectiveActionForm";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  violation: Record<string, unknown> | null;
  operatingCompanyId: string;
  onClose: () => void;
  onUpdated: () => void;
};

export function CompanyViolationDetailDrawer({ open, violation, operatingCompanyId, onClose, onUpdated }: Props) {
  const [outcome, setOutcome] = useState<"warning" | "written_reprimand" | "monetary_fine" | "termination" | "dismissed">("warning");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [fineOverrideCents, setFineOverrideCents] = useState("");
  const patchMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      updateCompanyViolation(String(violation?.id ?? ""), operatingCompanyId, payload),
    onSuccess: onUpdated,
  });
  const completeMutation = useMutation({
    mutationFn: ({ completedDate, notes }: { completedDate: string; notes: string }) =>
      completeCompanyViolationCorrectiveAction(String(violation?.id ?? ""), operatingCompanyId, {
        completed_date: completedDate,
        notes,
      }),
    onSuccess: onUpdated,
  });
  const escalateMutation = useMutation({
    mutationFn: () => escalateCompanyViolation(String(violation?.id ?? ""), operatingCompanyId, "Escalated from Safety UI"),
    onSuccess: onUpdated,
  });
  const resolveMutation = useMutation({
    mutationFn: () =>
      resolveCompanyViolation(String(violation?.id ?? ""), operatingCompanyId, {
        outcome,
        resolutionNotes,
        fineAmountCentsOverride: fineOverrideCents.trim() ? Number(fineOverrideCents) : undefined,
      }),
    onSuccess: () => {
      onUpdated();
      setResolutionNotes("");
      setFineOverrideCents("");
    },
  });

  if (!open || !violation) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[560px] max-w-full overflow-y-auto border-l border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Company Violation Detail</h3>
          <button type="button" className="text-xs text-gray-500" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div><strong>Status:</strong> {String(violation.status ?? "open")}</div>
          <div><strong>Type:</strong> {String(violation.violation_type ?? "—")}</div>
          <div><strong>Severity:</strong> {String(violation.violation_severity ?? "—")}</div>
          <div><strong>Description:</strong> {String(violation.description ?? "—")}</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            onClick={() => patchMutation.mutate({ status: "in_progress" })}
          >
            Mark In Progress
          </button>
          <button
            type="button"
            className="rounded bg-amber-700 px-3 py-1 text-xs font-semibold text-white"
            onClick={() => escalateMutation.mutate()}
          >
            Escalate
          </button>
        </div>

        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resolve Violation</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Outcome
              <SelectCombobox
                className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-xs"
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
              Fine Override (cents)
              <input
                className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-xs"
                type="number"
                min={1}
                step={1}
                value={fineOverrideCents}
                onChange={(event) => setFineOverrideCents(event.target.value)}
                placeholder="Optional"
                disabled={outcome !== "monetary_fine"}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 md:col-span-2">
              Resolution Notes (minimum 20 characters)
              <textarea
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                rows={3}
                value={resolutionNotes}
                onChange={(event) => setResolutionNotes(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-2">
            <button
              type="button"
              className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={resolveMutation.isPending || resolutionNotes.trim().length < 20}
              onClick={() => resolveMutation.mutate()}
            >
              Resolve & Apply Outcome
            </button>
          </div>
        </div>

        <div className="mt-4">
          <CompanyViolationCorrectiveActionForm
            loading={completeMutation.isPending}
            onComplete={(completedDate, notes) => completeMutation.mutate({ completedDate, notes })}
          />
        </div>
      </aside>
    </>
  );
}
