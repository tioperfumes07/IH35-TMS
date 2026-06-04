import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { acknowledgeIntegrityAlert, resolveIntegrityAlert } from "../../../api/safety";
import { ModalCloseButton } from "../../../components/ModalCloseButton";
import { useEscapeKey } from "../../../hooks/useEscapeKey";

type Props = {
  open: boolean;
  alert: Record<string, unknown> | null;
  operatingCompanyId: string;
  onClose: () => void;
  onUpdated: () => void;
};

const DRAWER_TITLE = "Integrity Alert Detail";

export function IntegrityAlertDetailDrawer({ open, alert, operatingCompanyId, onClose, onUpdated }: Props) {
  const panelRef = useRef<HTMLElement>(null);
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
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={DRAWER_TITLE}
        className="fixed right-0 top-0 z-50 h-full w-[560px] max-w-full overflow-y-auto border-l border-gray-200 bg-white p-4"
        data-testid="integrity-alert-detail-drawer"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{DRAWER_TITLE}</h3>
          <ModalCloseButton title={DRAWER_TITLE} onClose={onClose} />
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
