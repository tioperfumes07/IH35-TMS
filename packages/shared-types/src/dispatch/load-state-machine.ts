/**
 * Canonical load status state machine — shared by backend dispatch routes and office UI.
 * DO NOT duplicate this table in frontend components (LAW-BLAST-RADIUS-NO-VERTICAL-FIXES).
 */

export type DispatchStatus =
  | "unassigned"
  | "assigned_not_dispatched"
  | "dispatched"
  | "in_transit"
  | "delivered_pending_docs"
  | "completed_docs_received"
  | "cancelled"
  | "abandoned"
  | "driver_walkoff"
  | "driver_no_show";

export const ALLOWED_TRANSITIONS: Record<DispatchStatus, readonly DispatchStatus[]> = {
  unassigned: ["assigned_not_dispatched", "cancelled"],
  assigned_not_dispatched: ["dispatched", "driver_no_show", "cancelled"],
  dispatched: ["in_transit", "driver_no_show", "driver_walkoff", "cancelled"],
  in_transit: ["delivered_pending_docs", "abandoned", "driver_walkoff", "cancelled"],
  delivered_pending_docs: ["completed_docs_received", "cancelled"],
  completed_docs_received: [],
  cancelled: [],
  abandoned: [],
  driver_walkoff: [],
  driver_no_show: [],
};

/** Cancel uses CancelLoadModal — not inline transition buttons. */
export const OFFICE_DRAWER_EXCLUDED_TARGETS: readonly DispatchStatus[] = ["cancelled"];

export const OFFICE_TRANSITION_LABELS: Partial<Record<DispatchStatus, string>> = {
  assigned_not_dispatched: "Mark assigned",
  dispatched: "Mark dispatched",
  in_transit: "Mark in transit",
  delivered_pending_docs: "Mark delivered (pending docs)",
  completed_docs_received: "Mark completed (docs received)",
  driver_no_show: "Mark driver no-show",
  driver_walkoff: "Mark driver walk-off",
  abandoned: "Mark abandoned",
};

export function fromMdataStatus(status: string): DispatchStatus {
  if (status === "draft" || status === "booked" || status === "planned") return "unassigned";
  if (status === "assigned") return "assigned_not_dispatched";
  if (status === "at_pickup") return "dispatched";
  if (status === "at_delivery") return "in_transit";
  if (status === "delivered") return "delivered_pending_docs";
  if (status === "invoiced" || status === "paid" || status === "closed") return "completed_docs_received";
  if (status === "cancelled") return "cancelled";
  if (status === "unassigned") return "unassigned";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  throw new RangeError(`Unknown mdata load status: ${status}`);
}

export function toMdataStatus(status: DispatchStatus): string {
  if (status === "unassigned") return "draft";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  return "cancelled";
}

export function validateLoadStatusTransition(
  currentMdataStatus: string,
  targetStatus: DispatchStatus
): { ok: true } | { ok: false; from: DispatchStatus; to: DispatchStatus } {
  const currentStatus = fromMdataStatus(currentMdataStatus);
  if (!ALLOWED_TRANSITIONS[currentStatus].includes(targetStatus)) {
    return { ok: false, from: currentStatus, to: targetStatus };
  }
  return { ok: true };
}

export function isTerminalLoadStatus(currentMdataStatus: string): boolean {
  return ALLOWED_TRANSITIONS[fromMdataStatus(currentMdataStatus)].length === 0;
}

export function validateLoadStopStatusWrite(
  currentMdataStatus: string,
  targetMdataStatus: string
): { ok: true } | { ok: false; from: DispatchStatus; to: DispatchStatus } {
  const from = fromMdataStatus(currentMdataStatus);
  const to = fromMdataStatus(targetMdataStatus);
  if (to === from || ALLOWED_TRANSITIONS[from].includes(to)) {
    return { ok: true };
  }
  return { ok: false, from, to };
}

export type OfficeTransitionButton = {
  target: DispatchStatus;
  label: string;
  testId: string;
};

export function getOfficeTransitionButtons(currentMdataStatus: string): OfficeTransitionButton[] {
  if (isTerminalLoadStatus(currentMdataStatus)) return [];
  const current = fromMdataStatus(currentMdataStatus);
  return ALLOWED_TRANSITIONS[current]
    .filter((target) => !OFFICE_DRAWER_EXCLUDED_TARGETS.includes(target))
    .map((target) => ({
      target,
      label: OFFICE_TRANSITION_LABELS[target] ?? `Mark ${target.replace(/_/g, " ")}`,
      testId: `load-detail-transition-${target.replace(/_/g, "-")}`,
    }));
}

/** Back-compat aliases for guards/tests that referenced loadCanMark* helpers. */
export function loadCanMarkInTransit(status: string | null | undefined): boolean {
  return getOfficeTransitionButtons(String(status ?? "")).some((b) => b.target === "in_transit");
}

export function loadCanMarkDeliveredPendingDocs(status: string | null | undefined): boolean {
  return getOfficeTransitionButtons(String(status ?? "")).some((b) => b.target === "delivered_pending_docs");
}

export function loadCanMarkCompletedDocsReceived(status: string | null | undefined): boolean {
  return getOfficeTransitionButtons(String(status ?? "")).some((b) => b.target === "completed_docs_received");
}
