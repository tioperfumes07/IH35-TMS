import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ackAnomaly, dismissAnomaly, getAnomaly, resolveAnomaly, type SafetyAnomaly } from "../../../api/safety";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";
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
  /** @matrix-built modules=safety cols=driver,unit,customer,connectivity,reverse_link */
  // SAF-B24: the panel is now a <div> inside ParityDrawer rather than a bespoke <aside>, so the ref
  // element type follows. Focus behaviour is unchanged.
  const panelRef = useRef<HTMLDivElement>(null);
  const actionGenerationRef = useRef(0);
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const detailQuery = useQuery({
    queryKey: ["safety", "anomaly", operatingCompanyId, anomalyId],
    queryFn: () => getAnomaly(String(anomalyId), operatingCompanyId),
    enabled: open && Boolean(anomalyId && operatingCompanyId),
  });

  const anomaly = detailQuery.data?.anomaly ?? initialAnomaly ?? null;

  const ackMutation = useMutation({
    mutationFn: async (input: { anomalyId: string; companyId: string; generation: number }) => ackAnomaly(input.anomalyId, input.companyId),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomalies", input.companyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomaly", input.companyId, input.anomalyId] });
      onUpdated();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (input: { anomalyId: string; companyId: string; generation: number; note: string }) => resolveAnomaly(input.anomalyId, input.companyId, input.note),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomalies", input.companyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomaly", input.companyId, input.anomalyId] });
      onUpdated();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (input: { anomalyId: string; companyId: string; generation: number; note: string }) => dismissAnomaly(input.anomalyId, input.companyId, input.note),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomalies", input.companyId] });
      await queryClient.invalidateQueries({ queryKey: ["safety", "anomaly", input.companyId, input.anomalyId] });
      onUpdated();
    },
  });
  const resetAckMutation = ackMutation.reset;
  const resetResolveMutation = resolveMutation.reset;
  const resetDismissMutation = dismissMutation.reset;

  const resetActionState = useCallback(() => {
    actionGenerationRef.current += 1;
    setNote("");
    resetAckMutation();
    resetResolveMutation();
    resetDismissMutation();
  }, [resetAckMutation, resetDismissMutation, resetResolveMutation]);

  useEffect(() => {
    resetActionState();
  }, [open, operatingCompanyId, anomalyId, resetActionState]);

  const handleClose = useCallback(() => {
    resetActionState();
    onClose();
  }, [onClose, resetActionState]);

  const DRAWER_TITLE = "Anomaly Detail";

  useEscapeKey(handleClose, open && Boolean(anomalyId));

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
      {/* SAF-B24: was a bespoke <aside> with its own backdrop, z-index, width, escape handling and
          close button — a second drawer implementation beside the shared one, so every drawer-chrome
          fix had to be made twice and this copy drifted. ParityDrawer is the single surface. This one
          was the widest bespoke copy (620px) — size="wide" is the shared equivalent. */}
      <ParityDrawer open onClose={handleClose} title={DRAWER_TITLE} size="wide">
        <div ref={panelRef} data-testid="anomaly-detail-drawer">

        {!anomaly ? (
          <div className="mt-4 rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            Loading anomaly details...
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 rounded-sm border border-gray-200 bg-gray-50 p-3 text-xs">
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
                {/* SAF-B24: the anomaly names a subject and rendered its raw uuid as plain text, so
                    the one record the alert is ABOUT could not be opened from the alert. Every
                    subject_type ("driver" | "unit" | "customer" | "invoice") is a real EntityLink
                    kind, so this drills straight through to the entity under suspicion. */}
                <span className="font-semibold">Subject ID:</span>{" "}
                <EntityLink
                  kind={anomaly.subject_type}
                  id={anomaly.subject_id}
                  label={entityLabel(
                    anomaly.subject_display_name,
                    anomaly.subject_id,
                    anomaly.subject_type === "driver"
                      ? "Driver"
                      : anomaly.subject_type === "unit"
                        ? "Unit"
                        : anomaly.subject_type === "customer"
                          ? "Customer"
                          : anomaly.subject_type === "invoice"
                            ? "Invoice"
                            : "Record"
                  )}
                />
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
              <pre className="max-h-80 overflow-auto rounded-sm border border-gray-200 bg-slate-950 p-3 text-[11px] text-slate-100">
                {JSON.stringify(anomaly.evidence ?? {}, null, 2)}
              </pre>
            </div>

            <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
              <div className="font-semibold text-gray-700">Status-change audit trail</div>
              <div className="mt-2 text-gray-600">
                <div>Status: {anomaly.status}</div>
                <div>Changed at: {anomaly.status_changed_at ? new Date(anomaly.status_changed_at).toLocaleString() : "—"}</div>
                <div>Changed by: {anomaly.status_changed_by ?? "—"}</div>
                <div>Resolution note: {anomaly.resolution_note ?? "—"}</div>
              </div>
            </div>

            <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
              <label className="block text-xs font-semibold text-gray-700" htmlFor="anomaly-resolution-note">
                Resolution note
              </label>
              <textarea
                id="anomaly-resolution-note"
                className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add context for resolve or dismiss..."
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => ackMutation.mutate({ anomalyId: String(anomalyId), companyId: operatingCompanyId, generation: actionGenerationRef.current })}
                  disabled={ackMutation.isPending || anomaly.status !== "new"}
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:opacity-50"
                  onClick={() => resolveMutation.mutate({ anomalyId: String(anomalyId), companyId: operatingCompanyId, generation: actionGenerationRef.current, note })}
                  disabled={resolveMutation.isPending || note.trim().length === 0}
                >
                  Resolve
                </button>
                <button
                  type="button"
                  className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => dismissMutation.mutate({ anomalyId: String(anomalyId), companyId: operatingCompanyId, generation: actionGenerationRef.current, note })}
                  disabled={dismissMutation.isPending || note.trim().length === 0}
                >
                  Dismiss
                </button>
              </div>
              {(ackMutation.isError && ackMutation.variables?.generation === actionGenerationRef.current) ||
              (resolveMutation.isError && resolveMutation.variables?.generation === actionGenerationRef.current) ||
              (dismissMutation.isError && dismissMutation.variables?.generation === actionGenerationRef.current) ? (
                <p className="text-xs text-red-700" data-testid="anomaly-action-error">
                  {userFacingApiError(
                    ackMutation.error ?? resolveMutation.error ?? dismissMutation.error,
                    "Could not update the anomaly.",
                  )}
                </p>
              ) : null}
            </div>
          </div>
        )}
        </div>
      </ParityDrawer>
    </>
  );
}
