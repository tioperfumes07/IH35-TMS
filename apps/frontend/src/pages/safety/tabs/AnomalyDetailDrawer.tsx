import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ackAnomaly, dismissAnomaly, getAnomaly, resolveAnomaly, type SafetyAnomaly } from "../../../api/safety";
import { ModalCloseButton } from "../../../components/ModalCloseButton";
import { useEscapeKey } from "../../../hooks/useEscapeKey";

type Props = {
  open: boolean;
  anomalyId: string | null;
  operatingCompanyId: string;
  onClose: () => void;
  onUpdated: () => void;
  initialAnomaly?: SafetyAnomaly | null;
};

export function AnomalyDetailDrawer({
  open,
  anomalyId,
  operatingCompanyId,
  onClose,
  onUpdated,
  initialAnomaly = null,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const detailQuery = useQuery({
    queryKey: ["safety", "anomaly", operatingCompanyId, anomalyId],
    queryFn: () => getAnomaly(String(anomalyId), operatingCompanyId),
    enabled: open && Boolean(anomalyId && operatingCompanyId),
  });

  const anomaly = detailQuery.data?.anomaly ?? initialAnomaly ?? null;

  const ackMutation = useMutation({
    mutationFn: async () => ackAnomaly(String(anomalyId), operatingCompanyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomalies", operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomaly", operatingCompanyId, anomalyId] });
      onUpdated();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => resolveAnomaly(String(anomalyId), operatingCompanyId, note),
    onSuccess: async () => {
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomalies", operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomaly", operatingCompanyId, anomalyId] });
      onUpdated();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => dismissAnomaly(String(anomalyId), operatingCompanyId, note),
    onSuccess: async () => {
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomalies", operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomaly", operatingCompanyId, anomalyId] });
      onUpdated();
    },
  });

  const DRAWER_TITLE = "Anomaly Detail";

  useEscapeKey(onClose, open && Boolean(anomalyId));

  useEffect(() => {
    if (!open || !anomalyId) return;
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
  }, [open, anomalyId]);

  useEffect(() => {
    if (!open || !anomalyId) return;
    const firstInput = panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea");
    firstInput?.focus();
  }, [open, anomalyId]);

  if (!open || !anomalyId) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={DRAWER_TITLE}
        className="fixed right-0 top-0 z-50 h-full w-[620px] max-w-full overflow-y-auto border-l border-gray-200 bg-white p-4"
        data-testid="anomaly-detail-drawer"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{DRAWER_TITLE}</h3>
          <ModalCloseButton title={DRAWER_TITLE} onClose={onClose} />
        </div>

        {!anomaly ? (
          <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            Loading anomaly details...
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-gray-50 p-3 text-xs">
              <div>
                <span className="font-semibold">Type:</span> {anomaly.anomaly_type}
              </div>
              <div>
                <span className="font-semibold">Severity:</span> {anomaly.severity}
              </div>
              <div>
                <span className="font-semibold">Subject:</span> {anomaly.subject_type}
              </div>
              <div>
                <span className="font-semibold">Subject ID:</span> {anomaly.subject_id}
              </div>
              <div>
                <span className="font-semibold">Detected:</span> {new Date(anomaly.detected_at).toLocaleString()}
              </div>
              <div>
                <span className="font-semibold">Status:</span> {anomaly.status}
              </div>
              <div className="col-span-2">
                <span className="font-semibold">Detector:</span> {anomaly.detector_version}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-gray-700">Evidence</div>
              <pre className="max-h-80 overflow-auto rounded border border-gray-200 bg-slate-950 p-3 text-[11px] text-slate-100">
                {JSON.stringify(anomaly.evidence ?? {}, null, 2)}
              </pre>
            </div>

            <div className="rounded border border-gray-200 bg-white p-3 text-xs">
              <div className="font-semibold text-gray-700">Status-change audit trail</div>
              <div className="mt-2 text-gray-600">
                <div>Status: {anomaly.status}</div>
                <div>Changed at: {anomaly.status_changed_at ? new Date(anomaly.status_changed_at).toLocaleString() : "—"}</div>
                <div>Changed by: {anomaly.status_changed_by ?? "—"}</div>
                <div>Resolution note: {anomaly.resolution_note ?? "—"}</div>
              </div>
            </div>

            <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
              <label className="block text-xs font-semibold text-gray-700" htmlFor="anomaly-resolution-note">
                Resolution note
              </label>
              <textarea
                id="anomaly-resolution-note"
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add context for resolve or dismiss..."
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => ackMutation.mutate()}
                  disabled={ackMutation.isPending || anomaly.status !== "new"}
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => resolveMutation.mutate()}
                  disabled={resolveMutation.isPending || note.trim().length === 0}
                >
                  Resolve
                </button>
                <button
                  type="button"
                  className="rounded bg-amber-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => dismissMutation.mutate()}
                  disabled={dismissMutation.isPending || note.trim().length === 0}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
