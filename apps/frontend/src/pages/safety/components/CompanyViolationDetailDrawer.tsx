import { useMutation } from "@tanstack/react-query";
import {
  completeCompanyViolationCorrectiveAction,
  escalateCompanyViolation,
  updateCompanyViolation,
} from "../../../api/safety";
import { CompanyViolationCorrectiveActionForm } from "./CompanyViolationCorrectiveActionForm";

type Props = {
  open: boolean;
  violation: Record<string, unknown> | null;
  operatingCompanyId: string;
  onClose: () => void;
  onUpdated: () => void;
};

export function CompanyViolationDetailDrawer({ open, violation, operatingCompanyId, onClose, onUpdated }: Props) {
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
