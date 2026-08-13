import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { acknowledgeIntegrityAlert, resolveIntegrityAlert, snoozeIntegrityAlert } from "../../../api/safety";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { useEscapeKey } from "../../../hooks/useEscapeKey";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  open: boolean;
  alert: Record<string, unknown> | null;
  operatingCompanyId: string;
  onClose: () => void;
  onUpdated: () => void;
};

const DRAWER_TITLE = "Integrity Alert Detail";

export function IntegrityAlertDetailDrawer({ open, alert, operatingCompanyId, onClose, onUpdated }: Props) {
  // SAF-B24: the panel is now a <div> inside ParityDrawer rather than a bespoke <aside>, so the ref
  // element type follows. Focus behaviour is unchanged.
  const panelRef = useRef<HTMLDivElement>(null);
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
  const snoozeMutation = useMutation({
    mutationFn: () => snoozeIntegrityAlert(String(alert?.id ?? ""), operatingCompanyId, 24),
    onSuccess: onUpdated,
  });

  useEscapeKey(onClose, open && Boolean(alert));

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

  return (
    <>
      {/* SAF-B24: was a bespoke <aside> with its own backdrop, z-index, width, escape handling and
          close button — a second drawer implementation beside the shared one, so every drawer-chrome
          fix had to be made twice and this copy drifted. ParityDrawer is the single surface. The
          panel ref and data-testid are retained so existing focus behaviour and selectors hold. */}
      <ParityDrawer open onClose={onClose} title={DRAWER_TITLE} size="wide">
        <div ref={panelRef} data-testid="integrity-alert-detail-drawer" className="space-y-2 text-sm">
          <div><strong>Category:</strong> {String(alert.alert_category ?? "—")}</div>
          <div><strong>Severity:</strong> {String(alert.severity ?? "—")}</div>
          <div><strong>Subject:</strong> {String(alert.subject_type ?? "—")}</div>
          <div>
            <strong>Driver:</strong>{" "}
            {alert.subject_driver_id ? (
              <EntityLink
                kind="driver"
                id={String(alert.subject_driver_id)}
                label={entityLabel(alert.subject_driver_name, alert.subject_driver_id, "Driver")}
              />
            ) : (
              "—"
            )}
          </div>
          <div>
            <strong>Unit:</strong>{" "}
            {alert.subject_unit_id ? (
              <EntityLink
                kind="unit"
                id={String(alert.subject_unit_id)}
                label={entityLabel(alert.subject_unit_number, alert.subject_unit_id, "Unit")}
              />
            ) : (
              "—"
            )}
          </div>
          <div>
            <strong>Vendor:</strong>{" "}
            {alert.subject_vendor_id ? (
              <EntityLink
                kind="vendor"
                id={String(alert.subject_vendor_id)}
                label={entityLabel(alert.subject_vendor_name, alert.subject_vendor_id, "Vendor")}
              />
            ) : (
              "—"
            )}
          </div>
          <div><strong>Status:</strong> {String(alert.resolution_status ?? "unresolved")}</div>
          <div><strong>Summary:</strong> {String(alert.detection_summary ?? "—")}</div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
            onClick={() => ackMutation.mutate()}
          >
            Acknowledge
          </button>
          <button
            type="button"
            className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0f1729]"
            onClick={() => resolveMutation.mutate()}
          >
            Resolve
          </button>
          <button
            type="button"
            className="rounded-sm border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-800"
            data-testid="integrity-alert-snooze-btn"
            onClick={() => snoozeMutation.mutate()}
          >
            Snooze 24h
          </button>
        </div>
      </ParityDrawer>
    </>
  );
}
