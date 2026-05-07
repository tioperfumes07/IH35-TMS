import { useMutation } from "@tanstack/react-query";
import { acknowledgeIntegrityAlert, resolveIntegrityAlert } from "../../../api/safety";

type Props = {
  open: boolean;
  alert: Record<string, unknown> | null;
  operatingCompanyId: string;
  onClose: () => void;
  onUpdated: () => void;
};

export function IntegrityAlertDetailDrawer({ open, alert, operatingCompanyId, onClose, onUpdated }: Props) {
  const ackMutation = useMutation({
    mutationFn: () => acknowledgeIntegrityAlert(String(alert?.id ?? ""), operatingCompanyId, "Acknowledged in Safety UI"),
    onSuccess: onUpdated,
  });
  const resolveMutation = useMutation({
    mutationFn: () =>
      resolveIntegrityAlert(String(alert?.id ?? ""), operatingCompanyId, {
        resolution_status: "confirmed_action_taken",
        resolution_action: "Resolved in Safety UI",
      }),
    onSuccess: onUpdated,
  });

  if (!open || !alert) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[560px] max-w-full overflow-y-auto border-l border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Integrity Alert Detail</h3>
          <button type="button" className="text-xs text-gray-500" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div><strong>Category:</strong> {String(alert.alert_category ?? "—")}</div>
          <div><strong>Severity:</strong> {String(alert.severity ?? "—")}</div>
          <div><strong>Subject:</strong> {String(alert.subject_type ?? "—")}</div>
          <div><strong>Status:</strong> {String(alert.resolution_status ?? "unresolved")}</div>
          <div><strong>Summary:</strong> {String(alert.detection_summary ?? "—")}</div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            onClick={() => ackMutation.mutate()}
          >
            Acknowledge
          </button>
          <button
            type="button"
            className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white"
            onClick={() => resolveMutation.mutate()}
          >
            Resolve
          </button>
        </div>
      </aside>
    </>
  );
}
