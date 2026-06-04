import type { ReactNode } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  workOrder: Record<string, unknown> | null;
  canRefreshDisplayId?: boolean;
  onRefreshDisplayId?: () => void;
  onComplete?: () => void;
  onClose: () => void;
};

function formatDateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatDuration(secondsValue: unknown) {
  const seconds = Number(secondsValue ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function ModalSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-1 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
      {title ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p> : null}
      {children}
    </section>
  );
}

export function WorkOrderDetailModal({ open, workOrder, canRefreshDisplayId, onRefreshDisplayId, onComplete, onClose }: Props) {
  if (!open || !workOrder) return null;

  const sourceType = String(workOrder.source_type ?? "—");
  const status = String(workOrder.status ?? "open");
  const isExternal = ["ES", "AC", "ET", "RT", "RS"].includes(sourceType);
  const canMarkComplete = Boolean(workOrder.v5_suffix) && String(workOrder.v5_suffix) !== "PEND0";
  const roadsideResponse = Number(workOrder.roadside_response_minutes ?? 0);
  const roadsideTone =
    roadsideResponse <= 0
      ? "text-gray-700"
      : roadsideResponse < 60
        ? "text-emerald-700"
        : roadsideResponse <= 120
          ? "text-amber-700"
          : "text-red-700";

  const displayId = String(workOrder.display_id ?? "—");
  const modalTitle = displayId !== "—" ? `Work Order Details · ${displayId}` : "Work Order Details";

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} modalKind="work_order_detail" sizePreset="md" resizable>
      <div className="space-y-3 text-xs">
        <ModalSection>
          <div>Display ID: {displayId}</div>
          <div>
            Source Type: <span className="rounded bg-gray-200 px-1 py-0.5">{sourceType}</span>
          </div>
          <div>Status: {status}</div>
          <div>Opened: {formatDateTime(workOrder.opened_at)}</div>
          <div>Closed: {formatDateTime(workOrder.closed_at)}</div>
          <div>Duration: {formatDuration(workOrder.duration_seconds)}</div>
          <div className={roadsideTone}>Roadside response: {roadsideResponse > 0 ? `${roadsideResponse} min` : "—"}</div>
          <div>V5: {String(workOrder.v5_suffix ?? "—")}</div>
          <div>Legacy ID: {String(workOrder.legacy_display_id ?? "—")}</div>
          <div>Cost (total): {String(workOrder.total_actual_cost ?? "0")}</div>
        </ModalSection>

        {isExternal ? (
          <ModalSection title="External Vendor Invoice">
            <div>Vendor: {String(workOrder.external_vendor_id ?? "—")}</div>
            <div>WO #: {String(workOrder.external_vendor_wo_number ?? "—")}</div>
            <div>Invoice #: {String(workOrder.external_vendor_invoice_number ?? "—")}</div>
            <div>Invoice Amount: {String(workOrder.external_vendor_invoice_amount ?? "—")}</div>
            <div>R2 PDF Doc ID: {String(workOrder.external_vendor_invoice_doc_id ?? "—")}</div>
          </ModalSection>
        ) : (
          <ModalSection title="Parts Links (IS/IT)">
            <div className="text-gray-600">Linked parts invoices render here from maintenance.parts_invoice_links.</div>
          </ModalSection>
        )}

        <ModalSection title="Audit History">
          <div className="text-gray-600">Display ID changes and completion actions are available in audit events.</div>
        </ModalSection>

        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {canRefreshDisplayId ? (
            <Button size="sm" variant="secondary" onClick={onRefreshDisplayId}>
              Refresh Display ID
            </Button>
          ) : null}
          <Button size="sm" onClick={onComplete} disabled={!canMarkComplete} title={canMarkComplete ? "" : "Cannot mark completed while V5 is PEND0"}>
            Mark Completed
          </Button>
        </div>
      </div>
    </Modal>
  );
}
