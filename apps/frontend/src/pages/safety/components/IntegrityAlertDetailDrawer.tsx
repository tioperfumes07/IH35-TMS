import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { acknowledgeIntegrityAlert, resolveIntegrityAlert, snoozeIntegrityAlert } from "../../../api/safety";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { EntityLink } from "../../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { entityLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  open: boolean;
  alert: Record<string, unknown> | null;
  operatingCompanyId: string;
  onClose: () => void;
  onUpdated: () => void;
};

const DRAWER_TITLE = "Integrity Alert Detail";

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function metricEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, metric]) => [
    key.replaceAll("_", " "),
    metric && typeof metric === "object" ? JSON.stringify(metric) : String(metric ?? "—"),
  ]);
}

export function IntegrityAlertDetailDrawer({ open, alert, operatingCompanyId, onClose, onUpdated }: Props) {
  /** @matrix-built modules=safety cols=driver,unit,vendor,load,connectivity,reverse_link */
  // SAF-B24: the panel is now a <div> inside ParityDrawer rather than a bespoke <aside>, so the ref
  // element type follows. Focus behaviour is unchanged.
  const panelRef = useRef<HTMLDivElement>(null);
  const actionGenerationRef = useRef(0);
  const ackMutation = useMutation({
    mutationFn: (input: { alertId: string; companyId: string; generation: number }) => acknowledgeIntegrityAlert(input.alertId, input.companyId, "Acknowledged in Safety UI"),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      onUpdated();
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (input: { alertId: string; companyId: string; generation: number }) =>
      resolveIntegrityAlert(input.alertId, input.companyId, {
        resolution_status: "confirmed_action_taken",
        resolution_action: "Resolved in Safety UI",
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      onUpdated();
    },
  });
  const snoozeMutation = useMutation({
    mutationFn: (input: { alertId: string; companyId: string; generation: number }) => snoozeIntegrityAlert(input.alertId, input.companyId, 24),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      onUpdated();
    },
  });
  const resetAckMutation = ackMutation.reset;
  const resetResolveMutation = resolveMutation.reset;
  const resetSnoozeMutation = snoozeMutation.reset;

  const resetActionState = useCallback(() => {
    actionGenerationRef.current += 1;
    resetAckMutation();
    resetResolveMutation();
    resetSnoozeMutation();
  }, [resetAckMutation, resetResolveMutation, resetSnoozeMutation]);

  useEffect(() => {
    resetActionState();
  }, [open, operatingCompanyId, alert?.id, resetActionState]);

  const actionPending = ackMutation.isPending || resolveMutation.isPending || snoozeMutation.isPending;
  const handleClose = useCallback(() => {
    if (actionPending) return;
    resetActionState();
    onClose();
  }, [actionPending, onClose, resetActionState]);

  useEffect(() => {
    if (!open || !alert) return;
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
  }, [open, alert]);

  useEffect(() => {
    if (!open || !alert) return;
    const firstInput = panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea");
    firstInput?.focus();
  }, [open, alert]);

  if (!open || !alert) return null;

  const loadIds = idList(alert.related_load_ids);
  const workOrderIds = idList(alert.related_wo_ids);
  const metrics = metricEntries(alert.detection_metric);

  return (
    <>
      {/* SAF-B24: was a bespoke <aside> with its own backdrop, z-index, width, escape handling and
          close button — a second drawer implementation beside the shared one, so every drawer-chrome
          fix had to be made twice and this copy drifted. ParityDrawer is the single surface. The
          panel ref and data-testid are retained so existing focus behaviour and selectors hold. */}
      <ParityDrawer open onClose={handleClose} title={DRAWER_TITLE} size="wide">
        <div ref={panelRef} data-testid="integrity-alert-detail-drawer" className="space-y-2 text-sm">
          <div><strong>Category:</strong> {String(alert.alert_category ?? "—")}</div>
          <div><strong>Severity:</strong> {String(alert.severity ?? "—")}</div>
          <div><strong>Subject:</strong> {String(alert.subject_type ?? "—")}</div>
          <div>
            <strong>Driver:</strong>{" "}
            <EntityLinkOrTombstone
              kind="driver"
              id={alert.subject_driver_id == null ? null : String(alert.subject_driver_id)}
              name={alert.subject_driver_name}
              noun="Driver"
            />
          </div>
          <div>
            <strong>Unit:</strong>{" "}
            <EntityLinkOrTombstone
              kind="unit"
              id={alert.subject_unit_id == null ? null : String(alert.subject_unit_id)}
              name={alert.subject_unit_number}
              noun="Unit"
            />
          </div>
          <div>
            <strong>Vendor:</strong>{" "}
            <EntityLinkOrTombstone
              kind="vendor"
              id={alert.subject_vendor_id == null ? null : String(alert.subject_vendor_id)}
              name={alert.subject_vendor_name}
              noun="Vendor"
            />
          </div>
          <div><strong>Status:</strong> {String(alert.resolution_status ?? "unresolved")}</div>
          <div><strong>Summary:</strong> {String(alert.detection_summary ?? "—")}</div>
          <div><strong>Source:</strong> {String(alert.source_view ?? "—")}</div>
          <div><strong>Created:</strong> {String(alert.created_at ?? "—")}</div>
          {metrics.length > 0 ? (
            <div>
              <strong>Detection metrics:</strong>
              <dl className="mt-1 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-1 rounded-sm bg-slate-50 p-2 text-xs">
                {metrics.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="font-medium capitalize text-slate-600">{key}</dt>
                    <dd className="break-words text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {loadIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <strong>Related loads:</strong>
              {loadIds.map((id) => (
                <EntityLink key={id} kind="load" id={id} label={entityLabel(null, id, "Load")} />
              ))}
            </div>
          ) : null}
          {workOrderIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <strong>Related work orders:</strong>
              {workOrderIds.map((id) => (
                <EntityLink key={id} kind="work_order" id={id} label={entityLabel(null, id, "Work order")} />
              ))}
            </div>
          ) : null}
        </div>
        {(ackMutation.isError && ackMutation.variables?.generation === actionGenerationRef.current) ||
        (resolveMutation.isError && resolveMutation.variables?.generation === actionGenerationRef.current) ||
        (snoozeMutation.isError && snoozeMutation.variables?.generation === actionGenerationRef.current) ? (
          <p className="mt-3 text-xs text-red-700" data-testid="integrity-alert-action-error">
            {userFacingApiError(
              ackMutation.error ?? resolveMutation.error ?? snoozeMutation.error,
              "Could not update the integrity alert.",
            )}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            disabled={actionPending}
            onClick={() => ackMutation.mutate({ alertId: String(alert.id), companyId: operatingCompanyId, generation: actionGenerationRef.current })}
          >
            Acknowledge
          </button>
          <button
            type="button"
            className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0f1729]"
            disabled={actionPending}
            onClick={() => resolveMutation.mutate({ alertId: String(alert.id), companyId: operatingCompanyId, generation: actionGenerationRef.current })}
          >
            Resolve
          </button>
          <button
            type="button"
            className="rounded-sm border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-800"
            data-testid="integrity-alert-snooze-btn"
            disabled={actionPending}
            onClick={() => snoozeMutation.mutate({ alertId: String(alert.id), companyId: operatingCompanyId, generation: actionGenerationRef.current })}
          >
            Snooze 24h
          </button>
        </div>
      </ParityDrawer>
    </>
  );
}
