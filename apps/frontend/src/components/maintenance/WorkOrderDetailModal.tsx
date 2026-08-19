import type { ReactNode } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";
import { listPartsAssignments } from "../../api/maintenance";
import { ListErrorBanner } from "../shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { AddPartsLinkModal } from "./AddPartsLinkModal";

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

/**
 * The `workOrder` prop is `Record<string, unknown>`, so every field reads as `unknown`
 * (and narrows to `{}` inside a truthiness guard). EntityLinkOrTombstone takes
 * `id: string | null | undefined` — it accepts `name: unknown` already, so only ids need this.
 * Narrow at runtime rather than casting: a non-string id becomes null, and the component
 * renders its "—" fallback instead of building a dead link out of an object.
 */
function asEntityId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

export function WorkOrderDetailModal({ open, workOrder, canRefreshDisplayId, onRefreshDisplayId, onComplete, onClose }: Props) {
  const [addPartsLinkOpen, setAddPartsLinkOpen] = useState(false);
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
    queryFn: () => listPartsAssignments(operatingCompanyId, { work_order_id: workOrderId }),
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

  const displayId = entityLabel(workOrder.display_id, workOrder.id, "Work order");
  const modalTitle = displayId !== "—" ? `Work Order Details · ${displayId}` : "Work Order Details";

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} modalKind="work_order_detail" sizePreset="md" resizable>
      <div className="space-y-3 text-xs">
        <ModalSection>
          <div>
            Display ID:{" "}
            <EntityLinkOrTombstone kind="work_order" id={asEntityId(workOrder.id)} name={workOrder.display_id} noun="Work order" />
          </div>
          <div>
            Source Type: <span className="rounded-sm bg-gray-200 px-1 py-0.5">{sourceType}</span>
          </div>
          <div>Status: {status}</div>
          <div>
            Unit:{" "}
            {workOrder.unit_id ? (
              <EntityLinkOrTombstone kind="unit" id={asEntityId(workOrder.unit_id)} name={workOrder.unit_number} noun="Unit" />
            ) : (
              "—"
            )}
          </div>
          <div>
            Load:{" "}
            {workOrder.load_id ? (
              <EntityLinkOrTombstone
                kind="load"
                id={asEntityId(workOrder.load_id)}
                name={workOrder.linked_load_number}
                noun="Load"
              />
            ) : (
              "—"
            )}
          </div>
          <div>
            Driver:{" "}
            {workOrder.driver_id ? (
              <EntityLinkOrTombstone
                kind="driver"
                id={asEntityId(workOrder.driver_id)}
                name={workOrder.driver_name}
                noun="Driver"
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

        {workOrder.source_intransit_issue_id ? (
          <ModalSection title="Source In-Transit Issue">
            <div>
              <Link
                className="font-semibold text-slate-700 hover:underline"
                to={`/dispatch/in-transit-issues?issue_id=${encodeURIComponent(String(workOrder.source_intransit_issue_id))}`}
              >
                View source issue in Dispatch
              </Link>
            </div>
            <div>Category: {String(workOrder.source_intransit_issue_category ?? "—")}</div>
            <div>Severity: {String(workOrder.source_intransit_issue_severity ?? "—")}</div>
            <div>Reported: {formatDateTime(workOrder.source_intransit_issue_reported_at)}</div>
            <div>Location: {String(workOrder.source_intransit_issue_gps_label ?? "—")}</div>
            <div>Description: {String(workOrder.source_intransit_issue_description ?? "—")}</div>
          </ModalSection>
        ) : null}

        {isExternal ? (
          <ModalSection title="External Vendor Invoice">
            <div>
              Vendor:{" "}
              {workOrder.resolved_vendor_id ? (
                <EntityLinkOrTombstone
                  kind="vendor"
                  id={asEntityId(workOrder.resolved_vendor_id)}
                  name={workOrder.resolved_vendor_name}
                  noun="Vendor"
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
          <ModalSection>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Parts Links (IS/IT)</p>
              {!["complete", "completed"].includes(status) ? (
                <Button variant="secondary" size="sm" onClick={() => setAddPartsLinkOpen(true)}>
                  + Add parts link
                </Button>
              ) : null}
            </div>
            {(() => {
              const links = partsLinksQuery.data ?? [];
              if (partsLinksQuery.isLoading) return <div className="text-gray-500">Loading…</div>;
              if (partsLinksQuery.isError) {
                return (
                  <ListErrorBanner
                    message={userFacingApiError(partsLinksQuery.error, "Couldn't load parts linked to this work order")}
                    onRetry={() => void partsLinksQuery.refetch()}
                  />
                );
              }
              if (links.length === 0) return <div className="text-gray-600">No parts invoices linked to this work order yet.</div>;
              return (
                <ul className="space-y-1">
                  {links.map((link) => (
                    <li key={link.id} className="flex flex-wrap items-center gap-1">
                      <span>{link.part_description}</span>
                      <span className="text-gray-500">×{link.qty_used}</span>
                      <span className="text-gray-500">·</span>
                      <EntityLinkOrTombstone
                        kind="vendor"
                        id={link.vendor_id}
                        name={link.vendor_name}
                        noun="Vendor"
                      />
                      <span className="text-gray-500">
                        {link.vendor_invoice_number ? `inv ${link.vendor_invoice_number}` : ""} {money(link.vendor_invoice_amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <AddPartsLinkModal
              open={addPartsLinkOpen}
              workOrderId={workOrderId}
              operatingCompanyId={operatingCompanyId}
              onClose={() => {
                setAddPartsLinkOpen(false);
                void partsLinksQuery.refetch();
              }}
            />
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
