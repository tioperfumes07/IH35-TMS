import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { listPartsAssignments } from "../../api/maintenance";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) || 0);
}

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
  const workOrderId = workOrder ? String(workOrder.id ?? "") : "";
  const operatingCompanyId = workOrder ? String(workOrder.operating_company_id ?? "") : "";
  // TASKS-STYLE WRITE-ONLY GAP: parts_invoice_links are created via other flows but this modal
  // never read them back — the section below rendered a static placeholder string forever, no
  // matter how many parts were actually linked. The GET route has no work_order_id filter yet
  // (backend follow-up), so fetch the company's recent links (LIMIT 500 server-side) and filter
  // client-side — real data, not fabricated, at the cost of one shared query instead of a
  // per-work-order one.
  const partsLinksQuery = useQuery({
    queryKey: ["maintenance", "parts-assignments", operatingCompanyId],
    queryFn: () => listPartsAssignments(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });

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
        ? "text-slate-700"
        : roadsideResponse <= 120
          ? "text-slate-600"
          : "text-red-700";

  const displayId = entityLabel(workOrder.display_id, workOrder.id, "Record") ?? "—";
  const modalTitle = displayId !== "—" ? `Work Order Details · ${displayId}` : "Work Order Details";

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} modalKind="work_order_detail" sizePreset="md" resizable>
      <div className="space-y-3 text-xs">
        <ModalSection>
          <div>Display ID: <EntityLink kind="work_order" id={String(workOrder.id ?? "")} label={displayId} /></div>
          <div>
            Source Type: <span className="rounded-sm bg-gray-200 px-1 py-0.5">{sourceType}</span>
          </div>
          <div>Status: {status}</div>
          <div>
            Unit:{" "}
            {workOrder.unit_id ? (
              <EntityLink kind="unit" id={String(workOrder.unit_id)} label={entityLabel(workOrder.unit_number, workOrder.unit_id, "Unit")} />
            ) : (
              "—"
            )}
          </div>
          <div>
            Load:{" "}
            {workOrder.load_id ? (
              <EntityLink
                kind="load"
                id={String(workOrder.load_id)}
                label={entityLabel(workOrder.linked_load_number, workOrder.load_id, "Load")}
              />
            ) : (
              "—"
            )}
          </div>
          <div>
            Driver:{" "}
            {workOrder.driver_id ? (
              <EntityLink
                kind="driver"
                id={String(workOrder.driver_id)}
                label={entityLabel(workOrder.driver_name, workOrder.driver_id, "Driver")}
              />
            ) : (
              "—"
            )}
          </div>
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
            <div>
              Vendor:{" "}
              {workOrder.external_vendor_id ? (
                <EntityLink
                  kind="vendor"
                  id={String(workOrder.external_vendor_id)}
                  label={entityLabel(
                    typeof workOrder.external_vendor_name === "string" ? workOrder.external_vendor_name : null,
                    workOrder.external_vendor_id,
                    "Vendor"
                  )}
                />
              ) : (
                "—"
              )}
            </div>
            <div>WO #: {String(workOrder.external_vendor_wo_number ?? "—")}</div>
            <div>Invoice #: {String(workOrder.external_vendor_invoice_number ?? "—")}</div>
            <div>Invoice Amount: {String(workOrder.external_vendor_invoice_amount ?? "—")}</div>
            <div>R2 PDF Doc ID: {String(workOrder.external_vendor_invoice_doc_id ?? "—")}</div>
          </ModalSection>
        ) : (
          <ModalSection title="Parts Links (IS/IT)">
            {(() => {
              const links = (partsLinksQuery.data ?? []).filter((row) => row.work_order_id === workOrderId);
              if (partsLinksQuery.isLoading) return <div className="text-gray-500">Loading…</div>;
              if (links.length === 0) return <div className="text-gray-600">No parts invoices linked to this work order yet.</div>;
              return (
                <ul className="space-y-1">
                  {links.map((link) => (
                    <li key={link.id} className="flex flex-wrap items-center gap-1">
                      <span>{link.part_description}</span>
                      <span className="text-gray-500">×{link.qty_used}</span>
                      <span className="text-gray-500">·</span>
                      <EntityLink kind="vendor" id={link.vendor_id} label={entityLabel(link.vendor_name, link.vendor_id, "Vendor")} />
                      <span className="text-gray-500">
                        {link.vendor_invoice_number ? `inv ${link.vendor_invoice_number}` : ""} {money(link.vendor_invoice_amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
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
